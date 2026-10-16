from rest_framework import serializers

from apps.drivers.serializers import PublicDriverSerializer, VehicleSerializer
from apps.vehicles.models import Vehicle

from .models import Offer


class OfferSerializer(serializers.ModelSerializer):
    """Offre vue par le client : profil public du chauffeur, sans coordonnées."""

    driver = PublicDriverSerializer(read_only=True)
    vehicle = VehicleSerializer(read_only=True)
    status_label = serializers.CharField(source="get_status_display", read_only=True)

    class Meta:
        model = Offer
        fields = ["id", "price", "currency", "message", "status", "status_label", "driver", "vehicle", "created_at", "updated_at"]


class OwnOfferSerializer(serializers.ModelSerializer):
    """Offre vue par le chauffeur qui l'a envoyée."""

    vehicle = VehicleSerializer(read_only=True)
    status_label = serializers.CharField(source="get_status_display", read_only=True)
    shipment_id = serializers.SerializerMethodField()

    class Meta:
        model = Offer
        fields = ["id", "cargo", "price", "currency", "message", "status", "status_label", "vehicle", "shipment_id", "created_at", "updated_at"]

    def get_shipment_id(self, offer):
        shipment = getattr(offer, "shipment", None)
        return str(shipment.pk) if shipment else None


class MyOfferListSerializer(OwnOfferSerializer):
    cargo = serializers.SerializerMethodField()

    def get_cargo(self, offer):
        from apps.cargos.serializers import CargoListSerializer

        return CargoListSerializer(offer.cargo, context=self.context).data


class AcceptOfferSerializer(serializers.Serializer):
    """Tarif affiché au client au moment d'accepter : refusé s'il ne correspond plus à l'offre."""

    price = serializers.DecimalField(max_digits=10, decimal_places=2)


class OfferWriteSerializer(serializers.ModelSerializer):
    vehicle = serializers.PrimaryKeyRelatedField(queryset=Vehicle.objects.none(), required=False, allow_null=True)

    class Meta:
        model = Offer
        fields = ["price", "message", "vehicle"]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get("request")
        if request and request.user.is_authenticated and request.user.is_driver:
            # Un chauffeur ne peut proposer qu'un de ses propres véhicules actifs.
            self.fields["vehicle"].queryset = Vehicle.objects.filter(driver=request.user.driver_profile, is_active=True)
