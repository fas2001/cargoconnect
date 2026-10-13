from django.db.models import Q
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.reviews.serializers import ReviewCreateSerializer, ReviewSerializer
from apps.reviews.services import create_review

from . import services
from .models import Shipment, ShipmentStatus
from .serializers import ShipmentEventCreateSerializer, ShipmentListSerializer, ShipmentSerializer

ACTIVE = [ShipmentStatus.CONFIRMED, ShipmentStatus.LOADED, ShipmentStatus.IN_TRANSIT, ShipmentStatus.DELIVERED, ShipmentStatus.DISPUTED]


class ShipmentViewSet(viewsets.ReadOnlyModelViewSet):
    """Transports où l'utilisateur est client ou chauffeur. Personne d'autre n'y a accès."""

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return Shipment.objects.none()
        user = self.request.user
        qs = Shipment.objects.filter(Q(client=user) | Q(driver__user=user)).select_related(
            "client",
            "driver__user",
            "offer__vehicle",
            "cargo__origin_city",
            "cargo__destination_city",
            "cargo__category",
            "cargo__client",
        )
        if self.action == "list":
            role = self.request.query_params.get("role")
            if role == "client":
                qs = qs.filter(client=user)
            elif role == "driver":
                qs = qs.filter(driver__user=user)
            scope = self.request.query_params.get("scope")
            if scope == "active":
                qs = qs.filter(status__in=ACTIVE)
            elif scope == "past":
                qs = qs.exclude(status__in=ACTIVE)
            return qs.prefetch_related("cargo__photos").order_by("-confirmed_at")
        return qs.prefetch_related("events__actor", "cargo__photos")

    def get_serializer_class(self):
        return ShipmentListSerializer if self.action == "list" else ShipmentSerializer

    @extend_schema(
        parameters=[
            OpenApiParameter("role", str, enum=["client", "driver"]),
            OpenApiParameter("scope", str, enum=["active", "past"]),
        ]
    )
    def list(self, request, *args, **kwargs):
        return super().list(request, *args, **kwargs)

    @extend_schema(request=ShipmentEventCreateSerializer, responses={201: ShipmentSerializer})
    @action(detail=True, methods=["post"])
    def events(self, request, pk=None):
        shipment = self.get_object()
        serializer = ShipmentEventCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        services.change_status(
            shipment=shipment,
            user=request.user,
            to_status=serializer.validated_data["status"],
            note=serializer.validated_data["note"],
        )
        shipment = self.get_queryset().get(pk=shipment.pk)
        return Response(ShipmentSerializer(shipment, context=self.get_serializer_context()).data, status=status.HTTP_201_CREATED)

    @extend_schema(request=ReviewCreateSerializer, responses={201: ReviewSerializer})
    @action(detail=True, methods=["post"])
    def review(self, request, pk=None):
        shipment = self.get_object()
        serializer = ReviewCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        review = create_review(shipment=shipment, author=request.user, **serializer.validated_data)
        return Response(ReviewSerializer(review).data, status=status.HTTP_201_CREATED)
