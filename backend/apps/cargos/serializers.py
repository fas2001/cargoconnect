from django.conf import settings
from django.utils import timezone
from rest_framework import serializers

from apps.offers.models import OfferStatus

from . import services
from .models import Cargo, CargoPhoto, City, GoodsCategory

MAX_PHOTO_SIZE = 5 * 1024 * 1024


class CitySerializer(serializers.ModelSerializer):
    class Meta:
        model = City
        fields = ["id", "slug", "name_fr", "name_ar", "region"]


class GoodsCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = GoodsCategory
        fields = ["id", "slug", "name_fr", "name_ar"]


class CargoPhotoSerializer(serializers.ModelSerializer):
    class Meta:
        model = CargoPhoto
        fields = ["id", "image", "created_at"]

    def validate_image(self, image):
        if image.size > MAX_PHOTO_SIZE:
            raise serializers.ValidationError("Photo trop volumineuse (5 Mo maximum).")
        return image


class CargoClientSerializer(serializers.Serializer):
    name = serializers.CharField(source="public_name")
    rating = serializers.SerializerMethodField()
    member_since = serializers.DateTimeField(source="date_joined")

    def get_rating(self, user):
        from apps.reviews.services import rating_summary

        return rating_summary(user, "client")


class CargoListSerializer(serializers.ModelSerializer):
    category = GoodsCategorySerializer(read_only=True)
    origin_city = CitySerializer(read_only=True)
    destination_city = CitySerializer(read_only=True)
    truck_type_label = serializers.CharField(source="get_truck_type_display", read_only=True)
    status_label = serializers.CharField(source="get_status_display", read_only=True)
    offers_count = serializers.SerializerMethodField()
    thumbnail = serializers.SerializerMethodField()
    is_mine = serializers.SerializerMethodField()
    agreed_price = serializers.SerializerMethodField()

    class Meta:
        model = Cargo
        fields = [
            "id",
            "title",
            "category",
            "weight_kg",
            "volume_m3",
            "truck_type",
            "truck_type_label",
            "origin_city",
            "destination_city",
            "loading_date",
            "proposed_price",
            "agreed_price",
            "currency",
            "status",
            "status_label",
            "published_at",
            "expires_at",
            "offers_count",
            "thumbnail",
            "is_mine",
            "created_at",
        ]

    def get_offers_count(self, cargo):
        if hasattr(cargo, "pending_offers_count"):
            return cargo.pending_offers_count
        return cargo.offers.filter(status=OfferStatus.PENDING).count()

    def get_thumbnail(self, cargo):
        photo = next(iter(cargo.photos.all()), None)
        if photo is None:
            return None
        request = self.context.get("request")
        return request.build_absolute_uri(photo.image.url) if request else photo.image.url

    def get_is_mine(self, cargo):
        request = self.context.get("request")
        return bool(request and cargo.client_id == request.user.pk)

    def get_agreed_price(self, cargo) -> str | None:
        """Tarif de l'offre acceptée : visible seulement par le client et le chauffeur retenu."""
        shipment = getattr(cargo, "shipment", None)
        request = self.context.get("request")
        if shipment is None or request is None:
            return None
        if request.user.pk not in (cargo.client_id, shipment.driver.user_id):
            return None
        return str(shipment.agreed_price)


class CargoDetailSerializer(CargoListSerializer):
    """
    Les adresses précises ne sont visibles que par l'auteur de l'annonce et le chauffeur retenu.
    Les autres chauffeurs ne voient que les villes.
    """

    photos = CargoPhotoSerializer(many=True, read_only=True)
    client = CargoClientSerializer(read_only=True)
    can_edit = serializers.SerializerMethodField()
    my_offer = serializers.SerializerMethodField()
    shipment_id = serializers.SerializerMethodField()

    PRIVATE_FIELDS = ("origin_address", "destination_address")

    class Meta(CargoListSerializer.Meta):
        fields = CargoListSerializer.Meta.fields + [
            "description",
            "instructions",
            "origin_address",
            "destination_address",
            "photos",
            "client",
            "cancel_reason",
            "can_edit",
            "my_offer",
            "shipment_id",
        ]

    def _can_see_private(self, cargo) -> bool:
        user = self.context["request"].user
        if cargo.client_id == user.pk:
            return True
        shipment = getattr(cargo, "shipment", None)
        return bool(shipment and shipment.driver.user_id == user.pk)

    def get_can_edit(self, cargo):
        return self.get_is_mine(cargo) and services.is_editable(cargo)

    def get_my_offer(self, cargo):
        from apps.offers.serializers import OwnOfferSerializer

        user = self.context["request"].user
        if not user.is_driver:
            return None
        offer = cargo.offers.filter(driver=user.driver_profile).order_by("-created_at").first()
        return OwnOfferSerializer(offer, context=self.context).data if offer else None

    def get_shipment_id(self, cargo):
        shipment = getattr(cargo, "shipment", None)
        if shipment and self._can_see_private(cargo):
            return str(shipment.pk)
        return None

    def to_representation(self, cargo):
        data = super().to_representation(cargo)
        if not self._can_see_private(cargo):
            for field in self.PRIVATE_FIELDS:
                data.pop(field, None)
        return data


class CargoWriteSerializer(serializers.ModelSerializer):
    category = serializers.PrimaryKeyRelatedField(queryset=GoodsCategory.objects.filter(is_active=True))
    origin_city = serializers.PrimaryKeyRelatedField(queryset=City.objects.filter(is_active=True))
    destination_city = serializers.PrimaryKeyRelatedField(queryset=City.objects.filter(is_active=True))
    publish = serializers.BooleanField(write_only=True, required=False, default=False)

    class Meta:
        model = Cargo
        fields = [
            "title",
            "description",
            "category",
            "weight_kg",
            "volume_m3",
            "truck_type",
            "origin_city",
            "origin_address",
            "destination_city",
            "destination_address",
            "loading_date",
            "proposed_price",
            "instructions",
            "publish",
        ]

    def validate_loading_date(self, value):
        if value < timezone.localdate():
            raise serializers.ValidationError("La date de chargement ne peut pas être dans le passé.")
        return value

    def create(self, validated_data):
        validated_data.pop("publish", None)
        validated_data["currency"] = settings.CARGOCONNECT["CURRENCY"]
        return super().create(validated_data)

    def update(self, instance, validated_data):
        validated_data.pop("publish", None)
        cargo = super().update(instance, validated_data)
        if "loading_date" in validated_data:
            services.refresh_expiry(cargo)
            cargo.save(update_fields=["expires_at"])
        return cargo
