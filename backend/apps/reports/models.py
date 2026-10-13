from django.conf import settings
from django.db import models

from apps.common.models import BaseModel


class Report(BaseModel):
    """Signalement d'un problème (annonce frauduleuse, litige de livraison, comportement...)."""

    class Reason(models.TextChoices):
        FRAUD = "fraud", "Fraude ou arnaque"
        NO_SHOW = "no_show", "Absence au rendez-vous"
        DAMAGE = "damage", "Marchandise endommagée ou perdue"
        PAYMENT = "payment", "Problème de paiement"
        BEHAVIOR = "behavior", "Comportement inapproprié"
        INACCURATE = "inaccurate", "Annonce inexacte"
        OTHER = "other", "Autre"

    class Status(models.TextChoices):
        OPEN = "open", "Ouvert"
        IN_REVIEW = "in_review", "En cours de traitement"
        RESOLVED = "resolved", "Résolu"
        DISMISSED = "dismissed", "Classé sans suite"

    reporter = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="reports_made")
    reported_user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="reports_received"
    )
    cargo = models.ForeignKey("cargos.Cargo", on_delete=models.SET_NULL, null=True, blank=True, related_name="reports")
    shipment = models.ForeignKey(
        "shipments.Shipment", on_delete=models.SET_NULL, null=True, blank=True, related_name="reports"
    )
    reason = models.CharField(max_length=12, choices=Reason.choices)
    description = models.TextField(max_length=2000)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.OPEN)
    admin_note = models.TextField(blank=True)

    class Meta(BaseModel.Meta):
        verbose_name = "signalement"
