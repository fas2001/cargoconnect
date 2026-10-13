import os
import uuid

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

    # Preuves au chargement et à la livraison : position du téléphone du chauffeur...
    latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    location_accuracy_m = models.FloatField("précision GPS (m)", null=True, blank=True)
    # ... et, à la livraison, la personne qui réceptionne et sa signature (tracé SVG).
    receiver_name = models.CharField("réceptionnaire", max_length=150, blank=True)
    signature = models.TextField("signature (tracé SVG)", blank=True)

    class Meta(BaseModel.Meta):
        verbose_name = "événement de transport"
        verbose_name_plural = "historique des transports"
        ordering = ["created_at"]

    @property
    def has_location(self) -> bool:
        return self.latitude is not None and self.longitude is not None


def _proof_photo_path(instance, filename):
    ext = os.path.splitext(filename)[1].lower() or ".jpg"
    return f"shipments/{instance.event.shipment_id}/{uuid.uuid4().hex}{ext}"


class ShipmentPhoto(BaseModel):
    """Photo prise par le chauffeur au chargement ou à la livraison."""

    event = models.ForeignKey(ShipmentEvent, on_delete=models.CASCADE, related_name="photos")
    image = models.ImageField(upload_to=_proof_photo_path)

    class Meta(BaseModel.Meta):
        verbose_name = "photo de preuve"
        verbose_name_plural = "photos de preuve"
        ordering = ["created_at"]
