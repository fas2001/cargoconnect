import django_filters
from django.conf import settings
from django.db.models import Count, Q
from django.utils import timezone
from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework import mixins, parsers, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound, PermissionDenied
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.common.exceptions import BusinessRuleError
from apps.common.permissions import IsDriver
from apps.offers import services as offer_services
from apps.offers.models import Offer, OfferStatus
from apps.offers.serializers import OfferSerializer, OfferWriteSerializer, OwnOfferSerializer
from apps.vehicles.models import TruckType

from . import services
from .models import Cargo, CargoStatus, City, GoodsCategory
from .serializers import (
    CargoDetailSerializer,
    CargoListSerializer,
    CargoPhotoSerializer,
    CargoWriteSerializer,
    CitySerializer,
    GoodsCategorySerializer,
)


class CargoFilter(django_filters.FilterSet):
    origin_city = django_filters.NumberFilter(field_name="origin_city_id")
    destination_city = django_filters.NumberFilter(field_name="destination_city_id")
    date_from = django_filters.DateFilter(field_name="loading_date", lookup_expr="gte")
    date_to = django_filters.DateFilter(field_name="loading_date", lookup_expr="lte")
    weight_min = django_filters.NumberFilter(field_name="weight_kg", lookup_expr="gte")
    weight_max = django_filters.NumberFilter(field_name="weight_kg", lookup_expr="lte")
    truck_type = django_filters.MultipleChoiceFilter(choices=TruckType.choices)
    category = django_filters.NumberFilter(field_name="category_id")
    status = django_filters.MultipleChoiceFilter(choices=CargoStatus.choices)

    class Meta:
        model = Cargo
        fields = []


class CargoViewSet(mixins.CreateModelMixin, mixins.RetrieveModelMixin, mixins.UpdateModelMixin, mixins.ListModelMixin, viewsets.GenericViewSet):
    """
    `GET /cargos/` : place de marché (annonces publiées des autres utilisateurs).
    `GET /cargos/mine/` : annonces de l'utilisateur, tous statuts.
    """

    filterset_class = CargoFilter
    http_method_names = ["get", "post", "patch"]

    def _base_queryset(self):
        return (
            Cargo.objects.select_related(
                "category", "origin_city", "destination_city", "client", "shipment__driver"
            )
            .prefetch_related("photos")
            .annotate(pending_offers_count=Count("offers", filter=Q(offers__status=OfferStatus.PENDING)))
        )

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return Cargo.objects.none()
        user = self.request.user
        qs = self._base_queryset()
        if self.action == "list":
            return (
                qs.filter(status=CargoStatus.PUBLISHED, expires_at__gte=timezone.now())
                .exclude(client=user)
                .order_by("loading_date", "-published_at")
            )
        if self.action == "mine":
            return qs.filter(client=user).order_by("-created_at")
        if self.action in ("partial_update", "update", "publish", "cancel", "photos", "delete_photo"):
            return qs.filter(client=user)
        # Consultation : sa propre annonce, une annonce publiée, ou une annonce sur laquelle on a proposé un tarif.
        visible = Q(client=user) | Q(status=CargoStatus.PUBLISHED)
        if user.is_driver:
            visible |= Q(offers__driver=user.driver_profile)
        return qs.filter(visible).distinct()

    def get_serializer_class(self):
        if self.action in ("create", "partial_update", "update"):
            return CargoWriteSerializer
        if self.action in ("list", "mine"):
            return CargoListSerializer
        return CargoDetailSerializer

    def _detail(self, cargo, status_code=status.HTTP_200_OK):
        cargo = self._base_queryset().get(pk=cargo.pk)
        return Response(CargoDetailSerializer(cargo, context=self.get_serializer_context()).data, status=status_code)

    @extend_schema(responses={201: CargoDetailSerializer})
    def create(self, request, *args, **kwargs):
        if request.user.is_driver:
            raise PermissionDenied("Un compte chauffeur ne peut pas publier d'annonce.")
        serializer = CargoWriteSerializer(data=request.data, context=self.get_serializer_context())
        serializer.is_valid(raise_exception=True)
        cargo = serializer.save(client=request.user)
        if serializer.validated_data.get("publish"):
            cargo = services.publish_cargo(cargo)
        return self._detail(cargo, status.HTTP_201_CREATED)

    @extend_schema(responses={200: CargoDetailSerializer})
    def partial_update(self, request, *args, **kwargs):
        cargo = self.get_object()
        if not services.is_editable(cargo):
            raise BusinessRuleError(
                "Cette annonce ne peut plus être modifiée (des propositions ont déjà été reçues).", code="cargo_locked"
            )
        serializer = CargoWriteSerializer(cargo, data=request.data, partial=True, context=self.get_serializer_context())
        serializer.is_valid(raise_exception=True)
        cargo = serializer.save()
        return self._detail(cargo)

    @action(detail=False, methods=["get"])
    def mine(self, request):
        return self.list(request)

    @extend_schema(request=None, responses={200: CargoDetailSerializer})
    @action(detail=True, methods=["post"])
    def publish(self, request, pk=None):
        return self._detail(services.publish_cargo(self.get_object()))

    @extend_schema(
        request={"application/json": {"type": "object", "properties": {"reason": {"type": "string"}}}},
        responses={200: CargoDetailSerializer},
    )
    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        reason = str(request.data.get("reason", ""))[:255]
        return self._detail(services.cancel_cargo(self.get_object(), reason=reason))

    @extend_schema(request={"multipart/form-data": CargoPhotoSerializer}, responses={201: CargoPhotoSerializer})
    @action(detail=True, methods=["post"], parser_classes=[parsers.MultiPartParser, parsers.FormParser])
    def photos(self, request, pk=None):
        cargo = self.get_object()
        if cargo.status not in (CargoStatus.DRAFT, CargoStatus.PUBLISHED):
            raise BusinessRuleError("Impossible d'ajouter des photos à cette annonce.", code="cargo_locked")
        if cargo.photos.count() >= settings.CARGOCONNECT["MAX_CARGO_PHOTOS"]:
            raise BusinessRuleError("Nombre maximum de photos atteint.", code="too_many_photos")
        serializer = CargoPhotoSerializer(data=request.data, context=self.get_serializer_context())
        serializer.is_valid(raise_exception=True)
        serializer.save(cargo=cargo)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @extend_schema(responses={204: None})
    @action(detail=True, methods=["delete"], url_path=r"photos/(?P<photo_id>[0-9a-f-]+)")
    def delete_photo(self, request, pk=None, photo_id=None):
        cargo = self.get_object()
        deleted, _ = cargo.photos.filter(pk=photo_id).delete()
        if not deleted:
            return Response(status=status.HTTP_404_NOT_FOUND)
        return Response(status=status.HTTP_204_NO_CONTENT)


