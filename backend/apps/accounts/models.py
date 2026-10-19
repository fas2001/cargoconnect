import os
import uuid

from django.contrib.auth.hashers import check_password, make_password
from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models
from django.utils import timezone

from apps.common.models import BaseModel
from apps.common.validators import normalize_phone
from apps.drivers.models import DriverDocument, VerificationStatus, private_storage


class UserManager(BaseUserManager):
    use_in_migrations = True

    def create_user(self, phone, password=None, **extra):
        if not phone:
            raise ValueError("Le numéro de téléphone est obligatoire.")
        email = extra.pop("email", "") or ""
        user = self.model(phone=normalize_phone(phone), email=self.normalize_email(email), **extra)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, phone, password=None, **extra):
        extra.setdefault("is_staff", True)
        extra.setdefault("is_superuser", True)
        extra.setdefault("full_name", "Administrateur")
        return self.create_user(phone, password, **extra)

    def get_by_natural_key(self, username):
        try:
            username = normalize_phone(username)
        except Exception:
            pass
        return self.get(**{self.model.USERNAME_FIELD: username})


def _avatar_path(instance, filename):
    ext = os.path.splitext(filename)[1].lower() or ".jpg"
    return f"avatars/{uuid.uuid4().hex}{ext}"


class User(AbstractBaseUser, PermissionsMixin):
    """
    Un seul compte par personne et un seul rôle, choisi à l'inscription : client (publie des
    cargaisons) ou chauffeur (le compte a alors un DriverProfile).
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    phone = models.CharField("téléphone", max_length=16, unique=True)
    full_name = models.CharField("nom complet", max_length=150)
    email = models.EmailField("e-mail", blank=True)
    # Photo de profil : visible des autres utilisateurs (offres, annonces), contrairement aux justificatifs.
    avatar = models.ImageField("photo de profil", upload_to=_avatar_path, null=True, blank=True)
    phone_verified = models.BooleanField("téléphone vérifié", default=False)
    is_active = models.BooleanField("actif", default=True)
    is_staff = models.BooleanField("équipe", default=False)
    date_joined = models.DateTimeField("inscrit le", default=timezone.now)
    # Compte supprimé à la demande de son titulaire : données personnelles effacées (voir `delete_account`).
    deleted_at = models.DateTimeField("supprimé le", null=True, blank=True)

    objects = UserManager()

    USERNAME_FIELD = "phone"
    REQUIRED_FIELDS = ["full_name"]

    class Meta:
        verbose_name = "utilisateur"
        verbose_name_plural = "utilisateurs"

    def __str__(self):
        return f"{self.full_name} ({self.phone})"

    @property
    def is_driver(self) -> bool:
        return hasattr(self, "driver_profile")

    @property
    def roles(self) -> list[str]:
        return ["driver"] if self.is_driver else ["client"]

    @property
    def public_name(self) -> str:
        """Prénom + initiale du nom : affiché aux inconnus avant confirmation."""
        parts = self.full_name.split()
        if len(parts) < 2:
            return self.full_name
        return f"{parts[0]} {parts[-1][0]}."


class PhoneOTP(models.Model):
    class Purpose(models.TextChoices):
        VERIFY_PHONE = "verify_phone", "Vérification du téléphone"
        RESET_PASSWORD = "reset_password", "Réinitialisation du mot de passe"

    phone = models.CharField(max_length=16, db_index=True)
    purpose = models.CharField(max_length=20, choices=Purpose.choices)
    code_hash = models.CharField(max_length=128)
    expires_at = models.DateTimeField()
    attempts = models.PositiveSmallIntegerField(default=0)
    used_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "code de vérification"
        verbose_name_plural = "codes de vérification"
        ordering = ["-created_at"]

    def set_code(self, code: str):
        self.code_hash = make_password(code)

    def check_code(self, code: str) -> bool:
        return check_password(code, self.code_hash)


ICE_PATTERN = r"^\d{15}$"
CIN_PATTERN = r"^[A-Z]{1,2}\d{1,7}$"


class ClientIdentity(BaseModel):
    """
    Identité de l'expéditeur, exigée avant sa première annonce publiée : particulier (CIN) ou
    entreprise (raison sociale + ICE). Documents vérifiés par l'équipe ; « Client vérifié » ensuite.
    """

    class AccountType(models.TextChoices):
        INDIVIDUAL = "individual", "Particulier"
        COMPANY = "company", "Entreprise"

    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="client_identity")
    account_type = models.CharField("type de compte", max_length=10, choices=AccountType.choices)
    cin_number = models.CharField("numéro de CIN", max_length=10, blank=True)
    company_name = models.CharField("raison sociale", max_length=150, blank=True)
    ice = models.CharField("ICE", max_length=15, blank=True)

    verification_status = models.CharField(
        "statut de vérification", max_length=10, choices=VerificationStatus.choices, default=VerificationStatus.PENDING
    )
    verified_at = models.DateTimeField("vérifié le", null=True, blank=True)
    rejection_reason = models.CharField("motif du refus", max_length=255, blank=True)

    class Meta(BaseModel.Meta):
        verbose_name = "identité client"
        verbose_name_plural = "identités clients"

    def __str__(self):
        return f"{self.company_name or self.user.full_name} ({self.get_account_type_display()})"

    @property
    def is_verified(self) -> bool:
        return self.verification_status == VerificationStatus.VERIFIED


def _client_document_path(instance, filename):
    ext = os.path.splitext(filename)[1].lower()
    return f"clients/{instance.identity_id}/{uuid.uuid4().hex}{ext}"


class ClientDocument(BaseModel):
    class DocType(models.TextChoices):
        CIN = "cin", "Carte d'identité nationale"
        BUSINESS_REGISTER = "registre_commerce", "Registre de commerce / attestation ICE"

    identity = models.ForeignKey(ClientIdentity, on_delete=models.CASCADE, related_name="documents")
    doc_type = models.CharField("type", max_length=20, choices=DocType.choices)
    side = models.CharField("face", max_length=6, choices=DriverDocument.Side.choices, default=DriverDocument.Side.SINGLE)
    file = models.FileField("fichier", upload_to=_client_document_path, storage=private_storage)
    status = models.CharField(max_length=10, choices=VerificationStatus.choices, default=VerificationStatus.PENDING)
    review_note = models.CharField("note de vérification", max_length=255, blank=True)
    reviewed_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, related_name="+", verbose_name="vérifié par"
    )
    reviewed_at = models.DateTimeField("vérifié le", null=True, blank=True)
    replaced_at = models.DateTimeField("remplacé le", null=True, blank=True)

    class Meta(BaseModel.Meta):
        verbose_name = "justificatif client"
        verbose_name_plural = "justificatifs clients"

    def __str__(self):
        side = f" ({self.get_side_display().lower()})" if self.side != DriverDocument.Side.SINGLE else ""
        return f"{self.get_doc_type_display()}{side} — {self.identity}"
