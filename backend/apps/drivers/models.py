import os
import uuid

from django.conf import settings
from django.core.files.storage import FileSystemStorage
from django.db import models
from django.utils import timezone

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


class PrivateMediaStorage(FileSystemStorage):
    """Stockage hors de MEDIA_ROOT, sans URL : seule `admin_views.document_file` lit ces fichiers."""

    @property
    def base_location(self):
        return settings.PRIVATE_MEDIA_ROOT  # lu à chaque accès (modifiable dans les tests)

    @property
    def location(self):
        return os.path.abspath(self.base_location)

    def url(self, name):
        raise ValueError("Les justificatifs n'ont pas d'URL publique.")


def private_storage():
    return PrivateMediaStorage()


def _document_path(instance, filename):
    ext = os.path.splitext(filename)[1].lower()
    return f"drivers/{instance.driver_id}/{uuid.uuid4().hex}{ext}"


class DriverDocument(BaseModel):
    class DocType(models.TextChoices):
        CIN = "cin", "Carte d'identité nationale"
        SELFIE = "selfie", "Photo du visage (selfie)"
        LICENSE = "permis", "Permis de conduire"
        REGISTRATION = "carte_grise", "Carte grise"
        INSURANCE = "assurance", "Attestation d'assurance"
        TECHNICAL_INSPECTION = "visite_technique", "Visite technique"
        TRANSPORT_LICENSE = "agrement", "Agrément / inscription transporteur"
        OTHER = "autre", "Autre"

    class Side(models.TextChoices):
        FRONT = "recto", "Recto"
        BACK = "verso", "Verso"
        SINGLE = "unique", "Unique"

    class DataSource(models.TextChoices):
        DECLARED = "declared", "Saisi par le chauffeur"
        ADMIN = "admin", "Corrigé par l'administration"
        OCR = "ocr", "Extrait automatiquement (OCR)"

    driver = models.ForeignKey(DriverProfile, on_delete=models.CASCADE, related_name="documents")
    doc_type = models.CharField("type", max_length=20, choices=DocType.choices)
    side = models.CharField("face", max_length=6, choices=Side.choices, default=Side.SINGLE)
    # Carte grise, assurance, visite technique : rattachées à un camion précis.
    vehicle = models.ForeignKey(
        "vehicles.Vehicle", on_delete=models.CASCADE, null=True, blank=True, related_name="documents", verbose_name="véhicule"
    )
    file = models.FileField("fichier", upload_to=_document_path, storage=private_storage)

    # Informations lues sur le document : déclarées par le chauffeur, contrôlées par l'admin
    # (pré-remplies par OCR plus tard, voir `data_source`).
    document_number = models.CharField("numéro", max_length=60, blank=True)
    holder_name = models.CharField("nom du titulaire", max_length=150, blank=True)
    issuer = models.CharField("émetteur / assureur", max_length=120, blank=True)
    expires_on = models.DateField("expire le", null=True, blank=True)
    covers_goods = models.BooleanField("couvre la marchandise transportée", null=True, blank=True)
    data_source = models.CharField("source des informations", max_length=10, choices=DataSource.choices, default=DataSource.DECLARED)

    status = models.CharField(max_length=10, choices=VerificationStatus.choices, default=VerificationStatus.PENDING)
    review_note = models.CharField("note de vérification", max_length=255, blank=True)
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+", verbose_name="vérifié par"
    )
    reviewed_at = models.DateTimeField("vérifié le", null=True, blank=True)
    # Un nouvel envoi du même document (même type, face et camion) remplace l'ancien, conservé pour l'historique.
    replaced_at = models.DateTimeField("remplacé le", null=True, blank=True)
    expiry_notified_at = models.DateTimeField("rappel d'expiration envoyé le", null=True, blank=True)

    class Meta(BaseModel.Meta):
        verbose_name = "justificatif"
        verbose_name_plural = "justificatifs"
        indexes = [models.Index(fields=["driver", "doc_type", "side"])]

    def __str__(self):
        side = f" ({self.get_side_display().lower()})" if self.side != self.Side.SINGLE else ""
        return f"{self.get_doc_type_display()}{side} — {self.driver}"

    @property
    def is_current(self) -> bool:
        return self.replaced_at is None

    @property
    def is_expired(self) -> bool:
        return bool(self.expires_on and self.expires_on < timezone.localdate())


class DocumentAccessLog(models.Model):
    """Chaque ouverture d'un justificatif par un membre de l'équipe."""

    document = models.ForeignKey(DriverDocument, on_delete=models.CASCADE, related_name="access_logs")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="+")
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    accessed_at = models.DateTimeField("consulté le", auto_now_add=True)

    class Meta:
        verbose_name = "consultation de justificatif"
        verbose_name_plural = "consultations de justificatifs"
        ordering = ["-accessed_at"]

    def __str__(self):
        return f"{self.document} — {self.user} — {self.accessed_at:%d/%m/%Y %H:%M}"


class VerificationEvent(BaseModel):
    """Historique des décisions de vérification (profil ou justificatif) : qui, quand, pourquoi."""

    driver = models.ForeignKey(DriverProfile, on_delete=models.CASCADE, related_name="verification_events")
    document = models.ForeignKey(
        DriverDocument, on_delete=models.SET_NULL, null=True, blank=True, related_name="verification_events"
    )
    status = models.CharField("décision", max_length=10, choices=VerificationStatus.choices)
    reason = models.CharField("motif", max_length=255, blank=True)
    decided_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="+", verbose_name="décidé par"
    )

    class Meta(BaseModel.Meta):
        verbose_name = "décision de vérification"
        verbose_name_plural = "décisions de vérification"

    def __str__(self):
        target = self.document or "profil"
        return f"{self.get_status_display()} — {target}"