class CargoOffersView(APIView):
    """
    GET : l'auteur de l'annonce voit toutes les offres ; un chauffeur ne voit que les siennes.
    POST : un chauffeur propose un tarif.
    """

    def _get_cargo(self, pk):
        visible = Q(client=self.request.user) | Q(status=CargoStatus.PUBLISHED)
        if self.request.user.is_driver:
            visible |= Q(offers__driver=self.request.user.driver_profile)
        try:
            return Cargo.objects.filter(visible).distinct().get(pk=pk)
        except Cargo.DoesNotExist as exc:
            raise NotFound() from exc

    @extend_schema(responses={200: OfferSerializer(many=True)})
    def get(self, request, pk):
        cargo = self._get_cargo(pk)
        offers = Offer.objects.filter(cargo=cargo).select_related("driver__user", "vehicle").order_by("price", "created_at")
        if cargo.client_id == request.user.pk:
            status_filter = request.query_params.get("status")
            if status_filter:
                offers = offers.filter(status=status_filter)
            return Response(OfferSerializer(offers, many=True, context={"request": request}).data)
        if not request.user.is_driver:
            raise PermissionDenied("Vous n'avez pas accès aux propositions de cette annonce.")
        mine = offers.filter(driver=request.user.driver_profile)
        return Response(OwnOfferSerializer(mine, many=True, context={"request": request}).data)

    @extend_schema(request=OfferWriteSerializer, responses={201: OwnOfferSerializer})
    def post(self, request, pk):
        if not IsDriver().has_permission(request, self):
            raise PermissionDenied(IsDriver.message)
        cargo = self._get_cargo(pk)
        serializer = OfferWriteSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        offer = offer_services.create_offer(
            cargo=cargo, driver=request.user.driver_profile, **serializer.validated_data
        )
        return Response(OwnOfferSerializer(offer, context={"request": request}).data, status=status.HTTP_201_CREATED)


class CityListView(APIView):
    permission_classes = []
    authentication_classes = []

    @extend_schema(responses={200: CitySerializer(many=True)})
    def get(self, request):
        return Response(CitySerializer(City.objects.filter(is_active=True), many=True).data)


class GoodsCategoryListView(APIView):
    permission_classes = []
    authentication_classes = []

    @extend_schema(responses={200: GoodsCategorySerializer(many=True)})
    def get(self, request):
        return Response(GoodsCategorySerializer(GoodsCategory.objects.filter(is_active=True), many=True).data)


class TruckTypeListView(APIView):
    permission_classes = []
    authentication_classes = []

    @extend_schema(responses={200: OpenApiResponse(description="Liste {value, label}")})
    def get(self, request):
        return Response([{"value": value, "label": label} for value, label in TruckType.choices])
