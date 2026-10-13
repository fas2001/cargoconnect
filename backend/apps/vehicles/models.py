from django.core.validators import MinValueValidator
from django.db import models

from apps.common.models import BaseModel


class TruckType(models.TextChoices):
    PLATEAU = "plateau", "Plateau"
    BACHE = "bache", "Bâché / Savoyarde"
    FOURGON = "fourgon", "Fourgon"
    BENNE = "benne", "Benne"
    FRIGORIFIQUE = "frigorifique", "Frigorifique"
    CITERNE = "citerne", "Citerne"
    PORTE_CONTENEUR = "porte_conteneur", "Porte-conteneur"
    PORTE_CHAR = "porte_char", "Porte-char / Porte-engins"
    PICKUP = "pickup", "Pick-up / Utilitaire"


class Vehicle(BaseModel):
    driver = models.ForeignKey("drivers.DriverProfile", on_delete=models.CASCADE, related_name="vehicles")
    truck_type = models.CharField("type de camion", max_length=20, choices=TruckType.choices)
    capacity_kg = models.DecimalField(
        "capacité (kg)", max_digits=10, decimal_places=2, validators=[MinValueValidator(1)]
    )
    registration_number = models.CharField("immatriculation", max_length=20)
    brand_model = models.CharField("marque / modèle", max_length=80, blank=True)
    is_active = models.BooleanField("actif", default=True)

    class Meta(BaseModel.Meta):
        verbose_name = "véhicule"
        verbose_name_plural = "véhicules"
        constraints = [
            models.UniqueConstraint(fields=["registration_number"], name="unique_vehicle_registration"),
        ]

    def __str__(self):
        return f"{self.get_truck_type_display()} — {self.registration_number}"
