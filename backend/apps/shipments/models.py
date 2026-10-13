from django.conf import settings
from django.db import models

from apps.common.models import BaseModel


class ShipmentStatus(models.TextChoices):
    CONFIRMED = "confirmed", "Confirmé"
    LOADED = "loaded", "Chargement effectué"
    IN_TRANSIT = "in_transit", "En transit"
    DELIVERED = "delivered", "Livraison déclarée"
    COMPLETED = "completed", "Livraison confirmée"
    CANCELLED = "cancelled", "Annulé"
    DISPUTED = "disputed", "En litige"


class Shipment(BaseModel):
    # OneToOne : impossible de créer deux transports pour la même cargaison ou la même offre.
    cargo = models.OneToOneField("cargos.Cargo", on_delete=models.PROTECT, related_name="shipment")
    offer = models.OneToOneField("offers.Offer", on_delete=models.PROTECT, related_name="shipment")
    # Dénormalisés pour filtrer rapidement « mes transports ».
    client = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="shipments_as_client")
    driver = models.ForeignKey("drivers.DriverProfile", on_delete=models.PROTECT, related_name="shipments")
    agreed_price = models.DecimalField("tarif convenu", max_digits=10, decimal_places=2)
    currency = models.CharField(max_length=3, default="MAD")

    status = models.CharField(
        max_length=12, choices=ShipmentStatus.choices, default=ShipmentStatus.CONFIRMED, db_index=True
    )
    confirmed_at = models.DateTimeField(auto_now_add=True)
    loaded_at = models.DateTimeField(null=True, blank=True)
    delivered_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta(BaseModel.Meta):
        verbose_name = "transport"
        verbose_name_plural = "transports"

    def __str__(self):
        return f"Transport {self.cargo} — {self.get_status_display()}"


class ShipmentEvent(BaseModel):
    """Historique immuable des changements de statut."""

    shipment = models.ForeignKey(Shipment, on_delete=models.CASCADE, related_name="events")
    from_status = models.CharField(max_length=12, choices=ShipmentStatus.choices, blank=True)
    to_status = models.CharField(max_length=12, choices=ShipmentStatus.choices)
    actor = models.ForeignKey(  # null = action automatique du système
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    note = models.CharField(max_length=500, blank=True)

    class Meta(BaseModel.Meta):
        verbose_name = "événement de transport"
        verbose_name_plural = "historique des transports"
        ordering = ["created_at"]
