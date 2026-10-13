from django.db import IntegrityError, transaction
from django.db.models import Avg, Count

from apps.common.exceptions import BusinessRuleError
from apps.notifications.services import notify
from apps.shipments.models import Shipment, ShipmentStatus
from apps.shipments.services import CLIENT, role_of

from .models import Review


def rating_summary(user, role: str) -> dict:
    agg = Review.objects.filter(target=user, target_role=role).aggregate(average=Avg("rating"), count=Count("id"))
    return {"average": round(agg["average"], 1) if agg["average"] else None, "count": agg["count"]}


def create_review(*, shipment: Shipment, author, rating: int, comment: str = "") -> Review:
    role = role_of(author, shipment)
    if role is None:
        raise BusinessRuleError("Vous ne participez pas à ce transport.", code="not_participant")
    if shipment.status != ShipmentStatus.COMPLETED:
        raise BusinessRuleError("Vous pourrez noter ce transport une fois la livraison confirmée.", code="not_completed")
    if role == CLIENT:
        target, target_role = shipment.driver.user, Review.TargetRole.DRIVER
    else:
        target, target_role = shipment.client, Review.TargetRole.CLIENT
    try:
        with transaction.atomic():
            review = Review.objects.create(
                shipment=shipment, author=author, target=target, target_role=target_role, rating=rating, comment=comment
            )
    except IntegrityError as exc:
        raise BusinessRuleError("Vous avez déjà noté ce transport.", code="already_reviewed") from exc
    notify(
        target,
        kind="review_received",
        title="Nouvel avis",
        body=f"{author.public_name} vous a attribué {rating}/5.",
        data={"shipment_id": str(shipment.pk)},
    )
    return review
