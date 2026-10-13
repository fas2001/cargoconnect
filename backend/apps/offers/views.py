from django.db.models import Q
from drf_spectacular.utils import extend_schema
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response

from apps.shipments.serializers import ShipmentSerializer

from . import services
from .models import Offer
from .serializers import MyOfferListSerializer, OfferSerializer, OfferWriteSerializer, OwnOfferSerializer


class OfferViewSet(mixins.RetrieveModelMixin, mixins.UpdateModelMixin, viewsets.GenericViewSet):
    """
    Un chauffeur gère ses offres (modifier, retirer) ; l'auteur de l'annonce les accepte ou les refuse.
    Une offre n'est visible que par ces deux personnes.
    """

    http_method_names = ["get", "post", "patch"]

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return Offer.objects.none()
        user = self.request.user
        visible = Q(cargo__client=user)
        if user.is_driver:
            visible |= Q(driver=user.driver_profile)
        return Offer.objects.filter(visible).select_related("cargo", "driver__user", "vehicle")

    def get_serializer_class(self):
        if self.action == "mine":
            return MyOfferListSerializer
        if self.action == "partial_update":
            return OfferWriteSerializer
        return OwnOfferSerializer

    def _is_author(self, offer):
        return self.request.user.is_driver and offer.driver_id == self.request.user.driver_profile.pk

    def retrieve(self, request, *args, **kwargs):
        offer = self.get_object()
        serializer_class = OwnOfferSerializer if self._is_author(offer) else OfferSerializer
        return Response(serializer_class(offer, context=self.get_serializer_context()).data)

    @extend_schema(responses={200: MyOfferListSerializer(many=True)})
    @action(detail=False, methods=["get"])
    def mine(self, request):
        if not request.user.is_driver:
            return Response([])
        qs = Offer.objects.filter(driver=request.user.driver_profile).select_related(
            "cargo__origin_city", "cargo__destination_city", "cargo__category", "vehicle"
        ).prefetch_related("cargo__photos")
        status_param = request.query_params.get("status")
        if status_param:
            qs = qs.filter(status__in=status_param.split(","))
        page = self.paginate_queryset(qs.order_by("-updated_at"))
        return self.get_paginated_response(MyOfferListSerializer(page, many=True, context=self.get_serializer_context()).data)

    @extend_schema(request=OfferWriteSerializer, responses={200: OwnOfferSerializer})
    def partial_update(self, request, *args, **kwargs):
        offer = self.get_object()
        if not self._is_author(offer):
            raise PermissionDenied("Seul le chauffeur auteur peut modifier cette proposition.")
        serializer = OfferWriteSerializer(offer, data=request.data, partial=True, context=self.get_serializer_context())
        serializer.is_valid(raise_exception=True)
        offer = services.update_offer(offer, **serializer.validated_data)
        return Response(OwnOfferSerializer(offer, context=self.get_serializer_context()).data)

    @extend_schema(request=None, responses={200: OwnOfferSerializer})
    @action(detail=True, methods=["post"])
    def withdraw(self, request, pk=None):
        offer = self.get_object()
        if not self._is_author(offer):
            raise PermissionDenied("Seul le chauffeur auteur peut retirer cette proposition.")
        return Response(OwnOfferSerializer(services.withdraw_offer(offer), context=self.get_serializer_context()).data)

    @extend_schema(request=None, responses={200: OfferSerializer})
    @action(detail=True, methods=["post"])
    def reject(self, request, pk=None):
        offer = self.get_object()
        if offer.cargo.client_id != request.user.pk:
            raise PermissionDenied("Seul l'auteur de l'annonce peut refuser une proposition.")
        return Response(OfferSerializer(services.reject_offer(offer), context=self.get_serializer_context()).data)

    @extend_schema(request=None, responses={201: ShipmentSerializer})
    @action(detail=True, methods=["post"])
    def accept(self, request, pk=None):
        offer = self.get_object()
        if offer.cargo.client_id != request.user.pk:
            raise PermissionDenied("Seul l'auteur de l'annonce peut accepter une proposition.")
        shipment = services.accept_offer(offer=offer, user=request.user)
        return Response(ShipmentSerializer(shipment, context=self.get_serializer_context()).data, status=status.HTTP_201_CREATED)
