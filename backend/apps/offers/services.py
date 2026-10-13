from django.conf import settings
from django.db import IntegrityError, transaction
from django.utils import timezone

from apps.cargos.models import Cargo, CargoStatus
from apps.common.exceptions import BusinessRuleError
from apps.drivers.services import expired_required_documents, vehicle_insurance_problem
from apps.notifications.services import notify
from apps.shipments.models import Shipment, ShipmentEvent, ShipmentStatus

from .models import Offer, OfferStatus


def _ensure_cargo_open(cargo: Cargo) -> None:
    if cargo.status != CargoStatus.PUBLISHED or (cargo.expires_at and cargo.expires_at < timezone.now()):
        raise BusinessRuleError("Cette annonce n'accepte plus de propositions.", code="cargo_not_open")


@transaction.atomic
def create_offer(*, cargo: Cargo, driver, vehicle=None, price, message: str = "") -> Offer:
    cargo = Cargo.objects.select_for_update().get(pk=cargo.pk)
    _ensure_cargo_open(cargo)
    if cargo.client_id == driver.user_id:
        raise BusinessRuleError("Vous ne pouvez pas proposer un tarif sur votre propre annonce.", code="own_cargo")
    if settings.CARGOCONNECT["REQUIRE_VERIFIED_DRIVER_TO_OFFER"] and not driver.is_verified:
        raise BusinessRuleError(
            "Votre profil doit être vérifié avant de pouvoir envoyer des propositions.", code="driver_not_verified"
        )
    expired = expired_required_documents(driver)
    if expired:
        raise BusinessRuleError(
            f"Votre justificatif « {expired[0].get_doc_type_display()} » a expiré. Envoyez une version à jour depuis votre profil.",
            code="document_expired",
        )
    if vehicle is not None:
        problem = vehicle_insurance_problem(vehicle)
        if problem:
            raise BusinessRuleError(problem, code="vehicle_insurance")
    if Offer.objects.filter(cargo=cargo, driver=driver, status=OfferStatus.PENDING).exists():
        raise BusinessRuleError(
            "Vous avez déjà une proposition en cours sur cette annonce : modifiez-la.", code="offer_exists"
        )
    offer = Offer.objects.create(
        cargo=cargo,
        driver=driver,
        vehicle=vehicle,
        price=price,
        currency=cargo.currency,
        message=message,
    )
    notify(
        cargo.client,
        kind="offer_received",
        title="Nouvelle proposition",
        body=f"{driver.user.public_name} propose {price} {cargo.currency} pour « {cargo.title} ».",
        data={"cargo_id": str(cargo.pk), "offer_id": str(offer.pk)},
    )
    return offer


def _lock_pending_offer(offer_id) -> Offer:
    offer = Offer.objects.select_for_update().select_related("cargo", "driver__user").get(pk=offer_id)
    if offer.status != OfferStatus.PENDING:
        raise BusinessRuleError("Cette proposition n'est plus en attente.", code="offer_not_pending")
    return offer


@transaction.atomic
def update_offer(offer: Offer, **fields) -> Offer:
    offer = _lock_pending_offer(offer.pk)
    _ensure_cargo_open(offer.cargo)
    for name, value in fields.items():
        setattr(offer, name, value)
    offer.save()
    return offer


@transaction.atomic
def withdraw_offer(offer: Offer) -> Offer:
    offer = _lock_pending_offer(offer.pk)
    offer.status = OfferStatus.WITHDRAWN
    offer.save(update_fields=["status", "updated_at"])
    return offer


@transaction.atomic
def reject_offer(offer: Offer) -> Offer:
    offer = _lock_pending_offer(offer.pk)
    offer.status = OfferStatus.REJECTED
    offer.save(update_fields=["status", "updated_at"])
    notify(
        offer.driver.user,
        kind="offer_rejected",
        title="Proposition non retenue",
        body=f"Votre proposition pour « {offer.cargo.title} » n'a pas été retenue.",
        data={"cargo_id": str(offer.cargo_id), "offer_id": str(offer.pk)},
    )
    return offer


def accept_offer(*, offer: Offer, user) -> Shipment:
    """
    Attribue la cargaison à un chauffeur. Trois verrous garantissent l'unicité :
    1. verrou de ligne sur la cargaison (SELECT ... FOR UPDATE) : les acceptations concurrentes sont sérialisées ;
    2. contrainte unique partielle « une seule offre acceptée par cargaison » ;
    3. OneToOne Shipment.cargo.
    Si (1) est contourné, (2) et (3) font échouer la transaction : aucune double attribution possible.
    """
    try:
        with transaction.atomic():
            cargo = Cargo.objects.select_for_update().get(pk=offer.cargo_id)
            if cargo.client_id != user.pk:
                raise BusinessRuleError("Seul l'auteur de l'annonce peut accepter une proposition.", code="not_owner")
            _ensure_cargo_open(cargo)
            offer = _lock_pending_offer(offer.pk)

            offer.status = OfferStatus.ACCEPTED
            offer.save(update_fields=["status", "updated_at"])

            others = list(
                cargo.offers.filter(status=OfferStatus.PENDING).exclude(pk=offer.pk).select_related("driver__user")
            )
            cargo.offers.filter(pk__in=[o.pk for o in others]).update(
                status=OfferStatus.CLOSED, updated_at=timezone.now()
            )

            cargo.status = CargoStatus.ASSIGNED
            cargo.save(update_fields=["status", "updated_at"])

            shipment = Shipment.objects.create(
                cargo=cargo,
                offer=offer,
                client=cargo.client,
                driver=offer.driver,
                agreed_price=offer.price,
                currency=offer.currency,
            )
            ShipmentEvent.objects.create(
                shipment=shipment, from_status="", to_status=ShipmentStatus.CONFIRMED, actor=user
            )
    except IntegrityError as exc:
        raise BusinessRuleError(
            "Cette annonce vient d'être attribuée à un autre chauffeur.", code="cargo_already_assigned"
        ) from exc

    notify(
        offer.driver.user,
        kind="offer_accepted",
        title="Proposition acceptée 🎉",
        body=f"Votre proposition pour « {cargo.title} » a été acceptée. Consultez la mission.",
        data={"shipment_id": str(shipment.pk)},
    )
    for other in others:
        notify(
            other.driver.user,
            kind="offer_closed",
            title="Annonce attribuée",
            body=f"L'annonce « {cargo.title} » a été attribuée à un autre transporteur.",
            data={"cargo_id": str(cargo.pk), "offer_id": str(other.pk)},
        )
    return shipment
