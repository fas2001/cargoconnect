import secrets
from datetime import timedelta

from django.conf import settings
from django.db import transaction
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


def revoke_all_sessions(user: User) -> None:
    """Déconnecte tous les appareils : chaque jeton de rafraîchissement encore valide est mis en liste noire.

    Les jetons d'accès déjà émis restent utilisables jusqu'à leur expiration (30 minutes au plus).
    """
    outstanding = OutstandingToken.objects.filter(user=user, expires_at__gt=timezone.now(), blacklistedtoken__isnull=True)
    BlacklistedToken.objects.bulk_create([BlacklistedToken(token=token) for token in outstanding], ignore_conflicts=True)
