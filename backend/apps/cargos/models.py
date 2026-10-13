import os
import uuid

from django.conf import settings
from django.core.validators import MinValueValidator
from django.db import models

from apps.common.models import BaseModel
from apps.common.validators import validate_no_contact_info
from apps.vehicles.models import TruckType


class City(models.Model):
    """Référentiel des villes : évite les variantes d'orthographe qui cassent la recherche."""

    slug = models.SlugField(unique=True)
    name_fr = models.CharField("nom (FR)", max_length=80)
    name_ar = models.CharField("nom (AR)", max_length=80, blank=True)
    region = models.CharField("région", max_length=80, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        verbose_name = "ville"
        verbose_name_plural = "villes"
        ordering = ["name_fr"]

    def __str__(self):
        return self.name_fr


class GoodsCategory(models.Model):
    slug = models.SlugField(unique=True)
    name_fr = models.CharField("nom (FR)", max_length=80)
    name_ar = models.CharField("nom (AR)", max_length=80, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        verbose_name = "catégorie de marchandise"
        verbose_name_plural = "catégories de marchandises"
        ordering = ["name_fr"]

    def __str__(self):
        return self.name_fr


class CargoStatus(models.TextChoices):
    DRAFT = "draft", "Brouillon"
    PUBLISHED = "published", "Publiée"
    ASSIGNED = "assigned", "Attribuée"
    COMPLETED = "completed", "Livrée"
    CANCELLED = "cancelled", "Annulée"
    EXPIRED = "expired", "Expirée"


class Cargo(BaseModel):
    """
    Annonce de transport. Après l'attribution, le suivi de la livraison est porté par
    `shipments.Shipment` ; l'annonce passe à « Livrée » quand la livraison est confirmée.
    """

    client = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="cargos")
    title = models.CharField("titre", max_length=120)
    description = models.TextField("description", blank=True, validators=[validate_no_contact_info])
    category = models.ForeignKey(GoodsCategory, on_delete=models.PROTECT, related_name="cargos")
    weight_kg = models.DecimalField("poids (kg)", max_digits=10, decimal_places=2, validators=[MinValueValidator(1)])
    volume_m3 = models.DecimalField(
        "volume (m³)", max_digits=8, decimal_places=2, null=True, blank=True, validators=[MinValueValidator(0)]
    )
    truck_type = models.CharField("type de camion", max_length=20, choices=TruckType.choices)

    origin_city = models.ForeignKey(City, on_delete=models.PROTECT, related_name="+")
    origin_address = models.CharField("adresse de chargement", max_length=255, blank=True)
    destination_city = models.ForeignKey(City, on_delete=models.PROTECT, related_name="+")
    destination_address = models.CharField("adresse de livraison", max_length=255, blank=True)
    loading_date = models.DateField("date de chargement souhaitée")

    proposed_price = models.DecimalField(
        "prix proposé", max_digits=10, decimal_places=2, null=True, blank=True, validators=[MinValueValidator(0)]
    )
    currency = models.CharField(max_length=3, default="MAD")
    instructions = models.TextField("instructions", blank=True, validators=[validate_no_contact_info])

    # Preuves en cas de litige ou de vol. Privés : visibles seulement par le client et le chauffeur retenu
    # (afficher la valeur de la marchandise à tous les chauffeurs exposerait les cargaisons de valeur).
    declared_value = models.DecimalField(
        "valeur déclarée de la marchandise", max_digits=12, decimal_places=2, null=True, blank=True, validators=[MinValueValidator(0)]
    )
    recipient_name = models.CharField("destinataire (nom)", max_length=150, blank=True)
    recipient_phone = models.CharField("destinataire (téléphone)", max_length=16, blank=True)
    goods_declaration_at = models.DateTimeField(
        "déclaration de conformité acceptée le", null=True, blank=True,
        help_text="Le client certifie que la marchandise est licite et conforme à la description.",
    )

    status = models.CharField(max_length=10, choices=CargoStatus.choices, default=CargoStatus.DRAFT, db_index=True)
    published_at = models.DateTimeField(null=True, blank=True)
    expires_at = models.DateTimeField(null=True, blank=True)
    cancelled_at = models.DateTimeField(null=True, blank=True)
    cancel_reason = models.CharField("motif d'annulation", max_length=255, blank=True)

    class Meta(BaseModel.Meta):
        verbose_name = "cargaison"
        verbose_name_plural = "cargaisons"
        indexes = [
            models.Index(fields=["status", "loading_date"]),
            models.Index(fields=["origin_city", "destination_city"]),
        ]

    def __str__(self):
        return f"{self.title} ({self.origin_city} → {self.destination_city})"


def _photo_path(instance, filename):
    ext = os.path.splitext(filename)[1].lower()
    return f"cargos/{instance.cargo_id}/{uuid.uuid4().hex}{ext}"


class CargoPhoto(BaseModel):
    cargo = models.ForeignKey(Cargo, on_delete=models.CASCADE, related_name="photos")
    image = models.ImageField(upload_to=_photo_path)

    class Meta(BaseModel.Meta):
        verbose_name = "photo"
        ordering = ["created_at"]
