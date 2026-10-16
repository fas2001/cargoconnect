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


class OTPUnavailable(APIException):
    status_code = 503
    default_detail = "Impossible d'envoyer le code pour le moment. Réessayez dans quelques minutes."
    default_code = "otp_unavailable"


def _config(key):
    return settings.CARGOCONNECT[key]


def request_otp(*, phone: str, purpose: str) -> None:
    """Génère et envoie un code. Silencieux si le compte n'existe pas (pas d'énumération)."""
    if purpose == PhoneOTP.Purpose.RESET_PASSWORD and not User.objects.filter(phone=phone, is_active=True).exists():
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


def revoke_all_sessions(user: User) -> None:
    """Déconnecte tous les appareils : chaque jeton de rafraîchissement encore valide est mis en liste noire.

    Les jetons d'accès déjà émis restent utilisables jusqu'à leur expiration (30 minutes au plus).
    """
    outstanding = OutstandingToken.objects.filter(user=user, expires_at__gt=timezone.now(), blacklistedtoken__isnull=True)
    BlacklistedToken.objects.bulk_create([BlacklistedToken(token=token) for token in outstanding], ignore_conflicts=True)
