import logging
import secrets
from datetime import timedelta

from django.conf import settings
from django.db import models, transaction
from django.utils import timezone
from rest_framework.exceptions import APIException
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken

from apps.common.exceptions import BusinessRuleError

from .models import PhoneOTP, User
from .otp_delivery import OTPDeliveryError, deliver_code

logger = logging.getLogger(__name__)


class OTPUnavailable(APIException):
    status_code = 503
    default_detail = "Impossible d'envoyer le code pour le moment. Réessayez dans quelques minutes."
    default_code = "otp_unavailable"


def _config(key):
    return settings.CARGOCONNECT[key]


def _otp_allowed(*, phone: str, purpose: str) -> bool:
    """
    Faut-il envoyer un code à ce numéro ? Chaque message WhatsApp est facturé et peut servir à harceler
    un numéro : on n'écrit qu'aux comptes concernés, et pas plus de N fois par heure et par numéro,
    quelle que soit l'adresse IP de la demande (la limite par IP se contourne en changeant d'adresse).
    """
    accounts = User.objects.filter(phone=phone, is_active=True)
    if purpose == PhoneOTP.Purpose.VERIFY_PHONE:
        accounts = accounts.filter(phone_verified=False)
    if not accounts.exists():
        return False
    now = timezone.now()
    recent = PhoneOTP.objects.filter(phone=phone, created_at__gte=now - timedelta(hours=1))
    if recent.count() >= _config("OTP_MAX_PER_PHONE_PER_HOUR"):
        logger.warning("Codes : limite horaire atteinte pour %s", phone)
        return False
    if recent.filter(created_at__gte=now - timedelta(seconds=_config("OTP_RESEND_DELAY_SECONDS"))).exists():
        return False  # double appui ou renvoi trop rapide : le code précédent est encore en route
    return True


def request_otp(*, phone: str, purpose: str) -> None:
    """
    Génère et envoie un code. Silencieux si le compte n'existe pas ou si la limite est atteinte :
    la réponse est toujours la même, ce qui empêche de deviner les numéros inscrits.
    """
    if not _otp_allowed(phone=phone, purpose=purpose):
        return
    length = _config("OTP_LENGTH")
    code = f"{secrets.randbelow(10**length):0{length}d}"
    otp = PhoneOTP(phone=phone, purpose=purpose, expires_at=timezone.now() + timedelta(minutes=_config("OTP_TTL_MINUTES")))
    otp.set_code(code)
    otp.save()
    try:
        deliver_code(phone, code)
    except OTPDeliveryError as exc:
        otp.delete()  # un code jamais reçu ne doit pas rester valide
        raise OTPUnavailable() from exc


def consume_otp(*, phone: str, purpose: str, code: str) -> None:
    # L'erreur est levée après la transaction : un essai raté doit rester compté (sinon la limite
    # de 5 essais serait annulée par le rollback et le code pourrait être deviné).
    if not _try_otp(phone=phone, purpose=purpose, code=code):
        raise BusinessRuleError("Code incorrect.", code="otp_invalid")


@transaction.atomic
def _try_otp(*, phone: str, purpose: str, code: str) -> bool:
    otp = (
        PhoneOTP.objects.select_for_update()
        .filter(phone=phone, purpose=purpose, used_at__isnull=True, expires_at__gt=timezone.now())
        .order_by("-created_at")
        .first()
    )
    if otp is None or otp.attempts >= _config("OTP_MAX_ATTEMPTS"):
        raise BusinessRuleError("Code expiré ou invalide. Demandez un nouveau code.", code="otp_invalid")
    if not otp.check_code(code):
        otp.attempts += 1
        otp.save(update_fields=["attempts"])
        return False
    otp.used_at = timezone.now()
    otp.save(update_fields=["used_at"])
    return True


