import secrets
from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from apps.cargos.models import CargoStatus
from apps.common.exceptions import BusinessRuleError
from apps.notifications.services import notify

from .models import Shipment, ShipmentEvent, ShipmentPhoto, ShipmentStatus

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
# Preuves exigées du chauffeur : photos + position GPS au chargement et à la livraison,
# plus le nom et la signature de la personne qui réceptionne.
PROOF_REQUIRED = {S.LOADED, S.DELIVERED}
SIGNATURE_REQUIRED = {S.DELIVERED}
MAX_PROOF_PHOTOS = 5

TIMESTAMP_FIELD = {S.LOADED: "loaded_at", S.DELIVERED: "delivered_at", S.COMPLETED: "completed_at"}

DELIVERY_CODE_LENGTH = 6
DELIVERY_CODE_MAX_ATTEMPTS = 5

STATUS_MESSAGES = {
    S.LOADED: "La marchandise a été chargée.",
    S.IN_TRANSIT: "La marchandise est en route.",
    S.DELIVERED: "Le chauffeur a déclaré la livraison avec le code du destinataire. Merci de la confirmer.",
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


def _apply(shipment: Shipment, to_status: str, *, actor, note: str, proof: dict | None = None) -> Shipment:
    from_status = shipment.status
    shipment.status = to_status
    update_fields = ["status", "updated_at"]
    if to_status in TIMESTAMP_FIELD:
        setattr(shipment, TIMESTAMP_FIELD[to_status], timezone.now())
        update_fields.append(TIMESTAMP_FIELD[to_status])
    shipment.save(update_fields=update_fields)
    proof = dict(proof or {})
    photos = proof.pop("photos", [])
    event = ShipmentEvent.objects.create(
        shipment=shipment, from_status=from_status, to_status=to_status, actor=actor, note=note, **proof
    )
    for image in photos:
        ShipmentPhoto.objects.create(event=event, image=image)
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


def _check_proof(to_status: str, proof: dict) -> None:
    if to_status not in PROOF_REQUIRED:
        return
    if not proof.get("photos"):
        raise BusinessRuleError("Prenez au moins une photo de la marchandise.", code="photo_required")
    if proof.get("latitude") is None or proof.get("longitude") is None:
        raise BusinessRuleError(
            "La position GPS est nécessaire : activez la localisation de votre téléphone.", code="location_required"
        )
    if to_status in SIGNATURE_REQUIRED and not (proof.get("receiver_name", "").strip() and proof.get("signature")):
        raise BusinessRuleError(
            "Indiquez le nom de la personne qui réceptionne et faites-la signer.", code="signature_required"
        )


DELIVERED_WITHOUT_CODE_MESSAGE = (
    "Le chauffeur a déclaré la livraison sans le code du destinataire. "
    "Confirmez la réception dans l'application, ou signalez un problème."
)


def new_delivery_code() -> str:
    return f"{secrets.randbelow(10**DELIVERY_CODE_LENGTH):0{DELIVERY_CODE_LENGTH}d}"


@transaction.atomic
def _check_delivery_code(shipment_id, user, code: str) -> bool:
    """
    Vérifie le code saisi par le chauffeur. Transaction à part : un essai raté doit rester compté
    même si la déclaration de livraison est ensuite refusée (sinon le code pourrait être deviné).
    """
    shipment = Shipment.objects.select_for_update().select_related("driver").get(pk=shipment_id)
    if role_of(user, shipment) != DRIVER or shipment.status != S.IN_TRANSIT:
        return True  # la transition sera refusée plus loin avec le bon message ; aucun essai consommé
    if not shipment.delivery_code:  # transport créé avant l'arrivée des codes de livraison
        raise BusinessRuleError(
            "Ce transport n'a pas de code de livraison. Déclarez la livraison sans code.", code="delivery_code_missing"
        )
    if shipment.delivery_code_attempts >= DELIVERY_CODE_MAX_ATTEMPTS:
        raise BusinessRuleError(
            "Trop d'essais : le code de livraison est bloqué. Déclarez la livraison sans code, le client devra la confirmer.",
            code="delivery_code_locked",
        )
    if secrets.compare_digest(shipment.delivery_code, code):
        return True
    shipment.delivery_code_attempts += 1
    shipment.save(update_fields=["delivery_code_attempts", "updated_at"])
    return False


def change_status(
    *, shipment: Shipment, user, to_status: str, note: str = "", proof: dict | None = None, delivery_code: str = ""
) -> Shipment:
    with_code = False
    if to_status == S.DELIVERED and delivery_code:
        if not _check_delivery_code(shipment.pk, user, delivery_code):
            raise BusinessRuleError(
                "Code de livraison incorrect. Demandez-le au destinataire, ou déclarez la livraison sans code.",
                code="delivery_code_invalid",
            )
        with_code = True
    return _change_status(shipment=shipment, user=user, to_status=to_status, note=note, proof=proof, with_code=with_code)


@transaction.atomic
def _change_status(*, shipment: Shipment, user, to_status: str, note: str, proof: dict | None, with_code: bool) -> Shipment:
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
    proof = proof or {}
    _check_proof(to_status, proof)
    # Seules les étapes de preuve conservent photos, position et signature.
    kept = proof if to_status in PROOF_REQUIRED else {}

    if to_status == S.DELIVERED:
        shipment.delivered_with_code = with_code
        shipment.save(update_fields=["delivered_with_code", "updated_at"])
    _apply(shipment, to_status, actor=user, note=note, proof=kept)

    other = shipment.client if role == DRIVER else shipment.driver.user
    body = STATUS_MESSAGES[to_status]
    if to_status == S.DELIVERED and not with_code:
        body = DELIVERED_WITHOUT_CODE_MESSAGE
    notify(
        other,
        kind=f"shipment_{to_status}",
        title=shipment.cargo.title,
        body=body,
        data={"shipment_id": str(shipment.pk)},
    )
    return shipment


# Statuts d'un transport encore ouvert, que l'équipe peut clôturer elle-même.
OPEN_STATUSES = [S.CONFIRMED, S.LOADED, S.IN_TRANSIT, S.DELIVERED, S.DISPUTED]
STAFF_OUTCOMES = {S.COMPLETED, S.CANCELLED}


@transaction.atomic
def resolve_by_staff(*, shipment: Shipment, staff, to_status: str, note: str) -> Shipment:
    """
    Décision de l'équipe sur un transport bloqué (litige, chauffeur absent, client qui ne répond pas...) :
    il est clôturé comme livré ou annulé, avec un motif visible des deux parties dans l'historique.
    """
    shipment = Shipment.objects.select_for_update().select_related("driver__user", "client", "cargo").get(
        pk=shipment.pk
    )
    if to_status not in STAFF_OUTCOMES:
        raise BusinessRuleError("Décision possible : livraison confirmée ou annulation.", code="invalid_outcome")
    if shipment.status not in OPEN_STATUSES:
        raise BusinessRuleError("Ce transport est déjà clôturé.", code="shipment_closed")
    if not note.strip():
        raise BusinessRuleError("Merci d'indiquer le motif de la décision.", code="note_required")
    _apply(shipment, to_status, actor=staff, note=f"Décision de l'équipe CargoConnect : {note.strip()}")
    for user in (shipment.client, shipment.driver.user):
        notify(
            user,
            kind=f"shipment_{to_status}",
            title=shipment.cargo.title,
            body=f"L'équipe CargoConnect a clôturé ce transport : {note.strip()}",
            data={"shipment_id": str(shipment.pk)},
        )
    return shipment


def needing_attention():
    """
    Transports que l'équipe doit regarder : litiges, chargement non fait le lendemain de la date prévue,
    trajet anormalement long, ou livraison déclarée sans code que le client ne confirme pas.
    """
    config = settings.CARGOCONNECT
    now = timezone.now()
    return Shipment.objects.filter(
        Q(status=S.DISPUTED)
        | Q(status=S.CONFIRMED, cargo__loading_date__lt=timezone.localdate() - timedelta(days=1))
        | Q(status__in=[S.LOADED, S.IN_TRANSIT], loaded_at__lt=now - timedelta(days=config["SHIPMENT_STALE_TRANSIT_DAYS"]))
        | Q(
            status=S.DELIVERED,
            delivered_with_code=False,
            delivered_at__lt=now - timedelta(hours=config["DELIVERY_AUTO_CONFIRM_HOURS"]),
        )
    )


def auto_complete_deliveries() -> int:
    """
    Confirme automatiquement les livraisons sans réponse du client (commande `periodic_tasks`), seulement
    si le chauffeur a saisi le code du destinataire. Sans code, le silence du client ne vaut pas preuve :
    le transport apparaît dans « À traiter » pour l'équipe (voir `needing_attention`).
    """
    hours = settings.CARGOCONNECT["DELIVERY_AUTO_CONFIRM_HOURS"]
    deadline = timezone.now() - timedelta(hours=hours)
    count = 0
    for shipment_id in Shipment.objects.filter(
        status=S.DELIVERED, delivered_with_code=True, delivered_at__lt=deadline
    ).values_list("pk", flat=True):
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
