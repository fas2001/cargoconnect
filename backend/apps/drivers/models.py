import os
import uuid

from django.conf import settings
from django.db import models

from apps.common.models import BaseModel


class VerificationStatus(models.TextChoices):
    PENDING = "pending", "En attente"
    VERIFIED = "verified", "Vérifié"
    REJECTED = "rejected", "Refusé"


class DriverProfile(BaseModel):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="driver_profile")
    company_name = models.CharField("entreprise", max_length=150, blank=True)
    bio = models.TextField("présentation", blank=True, max_length=500)
    verification_status = models.CharField(
        "statut de vérification", max_length=10, choices=VerificationStatus.choices, default=VerificationStatus.PENDING
    )
    verified_at = models.DateTimeField("vérifié le", null=True, blank=True)
    rejection_reason = models.CharField("motif du refus", max_length=255, blank=True)

    class Meta(BaseModel.Meta):
        verbose_name = "profil chauffeur"
        verbose_name_plural = "profils chauffeurs"

    def __str__(self):
        return self.company_name or self.user.full_name

    @property
    def is_verified(self) -> bool:
        return self.verification_status == VerificationStatus.VERIFIED


def _document_path(instance, filename):
    ext = os.path.splitext(filename)[1].lower()
    return f"private/drivers/{instance.driver_id}/{uuid.uuid4().hex}{ext}"


class DriverDocument(BaseModel):
    class DocType(models.TextChoices):
        CIN = "cin", "Carte d'identité nationale"
        LICENSE = "permis", "Permis de conduire"
        REGISTRATION = "carte_grise", "Carte grise"
        INSURANCE = "assurance", "Attestation d'assurance"
        TRANSPORT_LICENSE = "agrement", "Agrément / inscription transporteur"
        OTHER = "autre", "Autre"

    driver = models.ForeignKey(DriverProfile, on_delete=models.CASCADE, related_name="documents")
    doc_type = models.CharField("type", max_length=20, choices=DocType.choices)
    file = models.FileField("fichier", upload_to=_document_path)
    status = models.CharField(max_length=10, choices=VerificationStatus.choices, default=VerificationStatus.PENDING)
    review_note = models.CharField("note de vérification", max_length=255, blank=True)

    class Meta(BaseModel.Meta):
        verbose_name = "justificatif"
        verbose_name_plural = "justificatifs"

    def __str__(self):
        return f"{self.get_doc_type_display()} — {self.driver}"
