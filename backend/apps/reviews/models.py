from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models

from apps.common.models import BaseModel
from apps.common.validators import validate_no_contact_info


class Review(BaseModel):
    """Avis laissé par une partie sur l'autre après un transport terminé."""

    class TargetRole(models.TextChoices):
        DRIVER = "driver", "Chauffeur"
        CLIENT = "client", "Client"

    shipment = models.ForeignKey("shipments.Shipment", on_delete=models.CASCADE, related_name="reviews")
    author = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="reviews_written")
    target = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="reviews_received")
    target_role = models.CharField(max_length=10, choices=TargetRole.choices)
    rating = models.PositiveSmallIntegerField(validators=[MinValueValidator(1), MaxValueValidator(5)])
    comment = models.TextField(blank=True, max_length=500, validators=[validate_no_contact_info])

    class Meta(BaseModel.Meta):
        verbose_name = "avis"
        verbose_name_plural = "avis"
        constraints = [
            models.UniqueConstraint(fields=["shipment", "author"], name="one_review_per_author_per_shipment"),
            models.CheckConstraint(condition=models.Q(rating__gte=1, rating__lte=5), name="rating_between_1_and_5"),
        ]
