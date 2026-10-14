import re

from django.contrib.auth import password_validation
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework_simplejwt.tokens import RefreshToken

from apps.common.validators import normalize_phone

from . import identity as identity_services
from .models import CIN_PATTERN, ICE_PATTERN, ClientDocument, ClientIdentity, PhoneOTP, User


MAX_AVATAR_SIZE = 5 * 1024 * 1024


class PhoneField(serializers.CharField):
    def to_internal_value(self, data):
        value = super().to_internal_value(data)
        try:
            return normalize_phone(value)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(exc.messages[0]) from exc


def tokens_for(user) -> dict:
    refresh = RefreshToken.for_user(user)
    return {"refresh": str(refresh), "access": str(refresh.access_token)}


class TokenPairSerializer(serializers.Serializer):
    access = serializers.CharField()
    refresh = serializers.CharField()


class DriverSummarySerializer(serializers.Serializer):
    id = serializers.UUIDField()
    company_name = serializers.CharField()
    verification_status = serializers.CharField()


class MeSerializer(serializers.ModelSerializer):
    roles = serializers.ListField(child=serializers.CharField(), read_only=True)
    driver_profile = serializers.SerializerMethodField()
    rating_as_client = serializers.SerializerMethodField()
    identity_status = serializers.SerializerMethodField()
    avatar = serializers.ImageField(required=False, allow_null=True)

    class Meta:
        model = User
        fields = [
            "id",
            "phone",
            "full_name",
            "email",
            "avatar",
            "phone_verified",
            "roles",
            "driver_profile",
            "rating_as_client",
            "identity_status",
            "is_staff",
            "date_joined",
        ]
        read_only_fields = ["id", "phone", "phone_verified", "is_staff", "date_joined"]

    def get_driver_profile(self, user):
        if not user.is_driver:
            return None
        return DriverSummarySerializer(user.driver_profile).data

    def validate_full_name(self, value):
        value = " ".join(value.split())
        if len(value) < 3:
            raise serializers.ValidationError("Indiquez votre prénom et votre nom.")
        return value

    def validate_avatar(self, image):
        if image and image.size > MAX_AVATAR_SIZE:
            raise serializers.ValidationError("Photo trop volumineuse (5 Mo maximum).")
        return image

    def update(self, user, validated_data):
        # Nouvelle photo (ou suppression) : l'ancien fichier est effacé.
        if "avatar" in validated_data and user.avatar:
            user.avatar.delete(save=False)
        return super().update(user, validated_data)

    def get_identity_status(self, user) -> str | None:
        return None if user.is_driver else identity_services.status_of(user)

    def get_rating_as_client(self, user):
        from apps.reviews.services import rating_summary

        return rating_summary(user, "client")


class RegisterSerializer(serializers.ModelSerializer):
    phone = PhoneField()
    password = serializers.CharField(write_only=True, style={"input_type": "password"})
    role = serializers.ChoiceField(choices=["client", "driver"], default="client", write_only=True)
    company_name = serializers.CharField(max_length=150, required=False, allow_blank=True, write_only=True)

    class Meta:
        model = User
        fields = ["phone", "full_name", "email", "password", "role", "company_name"]
        extra_kwargs = {"email": {"required": False}}

    def validate_phone(self, value):
        if User.objects.filter(phone=value).exists():
            raise serializers.ValidationError("Un compte existe déjà avec ce numéro.")
        return value

    def validate(self, attrs):
        try:
            user_fields = {k: attrs[k] for k in ("phone", "full_name", "email") if k in attrs}
            password_validation.validate_password(attrs["password"], User(**user_fields))
        except DjangoValidationError as exc:
            raise serializers.ValidationError({"password": exc.messages}) from exc
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        from apps.drivers.models import DriverProfile

        role = validated_data.pop("role")
        company_name = validated_data.pop("company_name", "")
        user = User.objects.create_user(**validated_data)
        if role == "driver":
            DriverProfile.objects.create(user=user, company_name=company_name)
        return user


class PhoneTokenObtainPairSerializer(TokenObtainPairSerializer):
    """Connexion par téléphone : accepte 06..., +2126..., etc."""

    default_error_messages = {"no_active_account": "Numéro ou mot de passe incorrect."}

    def validate(self, attrs):
        try:
            attrs[self.username_field] = normalize_phone(attrs.get(self.username_field, ""))
        except DjangoValidationError:
            pass  # laisser l'authentification échouer avec le message générique
        data = super().validate(attrs)
        data["user"] = MeSerializer(self.user).data
        return data


