from rest_framework import serializers

from apps.vehicles.models import Vehicle

from .models import DriverDocument, DriverProfile

ALLOWED_DOCUMENT_EXTENSIONS = {".pdf", ".jpg", ".jpeg", ".png", ".heic", ".webp"}
MAX_DOCUMENT_SIZE = 8 * 1024 * 1024


class VehicleSerializer(serializers.ModelSerializer):
    truck_type_label = serializers.CharField(source="get_truck_type_display", read_only=True)

    class Meta:
        model = Vehicle
        fields = ["id", "truck_type", "truck_type_label", "capacity_kg", "registration_number", "brand_model", "is_active"]


class DriverDocumentSerializer(serializers.ModelSerializer):
    doc_type_label = serializers.CharField(source="get_doc_type_display", read_only=True)

    class Meta:
        model = DriverDocument
        fields = ["id", "doc_type", "doc_type_label", "file", "status", "review_note", "created_at"]
        read_only_fields = ["status", "review_note", "created_at"]
        extra_kwargs = {"file": {"write_only": True}}

    def validate_file(self, file):
        name = file.name.lower()
        if not any(name.endswith(ext) for ext in ALLOWED_DOCUMENT_EXTENSIONS):
            raise serializers.ValidationError("Format accepté : PDF, JPG, PNG, HEIC ou WEBP.")
        if file.size > MAX_DOCUMENT_SIZE:
            raise serializers.ValidationError("Fichier trop volumineux (8 Mo maximum).")
        return file


class DriverProfileSerializer(serializers.ModelSerializer):
    """Profil chauffeur tel que le chauffeur le voit lui-même."""

    vehicles = VehicleSerializer(many=True, read_only=True)
    documents = DriverDocumentSerializer(many=True, read_only=True)
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
            "rating",
            "created_at",
        ]
        read_only_fields = ["verification_status", "verified_at", "rejection_reason", "created_at"]

    def get_rating(self, profile):
        from apps.reviews.services import rating_summary

        return rating_summary(profile.user, "driver")


class PublicDriverSerializer(serializers.ModelSerializer):
    """Ce que voit un client qui compare les offres : pas de téléphone avant confirmation."""

    name = serializers.CharField(source="user.public_name")
    is_verified = serializers.BooleanField(read_only=True)
    rating = serializers.SerializerMethodField()
    completed_shipments = serializers.SerializerMethodField()

    class Meta:
        model = DriverProfile
        fields = ["id", "name", "company_name", "bio", "is_verified", "rating", "completed_shipments", "created_at"]

    def get_rating(self, profile):
        from apps.reviews.services import rating_summary

        return rating_summary(profile.user, "driver")

    def get_completed_shipments(self, profile):
        return profile.shipments.filter(status="completed").count()