@transaction.atomic
def deactivate_user(user: User, *, reason: str) -> int:
    """
    Suspension par l'équipe ou désactivation par l'utilisateur. Le compte ne doit plus rien laisser d'actif
    sur la place de marché : ses propositions en attente sont retirées, ses annonces ouvertes annulées
    (les chauffeurs concernés sont prévenus) et tous ses appareils sont déconnectés.
    Renvoie le nombre de transports en cours, que l'équipe doit suivre elle-même.
    """
    from apps.cargos.models import CargoStatus
    from apps.cargos.services import cancel_cargo
    from apps.offers.models import OfferStatus
    from apps.shipments.models import Shipment, ShipmentStatus

    user.is_active = False
    user.save(update_fields=["is_active"])
    if user.is_driver:
        user.driver_profile.offers.filter(status=OfferStatus.PENDING).update(
            status=OfferStatus.WITHDRAWN, updated_at=timezone.now()
        )
    for cargo in user.cargos.filter(status__in=[CargoStatus.DRAFT, CargoStatus.PUBLISHED]):
        cancel_cargo(cargo, reason=reason)
    revoke_all_sessions(user)
    open_statuses = [ShipmentStatus.CONFIRMED, ShipmentStatus.LOADED, ShipmentStatus.IN_TRANSIT, ShipmentStatus.DELIVERED, ShipmentStatus.DISPUTED]
    return (
        Shipment.objects.filter(status__in=open_statuses)
        .filter(models.Q(client=user) | models.Q(driver__user=user))
        .count()
    )


DELETED_NAME = "Compte supprimé"


@transaction.atomic
def delete_account(user: User) -> None:
    """
    Suppression du compte à la demande de son titulaire (exigée par Apple et la loi 09-08).

    Les données personnelles sont effacées : nom, téléphone, e-mail, photo, pièces d'identité, justificatifs
    et notifications. Les transports terminés restent, anonymisés, car ils sont aussi l'historique de
    l'autre partie (avis, preuves de livraison). Le numéro redevient libre pour une nouvelle inscription.
    """
    from apps.drivers.models import DriverDocument
    from apps.shipments.services import OPEN_STATUSES
    from apps.shipments.models import Shipment

    if user.is_staff:
        raise BusinessRuleError(
            "Les comptes de l'équipe se suppriment depuis l'administration web.", code="staff_account"
        )
    if Shipment.objects.filter(status__in=OPEN_STATUSES).filter(models.Q(client=user) | models.Q(driver__user=user)).exists():
        raise BusinessRuleError(
            "Impossible de supprimer le compte tant qu'un transport est en cours. Terminez-le ou contactez l'équipe.",
            code="active_shipments",
        )

    deactivate_user(user, reason="Compte supprimé par son titulaire.")

    # Fichiers personnels : effacés du stockage une fois la suppression validée en base.
    files = [user.avatar] if user.avatar else []
    identity = getattr(user, "client_identity", None)
    if identity is not None:
        files += [doc.file for doc in identity.documents.all()]
        identity.delete()  # pièces et numéros CIN / ICE
    if user.is_driver:
        profile = user.driver_profile
        documents = DriverDocument.objects.filter(driver=profile)
        files += [doc.file for doc in documents]
        documents.delete()
        profile.company_name = ""
        profile.bio = ""
        profile.save(update_fields=["company_name", "bio", "updated_at"])
        # Les camions restent liés aux transports passés, mais ne sont plus utilisables.
        profile.vehicles.update(is_active=False)
    transaction.on_commit(lambda: [f.storage.delete(f.name) for f in files if f and f.name])

    user.notifications.all().delete()
    user.push_tokens.all().delete()
    PhoneOTP.objects.filter(phone=user.phone).delete()

    user.full_name = DELETED_NAME
    user.phone = f"del-{secrets.token_hex(6)}"  # identifiant unique et inutilisable ; le vrai numéro est libéré
    user.email = ""
    user.avatar = None
    user.phone_verified = False
    user.deleted_at = timezone.now()
    user.set_unusable_password()
    user.save()


def revoke_all_sessions(user: User) -> None:
    """Déconnecte tous les appareils : chaque jeton de rafraîchissement encore valide est mis en liste noire.

    Les jetons d'accès déjà émis restent utilisables jusqu'à leur expiration (30 minutes au plus).
    """
    outstanding = OutstandingToken.objects.filter(user=user, expires_at__gt=timezone.now(), blacklistedtoken__isnull=True)
    BlacklistedToken.objects.bulk_create([BlacklistedToken(token=token) for token in outstanding], ignore_conflicts=True)
