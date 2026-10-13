from rest_framework import generics, mixins, parsers, viewsets
from rest_framework.exceptions import NotFound

from apps.common.permissions import IsDriver
from apps.vehicles.models import Vehicle

from . import services
from .models import DriverDocument, DriverProfile
from .serializers import DriverDocumentSerializer, DriverProfileSerializer, PublicDriverSerializer, VehicleSerializer


class MyDriverProfileView(generics.RetrieveUpdateAPIView):
    """
    GET : profil chauffeur de l'utilisateur.
    PATCH : met à jour entreprise / présentation.
    Le profil est créé à l'inscription d'un compte chauffeur.
    """

    serializer_class = DriverProfileSerializer
    http_method_names = ["get", "patch"]

    def get_object(self):
        try:
            return self.request.user.driver_profile
        except DriverProfile.DoesNotExist as exc:
            raise NotFound("Ce compte n'est pas un compte chauffeur.") from exc


class MyDocumentsViewSet(mixins.ListModelMixin, mixins.CreateModelMixin, viewsets.GenericViewSet):
    serializer_class = DriverDocumentSerializer
    permission_classes = [IsDriver]
    parser_classes = [parsers.MultiPartParser, parsers.FormParser]

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return DriverDocument.objects.none()
        return services.current_documents(self.request.user.driver_profile)

    def perform_create(self, serializer):
        serializer.instance = services.add_document(self.request.user.driver_profile, **serializer.validated_data)


class MyVehiclesViewSet(viewsets.ModelViewSet):
    serializer_class = VehicleSerializer
    permission_classes = [IsDriver]

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return Vehicle.objects.none()
        return Vehicle.objects.filter(driver=self.request.user.driver_profile)

    def perform_create(self, serializer):
        serializer.save(driver=self.request.user.driver_profile)

    def perform_destroy(self, vehicle):
        # Désactivation plutôt que suppression : le véhicule peut être lié à des offres passées.
        vehicle.is_active = False
        vehicle.save(update_fields=["is_active", "updated_at"])


class PublicDriverView(generics.RetrieveAPIView):
    serializer_class = PublicDriverSerializer
    queryset = DriverProfile.objects.select_related("user").filter(user__is_active=True)
