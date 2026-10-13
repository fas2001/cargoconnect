from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from apps.cargos.models import CargoStatus
from apps.common.exceptions import BusinessRuleError
from apps.notifications.services import notify

from .models import Shipment, ShipmentEvent, ShipmentStatus

S = ShipmentStatus
DRIVER, CLIENT = "driver", "client"

# (statut actuel, nouveau statut) -> rôles autorisés à faire la transition
TRANSITIONS: dict[tuple[str, str], set[str]] = {
    (S.CONFIRMED, S.LOADED): {DRIVER},
    (S.CONFIRMED, S.CANCELLED): {DRIVER, CLIENT},
    (S.LOADED, S.IN_TRANSIT): {DRIVER},
    (S.LOADED, S.DISPUTED): {DRIVER, CLIENT},
    (S.IN_TRANSIT, S.DELIVERED): {DRIVER},
    (S.IN_TRANSIT, S.DISPUTED): {DRIVER, CLIENT},
    (S.DELIVERED, S.COMPLETED): {CLIENT},
    (S.DELIVERED, S.DISPUTED): {DRIVER, CLIENT},
}

# Transitions qui exigent une explication.
NOTE_REQUIRED = {S.CANCELLED, S.DISPUTED}

TIMESTAMP_FIELD = {S.LOADED: "loaded_at", S.DELIVERED: "delivered_at", S.COMPLETED: "completed_at"}

STATUS_MESSAGES = {
    S.LOADED: "La marchandise a été chargée.",
    S.IN_TRANSIT: "La marchandise est en route.",
    S.DELIVERED: "Le chauffeur a déclaré la livraison. Merci de la confirmer.",
    S.COMPLETED: "La livraison a été confirmée.",
    S.CANCELLED: "Le transport a été annulé.",
    S.DISPUTED: "Un litige a été ouvert sur ce transport.",
}


def role_of(user, shipment: Shipment) -> str | None:
    if shipment.client_id == user.pk:
        return CLIENT
    if shipment.driver.user_id == user.pk:
        return DRIVER
    return None


def allowed_transitions(shipment: Shipment, role: str | None) -> list[str]:
    return [to for (frm, to), roles in TRANSITIONS.items() if frm == shipment.status and role in roles]


def _apply(shipment: Shipment, to_status: str, *, actor, note: str) -> Shipment:
    from_status = shipment.status
    shipment.status = to_status
    update_fields = ["status", "updated_at"]
    if to_status in TIMESTAMP_FIELD:
        setattr(shipment, TIMESTAMP_FIELD[to_status], timezone.now())
        update_fields.append(TIMESTAMP_FIELD[to_status])
    shipment.save(update_fields=update_fields)
    ShipmentEvent.objects.create(
        shipment=shipment, from_status=from_status, to_status=to_status, actor=actor, note=note
    )
    if to_status == S.COMPLETED:
        cargo = shipment.cargo
        cargo.status = CargoStatus.COMPLETED
        cargo.save(update_fields=["status", "updated_at"])
    elif to_status == S.CANCELLED:
        cargo = shipment.cargo
        cargo.status = CargoStatus.CANCELLED
        cargo.cancelled_at = timezone.now()
        cargo.cancel_reason = note
        cargo.save(update_fields=["status", "cancelled_at", "cancel_reason", "updated_at"])
    return shipment


@transaction.atomic
def change_status(*, shipment: Shipment, user, to_status: str, note: str = "") -> Shipment:
    shipment = Shipment.objects.select_for_update().select_related("driver__user", "client", "cargo").get(
        pk=shipment.pk
    )
    role = role_of(user, shipment)
    if role is None:
        raise BusinessRuleError("Vous ne participez pas à ce transport.", code="not_participant")
    if role not in TRANSITIONS.get((shipment.status, to_status), set()):
        raise BusinessRuleError(
            f"Passage de « {shipment.get_status_display()} » à « {S(to_status).label} » non autorisé.",
            code="invalid_transition",
        )
    if to_status in NOTE_REQUIRED and not note.strip():
        raise BusinessRuleError("Merci d'indiquer le motif.", code="note_required")

    _apply(shipment, to_status, actor=user, note=note)

    other = shipment.client if role == DRIVER else shipment.driver.user
    notify(
        other,
        kind=f"shipment_{to_status}",
        title=shipment.cargo.title,
        body=STATUS_MESSAGES[to_status],
        data={"shipment_id": str(shipment.pk)},
    )
    return shipment


def auto_complete_deliveries() -> int:
    """Confirme automatiquement les livraisons déclarées sans réponse du client (commande `periodic_tasks`)."""
    hours = settings.CARGOCONNECT["DELIVERY_AUTO_CONFIRM_HOURS"]
    deadline = timezone.now() - timedelta(hours=hours)
    count = 0
    for shipment_id in Shipment.objects.filter(status=S.DELIVERED, delivered_at__lt=deadline).values_list(
        "pk", flat=True
    ):
        with transaction.atomic():
            shipment = Shipment.objects.select_for_update().select_related("driver__user", "cargo").get(
                pk=shipment_id
            )
            if shipment.status != S.DELIVERED:
                continue
            _apply(shipment, S.COMPLETED, actor=None, note=f"Confirmation automatique après {hours} h.")
            for user in (shipment.client, shipment.driver.user):
                notify(
                    user,
                    kind="shipment_completed",
                    title=shipment.cargo.title,
                    body=STATUS_MESSAGES[S.COMPLETED],
                    data={"shipment_id": str(shipment.pk)},
                )
            count += 1
    return count
