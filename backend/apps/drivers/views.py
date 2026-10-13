from rest_framework import generics, mixins, parsers, status, viewsets
from rest_framework.exceptions import NotFound
from rest_framework.response import Response

from apps.common.exceptions import BusinessRuleError
from apps.common.permissions import IsDriver
from apps.vehicles.models import Vehicle

from .models import DriverDocument, DriverProfile, VerificationStatus
from .serializers import DriverDocumentSerializer, DriverProfileSerializer, PublicDriverSerializer, VehicleSerializer


class MyDriverProfileView(generics.RetrieveUpdateAPIView):
    """
    GET : profil chauffeur de l'utilisateur.
    POST : active le rôle chauffeur (crée le profil).
    PATCH : met à jour entreprise / présentation.
    """

    serializer_class = DriverProfileSerializer
    http_method_names = ["get", "post", "patch"]

    def get_object(self):
        try:
            return self.request.user.driver_profile
        except DriverProfile.DoesNotExist as exc:
            raise NotFound("Aucun profil chauffeur. Activez d'abord l'espace chauffeur.") from exc

    def post(self, request):
        if request.user.is_driver:
            raise BusinessRuleError("L'espace chauffeur est déjà activé.", code="already_driver")
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(user=request.user)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class MyDocumentsViewSet(mixins.ListModelMixin, mixins.CreateModelMixin, viewsets.GenericViewSet):
    serializer_class = DriverDocumentSerializer
    permission_classes = [IsDriver]
    parser_classes = [parsers.MultiPartParser, parsers.FormParser]

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return DriverDocument.objects.none()
        return self.request.user.driver_profile.documents.all()

    def perform_create(self, serializer):
        profile = self.request.user.driver_profile
        serializer.save(driver=profile)
        # Un nouveau justificatif relance la vérification si le profil avait été refusé.
        if profile.verification_status == VerificationStatus.REJECTED:
            profile.verification_status = VerificationStatus.PENDING
            profile.save(update_fields=["verification_status", "updated_at"])


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
