from drf_spectacular.utils import extend_schema
from rest_framework import generics, parsers, permissions, status
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView

from apps.common.exceptions import BusinessRuleError
from apps.shipments.models import Shipment, ShipmentStatus

from . import identity as identity_services
from . import services
from .models import PhoneOTP
from .serializers import (
    ChangePasswordSerializer,
    ClientDocumentSerializer,
    ClientIdentitySerializer,
    LogoutSerializer,
    MeSerializer,
    OTPRequestSerializer,
    OTPVerifySerializer,
    PasswordResetSerializer,
    PhoneTokenObtainPairSerializer,
    RegisterSerializer,
    tokens_for,
)

ACTIVE_SHIPMENT_STATUSES = [ShipmentStatus.CONFIRMED, ShipmentStatus.LOADED, ShipmentStatus.IN_TRANSIT]


class RegisterView(generics.CreateAPIView):
    serializer_class = RegisterSerializer
    permission_classes = [permissions.AllowAny]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return Response({"user": MeSerializer(user).data, **tokens_for(user)}, status=status.HTTP_201_CREATED)


class LoginView(TokenObtainPairView):
    serializer_class = PhoneTokenObtainPairSerializer


class LogoutView(APIView):
    @extend_schema(request=LogoutSerializer, responses={204: None})
    def post(self, request):
        try:
            RefreshToken(request.data.get("refresh", "")).blacklist()
        except TokenError:
            pass  # jeton déjà invalide : la déconnexion est quand même effective côté client
        return Response(status=status.HTTP_204_NO_CONTENT)


class MeView(generics.RetrieveUpdateDestroyAPIView):
    """GET/PATCH : profil. DELETE : désactivation du compte (les données restent pour l'historique)."""

    serializer_class = MeSerializer
    http_method_names = ["get", "patch", "delete"]
    # Multipart pour envoyer la photo de profil ; JSON pour le reste.
    parser_classes = [parsers.JSONParser, parsers.MultiPartParser, parsers.FormParser]

    def get_object(self):
        return self.request.user

    def perform_destroy(self, user):
        active = Shipment.objects.filter(status__in=ACTIVE_SHIPMENT_STATUSES)
        if active.filter(client=user).exists() or active.filter(driver__user=user).exists():
            raise BusinessRuleError(
                "Impossible de désactiver le compte tant qu'un transport est en cours.", code="active_shipments"
            )
        user.is_active = False
        user.save(update_fields=["is_active"])


class ChangePasswordView(APIView):
    @extend_schema(request=ChangePasswordSerializer, responses={204: None})
    def post(self, request):
        serializer = ChangePasswordSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        request.user.set_password(serializer.validated_data["new_password"])
        request.user.save(update_fields=["password"])
        return Response(status=status.HTTP_204_NO_CONTENT)


class OTPRequestView(APIView):
    permission_classes = [permissions.AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "otp"

    @extend_schema(request=OTPRequestSerializer, responses={202: None})
    def post(self, request):
        serializer = OTPRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        services.request_otp(**serializer.validated_data)
        # Réponse identique que le compte existe ou non (pas d'énumération des numéros).
        return Response({"detail": "Si ce numéro est valide, un code vient d'être envoyé."}, status=202)


class VerifyPhoneView(APIView):
    @extend_schema(request=OTPVerifySerializer, responses={200: MeSerializer})
    def post(self, request):
        serializer = OTPVerifySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        services.consume_otp(
            phone=request.user.phone, purpose=PhoneOTP.Purpose.VERIFY_PHONE, code=serializer.validated_data["code"]
        )
        request.user.phone_verified = True
        request.user.save(update_fields=["phone_verified"])
        return Response(MeSerializer(request.user).data)


class PasswordResetView(APIView):
    permission_classes = [permissions.AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "otp"

    @extend_schema(request=PasswordResetSerializer, responses={204: None})
    def post(self, request):
        serializer = PasswordResetSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        services.consume_otp(phone=data["phone"], purpose=PhoneOTP.Purpose.RESET_PASSWORD, code=data["code"])
        user = data["user"]
        user.set_password(data["new_password"])
        user.phone_verified = True  # le code reçu prouve la possession du numéro
        user.save(update_fields=["password", "phone_verified"])
        return Response(status=status.HTTP_204_NO_CONTENT)


class IsClient(permissions.BasePermission):
    message = "Réservé aux comptes expéditeurs."

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and not request.user.is_driver)


class MyClientIdentityView(APIView):
    """GET : identité de l'expéditeur (404 si non renseignée). PUT : la crée ou la met à jour."""

    permission_classes = [IsClient]

    @extend_schema(responses={200: ClientIdentitySerializer})
    def get(self, request):
        identity = getattr(request.user, "client_identity", None)
        if identity is None:
            return Response({"detail": "Identité non renseignée."}, status=status.HTTP_404_NOT_FOUND)
        return Response(ClientIdentitySerializer(identity).data)

    @extend_schema(request=ClientIdentitySerializer, responses={200: ClientIdentitySerializer})
    def put(self, request):
        current = getattr(request.user, "client_identity", None)
        serializer = ClientIdentitySerializer(current, data=request.data)
        serializer.is_valid(raise_exception=True)
        identity = identity_services.save_identity(request.user, **serializer.validated_data)
        return Response(ClientIdentitySerializer(identity).data)


class MyClientDocumentsView(APIView):
    permission_classes = [IsClient]
    parser_classes = [parsers.MultiPartParser, parsers.FormParser]

    @extend_schema(request={"multipart/form-data": ClientDocumentSerializer}, responses={201: ClientDocumentSerializer})
    def post(self, request):
        identity = getattr(request.user, "client_identity", None)
        if identity is None:
            raise BusinessRuleError("Renseignez d'abord votre identité.", code="identity_missing")
        serializer = ClientDocumentSerializer(data=request.data, context={"identity": identity})
        serializer.is_valid(raise_exception=True)
        document = identity_services.add_document(identity, **serializer.validated_data)
        return Response(ClientDocumentSerializer(document).data, status=status.HTTP_201_CREATED)
