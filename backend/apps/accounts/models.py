import uuid

from django.contrib.auth.hashers import check_password, make_password
from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models
from django.utils import timezone

from apps.common.validators import normalize_phone


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


class User(AbstractBaseUser, PermissionsMixin):
    """
    Un seul compte par personne et un seul rôle, choisi à l'inscription : client (publie des
    cargaisons) ou chauffeur (le compte a alors un DriverProfile).
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    phone = models.CharField("téléphone", max_length=16, unique=True)
    full_name = models.CharField("nom complet", max_length=150)
    email = models.EmailField("e-mail", blank=True)
    phone_verified = models.BooleanField("téléphone vérifié", default=False)
    is_active = models.BooleanField("actif", default=True)
    is_staff = models.BooleanField("équipe", default=False)
    date_joined = models.DateTimeField("inscrit le", default=timezone.now)

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
