import re

from rest_framework import serializers

from apps.drivers.serializers import VehicleSerializer

from . import services
from .models import Shipment, ShipmentEvent, ShipmentPhoto, ShipmentStatus

MAX_PROOF_PHOTO_SIZE = 5 * 1024 * 1024


class ShipmentPhotoSerializer(serializers.ModelSerializer):
    class Meta:
        model = ShipmentPhoto
        fields = ["id", "image", "created_at"]


class ShipmentEventSerializer(serializers.ModelSerializer):
    to_status_label = serializers.CharField(source="get_to_status_display", read_only=True)
    actor_name = serializers.SerializerMethodField()
    photos = ShipmentPhotoSerializer(many=True, read_only=True)

    class Meta:
        model = ShipmentEvent
        fields = [
            "id",
            "from_status",
            "to_status",
            "to_status_label",
            "actor_name",
            "note",
            "latitude",
            "longitude",
            "location_accuracy_m",
            "receiver_name",
            "signature",
            "photos",
            "created_at",
        ]

    def get_actor_name(self, event):
        return event.actor.public_name if event.actor else "Système"


# Tracé de signature : commandes de chemin SVG uniquement (aucun script possible).
SIGNATURE_PATTERN = re.compile(r"^[MLQCZmlqcz0-9.,\s-]*$")


class ShipmentEventCreateSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=ShipmentStatus.choices)
    note = serializers.CharField(required=False, allow_blank=True, max_length=500, default="")
    # Preuves (chargement et livraison) : voir services.PROOF_REQUIRED.
    latitude = serializers.DecimalField(max_digits=9, decimal_places=6, min_value=-90, max_value=90, required=False)
    longitude = serializers.DecimalField(max_digits=9, decimal_places=6, min_value=-180, max_value=180, required=False)
    location_accuracy_m = serializers.FloatField(min_value=0, required=False, allow_null=True)
    receiver_name = serializers.CharField(required=False, allow_blank=True, max_length=150)
    signature = serializers.CharField(required=False, allow_blank=True, max_length=50_000)
    photos = serializers.ListField(child=serializers.ImageField(), required=False, max_length=services.MAX_PROOF_PHOTOS)
    # Code du destinataire, facultatif : sans lui, le client doit confirmer la livraison lui-même.
    delivery_code = serializers.RegexField(r"^\d{6}$", required=False, allow_blank=True, default="")

    def validate_signature(self, value):
        if not SIGNATURE_PATTERN.match(value):
            raise serializers.ValidationError("Signature invalide.")
        return value

    def validate_photos(self, photos):
        for photo in photos:
            if photo.size > MAX_PROOF_PHOTO_SIZE:
                raise serializers.ValidationError("Photo trop volumineuse (5 Mo maximum).")
        return photos

    def proof(self) -> dict:
        data = self.validated_data
        keys = ("latitude", "longitude", "location_accuracy_m", "receiver_name", "signature", "photos")
        return {key: data[key] for key in keys if key in data}


class ContactSerializer(serializers.Serializer):
    """Coordonnées complètes : uniquement partagées entre les deux parties d'un transport confirmé."""

    name = serializers.CharField()
    phone = serializers.CharField()
    company_name = serializers.CharField(required=False)


class ShipmentSerializer(serializers.ModelSerializer):
    status_label = serializers.CharField(source="get_status_display", read_only=True)
    cargo = serializers.SerializerMethodField()
    client = serializers.SerializerMethodField()
    driver = serializers.SerializerMethodField()
    vehicle = VehicleSerializer(source="offer.vehicle", read_only=True)
    events = ShipmentEventSerializer(many=True, read_only=True)
    my_role = serializers.SerializerMethodField()
    allowed_transitions = serializers.SerializerMethodField()
    can_review = serializers.SerializerMethodField()
    delivery_code = serializers.SerializerMethodField()

    class Meta:
        model = Shipment
        fields = [
            "id",
            "status",
            "status_label",
            "agreed_price",
            "currency",
            "confirmed_at",
            "loaded_at",
            "delivered_at",
            "completed_at",
            "cargo",
            "client",
            "driver",
            "vehicle",
            "events",
            "my_role",
            "allowed_transitions",
            "can_review",
            "delivery_code",
            "delivered_with_code",
        ]

    def _role(self, shipment):
        return services.role_of(self.context["request"].user, shipment)

    def get_delivery_code(self, shipment) -> str | None:
        """Jamais montré au chauffeur : il doit l'obtenir du destinataire, sur place."""
        open_steps = (ShipmentStatus.CONFIRMED, ShipmentStatus.LOADED, ShipmentStatus.IN_TRANSIT)
        if self._role(shipment) != services.CLIENT or shipment.status not in open_steps:
            return None
        return shipment.delivery_code or None

    def get_cargo(self, shipment):
        from apps.cargos.serializers import CargoDetailSerializer

        return CargoDetailSerializer(shipment.cargo, context=self.context).data

    def get_client(self, shipment):
        user = shipment.client
        return ContactSerializer({"name": user.full_name, "phone": user.phone}).data

    def get_driver(self, shipment):
        user = shipment.driver.user
        return ContactSerializer(
            {"name": user.full_name, "phone": user.phone, "company_name": shipment.driver.company_name}
        ).data

    def get_my_role(self, shipment):
        return self._role(shipment)

    def get_allowed_transitions(self, shipment):
        return [
            {"status": to, "label": ShipmentStatus(to).label, "note_required": to in services.NOTE_REQUIRED}
            for to in services.allowed_transitions(shipment, self._role(shipment))
        ]

    def get_can_review(self, shipment):
        user = self.context["request"].user
        return shipment.status == ShipmentStatus.COMPLETED and not shipment.reviews.filter(author=user).exists()


class ShipmentListSerializer(ShipmentSerializer):
    class Meta(ShipmentSerializer.Meta):
        fields = ["id", "status", "status_label", "agreed_price", "currency", "confirmed_at", "cargo", "my_role"]

    def get_cargo(self, shipment):
        from apps.cargos.serializers import CargoListSerializer

        return CargoListSerializer(shipment.cargo, context=self.context).data
