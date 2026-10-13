from datetime import datetime, time, timedelta

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from apps.common.exceptions import BusinessRuleError
from apps.notifications.services import notify
from apps.offers.models import OfferStatus

from .models import Cargo, CargoStatus


def _expiry_for(loading_date) -> datetime:
    days = settings.CARGOCONNECT["CARGO_EXPIRY_DAYS_AFTER_LOADING"]
    return timezone.make_aware(datetime.combine(loading_date + timedelta(days=days), time.max))


def is_editable(cargo: Cargo) -> bool:
    """Brouillon : toujours. Publiée : seulement tant qu'aucune offre active n'a été reçue."""
    if cargo.status == CargoStatus.DRAFT:
        return True
    if cargo.status == CargoStatus.PUBLISHED:
        return not cargo.offers.filter(status=OfferStatus.PENDING).exists()
    return False


@transaction.atomic
def publish_cargo(cargo: Cargo) -> Cargo:
    cargo = Cargo.objects.select_for_update().get(pk=cargo.pk)
    if cargo.status != CargoStatus.DRAFT:
        raise BusinessRuleError("Seul un brouillon peut être publié.", code="cargo_not_draft")
    if cargo.loading_date < timezone.localdate():
        raise BusinessRuleError("La date de chargement est déjà passée.", code="loading_date_past")
    cargo.status = CargoStatus.PUBLISHED
    cargo.published_at = timezone.now()
    cargo.expires_at = _expiry_for(cargo.loading_date)
    cargo.save(update_fields=["status", "published_at", "expires_at", "updated_at"])
    return cargo


def refresh_expiry(cargo: Cargo) -> None:
    if cargo.status == CargoStatus.PUBLISHED:
        cargo.expires_at = _expiry_for(cargo.loading_date)


def _close_pending_offers(cargo: Cargo, *, reason_title: str, reason_body: str) -> None:
    pending = list(cargo.offers.filter(status=OfferStatus.PENDING).select_related("driver__user"))
    cargo.offers.filter(pk__in=[o.pk for o in pending]).update(status=OfferStatus.CLOSED, updated_at=timezone.now())
    for offer in pending:
        notify(
            offer.driver.user,
            kind="offer_closed",
            title=reason_title,
            body=reason_body,
            data={"cargo_id": str(cargo.pk), "offer_id": str(offer.pk)},
        )


@transaction.atomic
def cancel_cargo(cargo: Cargo, *, reason: str = "") -> Cargo:
    cargo = Cargo.objects.select_for_update().get(pk=cargo.pk)
    if cargo.status not in (CargoStatus.DRAFT, CargoStatus.PUBLISHED):
        raise BusinessRuleError(
            "Cette annonce ne peut plus être annulée. Si un transport est confirmé, annulez le transport.",
            code="cargo_not_cancellable",
        )
    cargo.status = CargoStatus.CANCELLED
    cargo.cancelled_at = timezone.now()
    cargo.cancel_reason = reason
    cargo.save(update_fields=["status", "cancelled_at", "cancel_reason", "updated_at"])
    _close_pending_offers(
        cargo, reason_title="Annonce annulée", reason_body=f"L'annonce « {cargo.title} » a été annulée par le client."
    )
    return cargo


def expire_stale_cargos() -> int:
    """À lancer périodiquement (commande `periodic_tasks`)."""
    count = 0
    stale_ids = Cargo.objects.filter(status=CargoStatus.PUBLISHED, expires_at__lt=timezone.now()).values_list(
        "pk", flat=True
    )
    for cargo_id in stale_ids:
        with transaction.atomic():
            cargo = Cargo.objects.select_for_update().get(pk=cargo_id)
            if cargo.status != CargoStatus.PUBLISHED:
                continue
            cargo.status = CargoStatus.EXPIRED
            cargo.save(update_fields=["status", "updated_at"])
            _close_pending_offers(
                cargo, reason_title="Annonce expirée", reason_body=f"L'annonce « {cargo.title} » a expiré."
            )
            notify(
                cargo.client,
                kind="cargo_expired",
                title="Annonce expirée",
                body=f"Votre annonce « {cargo.title} » a expiré sans être attribuée.",
                data={"cargo_id": str(cargo.pk)},
            )
            count += 1
    return count
