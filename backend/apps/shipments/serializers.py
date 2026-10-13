from rest_framework import serializers

from apps.drivers.serializers import VehicleSerializer

from . import services
from .models import Shipment, ShipmentEvent, ShipmentStatus


class ShipmentEventSerializer(serializers.ModelSerializer):
    to_status_label = serializers.CharField(source="get_to_status_display", read_only=True)
    actor_name = serializers.SerializerMethodField()

    class Meta:
        model = ShipmentEvent
        fields = ["id", "from_status", "to_status", "to_status_label", "actor_name", "note", "created_at"]

    def get_actor_name(self, event):
        return event.actor.public_name if event.actor else "Système"


class ShipmentEventCreateSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=ShipmentStatus.choices)
    note = serializers.CharField(required=False, allow_blank=True, max_length=500, default="")


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
        ]

    def _role(self, shipment):
        return services.role_of(self.context["request"].user, shipment)

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
