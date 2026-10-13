from django.contrib.auth import password_validation
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework_simplejwt.tokens import RefreshToken

from apps.common.validators import normalize_phone

from .models import PhoneOTP, User


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


class DriverSummarySerializer(serializers.Serializer):
    id = serializers.UUIDField()
    company_name = serializers.CharField()
    verification_status = serializers.CharField()


class MeSerializer(serializers.ModelSerializer):
    roles = serializers.ListField(child=serializers.CharField(), read_only=True)
    driver_profile = serializers.SerializerMethodField()
    rating_as_client = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id",
            "phone",
            "full_name",
            "email",
            "phone_verified",
            "roles",
            "driver_profile",
            "rating_as_client",
            "date_joined",
        ]
        read_only_fields = ["id", "phone", "phone_verified", "date_joined"]

    def get_driver_profile(self, user):
        if not user.is_driver:
            return None
        return DriverSummarySerializer(user.driver_profile).data

    def get_rating_as_client(self, user):
        from apps.reviews.services import rating_summary

        return rating_summary(user, "client")


class RegisterSerializer(serializers.ModelSerializer):
    phone = PhoneField()
    password = serializers.CharField(write_only=True, style={"input_type": "password"})

    class Meta:
        model = User
        fields = ["phone", "full_name", "email", "password"]
        extra_kwargs = {"email": {"required": False}}

    def validate_phone(self, value):
        if User.objects.filter(phone=value).exists():
            raise serializers.ValidationError("Un compte existe déjà avec ce numéro.")
        return value

    def validate(self, attrs):
        try:
            password_validation.validate_password(attrs["password"], User(**{k: v for k, v in attrs.items() if k != "password"}))
        except DjangoValidationError as exc:
            raise serializers.ValidationError({"password": exc.messages}) from exc
        return attrs

    def create(self, validated_data):
        return User.objects.create_user(**validated_data)


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
