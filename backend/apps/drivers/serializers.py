from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from apps.vehicles.models import Vehicle

from . import services
from .models import DriverDocument, DriverProfile

D = DriverDocument.DocType

ALLOWED_DOCUMENT_EXTENSIONS = {".pdf", ".jpg", ".jpeg", ".png", ".heic", ".webp"}
MAX_DOCUMENT_SIZE = 8 * 1024 * 1024


class VehicleSerializer(serializers.ModelSerializer):
    truck_type_label = serializers.CharField(source="get_truck_type_display", read_only=True)

    class Meta:
        model = Vehicle
        fields = ["id", "truck_type", "truck_type_label", "capacity_kg", "registration_number", "brand_model", "is_active"]


class DriverDocumentSerializer(serializers.ModelSerializer):
    """Justificatif vu par le chauffeur. Le fichier n'est jamais renvoyé : il reste privé."""

    doc_type_label = serializers.CharField(source="get_doc_type_display", read_only=True)
    vehicle = serializers.PrimaryKeyRelatedField(queryset=Vehicle.objects.none(), required=False, allow_null=True)
    is_expired = serializers.BooleanField(read_only=True)

    class Meta:
        model = DriverDocument
        fields = [
            "id",
            "doc_type",
            "doc_type_label",
            "side",
            "vehicle",
            "file",
            "document_number",
            "holder_name",
            "issuer",
            "expires_on",
            "covers_goods",
            "status",
            "review_note",
            "is_expired",
            "created_at",
        ]
        read_only_fields = ["status", "review_note", "created_at"]
        extra_kwargs = {"file": {"write_only": True}}

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get("request")
        if request and request.user.is_authenticated and request.user.is_driver:
            self.fields["vehicle"].queryset = Vehicle.objects.filter(driver=request.user.driver_profile, is_active=True)

    def validate_file(self, file):
        name = file.name.lower()
        if not any(name.endswith(ext) for ext in ALLOWED_DOCUMENT_EXTENSIONS):
            raise serializers.ValidationError("Format accepté : PDF, JPG, PNG, HEIC ou WEBP.")
        if file.size > MAX_DOCUMENT_SIZE:
            raise serializers.ValidationError("Fichier trop volumineux (8 Mo maximum).")
        return file

    def validate(self, attrs):
        doc_type = attrs["doc_type"]
        side = attrs.get("side", DriverDocument.Side.SINGLE)
        errors = {}
        if doc_type in services.TWO_SIDED:
            if side not in (DriverDocument.Side.FRONT, DriverDocument.Side.BACK):
                errors["side"] = "Précisez la face : recto ou verso."
        elif side != DriverDocument.Side.SINGLE:
            errors["side"] = "Ce document n'a qu'une seule face."
        if doc_type in services.VEHICLE_DOCUMENTS:
            if not attrs.get("vehicle"):
                errors["vehicle"] = "Choisissez le camion concerné."
        elif attrs.get("vehicle"):
            errors["vehicle"] = "Ce document n'est pas lié à un camion."
        # Numéro et date d'expiration : saisis une fois, sur le recto (ou la face unique).
        main_face = side != DriverDocument.Side.BACK
        if main_face and doc_type in (D.CIN, D.LICENSE, D.REGISTRATION, D.INSURANCE) and not attrs.get("document_number"):
            errors["document_number"] = "Indiquez le numéro du document."
        if main_face and doc_type in services.EXPIRING and not attrs.get("expires_on"):
            errors["expires_on"] = "Indiquez la date d'expiration."
        if doc_type == D.INSURANCE:
            if not attrs.get("issuer"):
                errors["issuer"] = "Indiquez la compagnie d'assurance."
            if attrs.get("covers_goods") is None:
                errors["covers_goods"] = "Précisez si l'assurance couvre la marchandise transportée."
        if errors:
            raise serializers.ValidationError(errors)
        attrs["side"] = side
        return attrs


class DriverProfileSerializer(serializers.ModelSerializer):
    """Profil chauffeur tel que le chauffeur le voit lui-même."""

    vehicles = VehicleSerializer(many=True, read_only=True)
    documents = serializers.SerializerMethodField()
    checklist = serializers.SerializerMethodField()
    rating = serializers.SerializerMethodField()

    class Meta:
        model = DriverProfile
        fields = [
            "id",
            "company_name",
            "bio",
            "verification_status",
            "verified_at",
            "rejection_reason",
            "vehicles",
            "documents",
            "checklist",
            "rating",
            "created_at",
        ]
        read_only_fields = ["verification_status", "verified_at", "rejection_reason", "created_at"]

    @extend_schema_field(DriverDocumentSerializer(many=True))
    def get_documents(self, profile):
        """Justificatifs en vigueur (les versions remplacées restent visibles dans l'administration)."""
        return DriverDocumentSerializer(services.current_documents(profile), many=True, context=self.context).data

    @extend_schema_field(serializers.ListField(child=serializers.DictField()))
    def get_checklist(self, profile):
        return services.checklist(profile)

    def get_rating(self, profile):
        from apps.reviews.services import rating_summary

        return rating_summary(profile.user, "driver")


class PublicDriverSerializer(serializers.ModelSerializer):
    """Ce que voit un client qui compare les offres : pas de téléphone avant confirmation."""

    name = serializers.CharField(source="user.public_name")
    avatar = serializers.ImageField(source="user.avatar", read_only=True)
    is_verified = serializers.BooleanField(read_only=True)
    rating = serializers.SerializerMethodField()
    completed_shipments = serializers.SerializerMethodField()
    cancelled_shipments = serializers.SerializerMethodField()

    class Meta:
        model = DriverProfile
        fields = [
            "id",
            "name",
            "avatar",
            "company_name",
            "bio",
            "is_verified",
            "rating",
            "completed_shipments",
            "cancelled_shipments",
            "created_at",
        ]

    def get_rating(self, profile):
        from apps.reviews.services import rating_summary

        return rating_summary(profile.user, "driver")

    def get_completed_shipments(self, profile) -> int:
        return profile.shipments.filter(status="completed").count()

    def get_cancelled_shipments(self, profile) -> int:
        """Transports confirmés que le chauffeur a lui-même annulés (pas ceux annulés par le client ou l'équipe)."""
        from apps.shipments.models import ShipmentEvent, ShipmentStatus

        return ShipmentEvent.objects.filter(
            shipment__driver=profile, to_status=ShipmentStatus.CANCELLED, actor=profile.user
        ).count()
