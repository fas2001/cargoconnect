from django.core.validators import MinValueValidator
from django.db import models
from django.db.models import Q

from apps.common.models import BaseModel
from apps.common.validators import validate_no_contact_info


class OfferStatus(models.TextChoices):
    PENDING = "pending", "En attente"
    ACCEPTED = "accepted", "Acceptée"
    REJECTED = "rejected", "Refusée"
    WITHDRAWN = "withdrawn", "Retirée"
    CLOSED = "closed", "Caduque"  # la cargaison a été attribuée, annulée ou a expiré


class Offer(BaseModel):
    cargo = models.ForeignKey("cargos.Cargo", on_delete=models.CASCADE, related_name="offers")
    driver = models.ForeignKey("drivers.DriverProfile", on_delete=models.PROTECT, related_name="offers")
    vehicle = models.ForeignKey(
        "vehicles.Vehicle", on_delete=models.SET_NULL, null=True, blank=True, related_name="offers"
    )
    price = models.DecimalField("tarif", max_digits=10, decimal_places=2, validators=[MinValueValidator(1)])
    currency = models.CharField(max_length=3, default="MAD")
    message = models.TextField("commentaire", blank=True, max_length=500, validators=[validate_no_contact_info])
    status = models.CharField(max_length=10, choices=OfferStatus.choices, default=OfferStatus.PENDING, db_index=True)

    class Meta(BaseModel.Meta):
        verbose_name = "offre"
        verbose_name_plural = "offres"
        constraints = [
            # Garantie en base : une cargaison ne peut jamais avoir deux offres acceptées.
            models.UniqueConstraint(
                fields=["cargo"], condition=Q(status="accepted"), name="one_accepted_offer_per_cargo"
            ),
            # Un chauffeur n'a qu'une offre active par cargaison (il la modifie au lieu d'en créer une autre).
            models.UniqueConstraint(
                fields=["cargo", "driver"], condition=Q(status="pending"), name="one_pending_offer_per_driver"
            ),
        ]

    def __str__(self):
        return f"{self.price} {self.currency} — {self.driver} — {self.cargo}"