class ChangePasswordSerializer(serializers.Serializer):
    current_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True)

    def validate_current_password(self, value):
        if not self.context["request"].user.check_password(value):
            raise serializers.ValidationError("Mot de passe actuel incorrect.")
        return value

    def validate_new_password(self, value):
        password_validation.validate_password(value, self.context["request"].user)
        return value


class OTPRequestSerializer(serializers.Serializer):
    phone = PhoneField()
    purpose = serializers.ChoiceField(choices=PhoneOTP.Purpose.choices)


class OTPVerifySerializer(serializers.Serializer):
    code = serializers.RegexField(r"^\d{4,8}$")


class PasswordResetSerializer(serializers.Serializer):
    phone = PhoneField()
    code = serializers.RegexField(r"^\d{4,8}$")
    new_password = serializers.CharField(write_only=True)

    def validate(self, attrs):
        user = User.objects.filter(phone=attrs["phone"], is_active=True).first()
        try:
            password_validation.validate_password(attrs["new_password"], user)
        except DjangoValidationError as exc:
            raise serializers.ValidationError({"new_password": exc.messages}) from exc
        attrs["user"] = user
        return attrs


class LogoutSerializer(serializers.Serializer):
    refresh = serializers.CharField()


ALLOWED_IDENTITY_EXTENSIONS = {".pdf", ".jpg", ".jpeg", ".png", ".heic", ".webp"}
MAX_IDENTITY_FILE_SIZE = 8 * 1024 * 1024


class ClientDocumentSerializer(serializers.ModelSerializer):
    """Document d'identité du client. Le fichier n'est jamais renvoyé : il reste privé."""

    class Meta:
        model = ClientDocument
        fields = ["id", "doc_type", "side", "file", "status", "review_note", "created_at"]
        read_only_fields = ["status", "review_note", "created_at"]
        extra_kwargs = {"file": {"write_only": True}}

    def validate_file(self, file):
        if not any(file.name.lower().endswith(ext) for ext in ALLOWED_IDENTITY_EXTENSIONS):
            raise serializers.ValidationError("Format accepté : PDF, JPG, PNG, HEIC ou WEBP.")
        if file.size > MAX_IDENTITY_FILE_SIZE:
            raise serializers.ValidationError("Fichier trop volumineux (8 Mo maximum).")
        return file

    def validate(self, attrs):
        identity = self.context["identity"]
        expected = dict.fromkeys(f"{t}:{s}" for t, s in identity_services.REQUIRED_DOCUMENTS[identity.account_type])
        side = attrs.get("side", "unique")
        if f"{attrs['doc_type']}:{side}" not in expected:
            raise serializers.ValidationError({"doc_type": "Ce document ne correspond pas à votre type de compte."})
        attrs["side"] = side
        return attrs


class ClientIdentitySerializer(serializers.ModelSerializer):
    documents = serializers.SerializerMethodField()
    checklist = serializers.SerializerMethodField()
    status = serializers.SerializerMethodField()

    class Meta:
        model = ClientIdentity
        fields = [
            "account_type",
            "cin_number",
            "company_name",
            "ice",
            "verification_status",
            "rejection_reason",
            "status",
            "documents",
            "checklist",
        ]
        read_only_fields = ["verification_status", "rejection_reason"]

    @extend_schema_field(ClientDocumentSerializer(many=True))
    def get_documents(self, identity):
        return ClientDocumentSerializer(identity_services.current_documents(identity), many=True).data

    @extend_schema_field(serializers.ListField(child=serializers.DictField()))
    def get_checklist(self, identity):
        return identity_services.checklist(identity)

    def get_status(self, identity) -> str:
        return identity_services.status_of(identity.user)

    def validate_cin_number(self, value):
        return value.replace(" ", "").upper()

    def validate_ice(self, value):
        return value.replace(" ", "")

    def validate(self, attrs):
        account_type = attrs.get("account_type") or getattr(self.instance, "account_type", None)
        errors = {}
        if account_type == ClientIdentity.AccountType.INDIVIDUAL:
            if not re.match(CIN_PATTERN, attrs.get("cin_number", "")):
                errors["cin_number"] = "Numéro de CIN invalide (ex. AB123456)."
            attrs["company_name"] = ""
            attrs["ice"] = ""
        elif account_type == ClientIdentity.AccountType.COMPANY:
            if not attrs.get("company_name", "").strip():
                errors["company_name"] = "Indiquez la raison sociale."
            if not re.match(ICE_PATTERN, attrs.get("ice", "")):
                errors["ice"] = "L'ICE compte 15 chiffres."
            attrs["cin_number"] = ""
        if errors:
            raise serializers.ValidationError(errors)
        return attrs
