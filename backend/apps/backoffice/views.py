"""
API d'administration utilisée par l'espace « Administration » de l'application.
Réservée aux membres de l'équipe (is_staff) ; les décisions et l'ouverture des justificatifs
exigent en plus les permissions Django correspondantes, comme dans l'administration web.
"""

from django.contrib.admin.models import CHANGE, LogEntry
from django.db.models import Q
from django.shortcuts import get_object_or_404
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import generics, permissions, status
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts import identity as identity_services
from apps.accounts.models import ClientDocument, ClientIdentity, User
from apps.cargos.models import Cargo
from apps.common.exceptions import BusinessRuleError
from apps.drivers import services as driver_services
from apps.drivers.admin_views import _serve
from apps.drivers.models import DriverDocument, DriverProfile
from apps.reports.models import Report
from apps.shipments.models import Shipment

from . import serializers as s
from .stats import dashboard


class IsStaff(permissions.BasePermission):
    message = "Réservé à l'équipe CargoConnect."

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.is_active and request.user.is_staff)


def require_perm(user, permission: str) -> None:
    if not user.has_perm(permission):
        raise PermissionDenied("Vous n'avez pas le droit d'effectuer cette action.")


def log_admin_action(user, obj, message: str) -> None:
    """Historique des actions de l'équipe, visible dans l'administration web (« Historique »)."""
    LogEntry.objects.log_actions(user_id=user.pk, queryset=[obj], action_flag=CHANGE, change_message=message, single_object=True)


class StaffMixin:
    permission_classes = [IsStaff]


def _search(qs, request, *fields):
    term = request.query_params.get("search", "").strip()
    if not term:
        return qs
    query = Q()
    for field in fields:
        query |= Q(**{f"{field}__icontains": term})
    return qs.filter(query)


STATUS_PARAM = OpenApiParameter("status", str)
SEARCH_PARAM = OpenApiParameter("search", str)


class DashboardView(StaffMixin, APIView):
    @extend_schema(responses={200: dict})
    def get(self, request):
        return Response(dashboard())


# --- Transporteurs --------------------------------------------------------------


@extend_schema(parameters=[STATUS_PARAM, SEARCH_PARAM])
class DriverListView(StaffMixin, generics.ListAPIView):
    serializer_class = s.AdminDriverListSerializer

    def get_queryset(self):
        qs = DriverProfile.objects.select_related("user").order_by("-created_at")
        if status_param := self.request.query_params.get("status"):
            qs = qs.filter(verification_status=status_param)
        return _search(qs, self.request, "user__full_name", "user__phone", "company_name")


class DriverDetailView(StaffMixin, generics.RetrieveAPIView):
    serializer_class = s.AdminDriverDetailSerializer
    queryset = DriverProfile.objects.select_related("user").prefetch_related("vehicles", "verification_events__decided_by")


class DriverDecisionView(StaffMixin, APIView):
    @extend_schema(request=s.DecisionSerializer, responses={200: s.AdminDriverDetailSerializer})
    def post(self, request, pk):
        require_perm(request.user, "drivers.change_driverprofile")
        profile = get_object_or_404(DriverProfile, pk=pk)
        data = s.DecisionSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        driver_services.decide_profile(profile, data.validated_data["status"], by=request.user, reason=data.validated_data["reason"])
        return Response(s.AdminDriverDetailSerializer(profile, context={"request": request}).data)


class DriverDocumentDecisionView(StaffMixin, APIView):
    @extend_schema(request=s.DecisionSerializer, responses={200: s.AdminDriverDocumentSerializer})
    def post(self, request, pk):
        require_perm(request.user, "drivers.change_driverdocument")
        document = get_object_or_404(DriverDocument, pk=pk)
        data = s.DecisionSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        driver_services.decide_document(document, data.validated_data["status"], by=request.user, reason=data.validated_data["reason"])
        return Response(s.AdminDriverDocumentSerializer(document, context={"request": request}).data)


class DriverDocumentFileView(StaffMixin, APIView):
    """Image ou PDF du justificatif, chaque ouverture étant journalisée (comme dans l'administration web)."""

    @extend_schema(responses={(200, "application/octet-stream"): OpenApiTypes.BINARY})
    def get(self, request, pk):
        document = get_object_or_404(DriverDocument, pk=pk)
        return _serve(request, document, "drivers.view_driverdocument", document=document)


# --- Identités clients ------------------------------------------------------------


@extend_schema(parameters=[STATUS_PARAM, SEARCH_PARAM])
class IdentityListView(StaffMixin, generics.ListAPIView):
    serializer_class = s.AdminIdentityListSerializer

    def get_queryset(self):
        qs = ClientIdentity.objects.select_related("user").order_by("-created_at")
        if status_param := self.request.query_params.get("status"):
            qs = qs.filter(verification_status=status_param)
        return _search(qs, self.request, "user__full_name", "user__phone", "cin_number", "ice", "company_name")


class IdentityDetailView(StaffMixin, generics.RetrieveAPIView):
    serializer_class = s.AdminIdentityDetailSerializer
    queryset = ClientIdentity.objects.select_related("user")


class IdentityDecisionView(StaffMixin, APIView):
    @extend_schema(request=s.DecisionSerializer, responses={200: s.AdminIdentityDetailSerializer})
    def post(self, request, pk):
        require_perm(request.user, "accounts.change_clientidentity")
        identity = get_object_or_404(ClientIdentity, pk=pk)
        data = s.DecisionSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        decision, reason = data.validated_data["status"], data.validated_data["reason"]
        identity_services.decide_identity(identity, decision, reason=reason)
        log_admin_action(request.user, identity, f"Identité {'vérifiée' if decision == 'verified' else f'refusée : {reason}'} (application)")
        return Response(s.AdminIdentityDetailSerializer(identity, context={"request": request}).data)


class ClientDocumentDecisionView(StaffMixin, APIView):
    @extend_schema(request=s.DecisionSerializer, responses={200: s.AdminClientDocumentSerializer})
    def post(self, request, pk):
        require_perm(request.user, "accounts.change_clientdocument")
        document = get_object_or_404(ClientDocument, pk=pk)
        data = s.DecisionSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        identity_services.decide_document(document, data.validated_data["status"], by=request.user, reason=data.validated_data["reason"])
        log_admin_action(request.user, document.identity, f"{document} : {document.get_status_display()} (application)")
        return Response(s.AdminClientDocumentSerializer(document, context={"request": request}).data)


class ClientDocumentFileView(StaffMixin, APIView):
    @extend_schema(responses={(200, "application/octet-stream"): OpenApiTypes.BINARY})
    def get(self, request, pk):
        document = get_object_or_404(ClientDocument, pk=pk)
        return _serve(request, document, "accounts.view_clientdocument", client_document=document)


# --- Comptes ------------------------------------------------------------------------


@extend_schema(parameters=[OpenApiParameter("role", str, enum=["client", "driver", "staff"]), SEARCH_PARAM])
class UserListView(StaffMixin, generics.ListAPIView):
    serializer_class = s.AdminUserSerializer

    def get_queryset(self):
        qs = User.objects.select_related("driver_profile", "client_identity").order_by("-date_joined")
        role = self.request.query_params.get("role")
        if role == "driver":
            qs = qs.filter(driver_profile__isnull=False)
        elif role == "client":
            qs = qs.filter(driver_profile__isnull=True, is_staff=False)
        elif role == "staff":
            qs = qs.filter(is_staff=True)
        return _search(qs, self.request, "full_name", "phone", "email")


class UserActivationView(StaffMixin, APIView):
    """Suspendre ou réactiver un compte (fraude, abus...). Un compte de l'équipe ne se suspend pas d'ici."""

    @extend_schema(request={"application/json": {"type": "object", "properties": {"is_active": {"type": "boolean"}}}}, responses={200: s.AdminUserSerializer})
    def post(self, request, pk):
        require_perm(request.user, "accounts.change_user")
        user = get_object_or_404(User, pk=pk)
        if user.is_staff:
            raise BusinessRuleError("Les comptes de l'équipe se gèrent depuis l'administration web.", code="staff_account")
        is_active = bool(request.data.get("is_active"))
        user.is_active = is_active
        user.save(update_fields=["is_active"])
        log_admin_action(request.user, user, f"Compte {'réactivé' if is_active else 'suspendu'} (application)")
        return Response(s.AdminUserSerializer(user, context={"request": request}).data)


# --- Annonces, transports, signalements ------------------------------------------------


@extend_schema(parameters=[STATUS_PARAM, SEARCH_PARAM])
class CargoListView(StaffMixin, generics.ListAPIView):
    serializer_class = s.AdminCargoSerializer

    def get_queryset(self):
        qs = Cargo.objects.select_related("client", "origin_city", "destination_city", "shipment").order_by("-created_at")
        if status_param := self.request.query_params.get("status"):
            qs = qs.filter(status=status_param)
        return _search(qs, self.request, "title", "client__full_name", "client__phone")


@extend_schema(parameters=[STATUS_PARAM, SEARCH_PARAM])
class ShipmentListView(StaffMixin, generics.ListAPIView):
    serializer_class = s.AdminShipmentListSerializer

    def get_queryset(self):
        qs = Shipment.objects.select_related(
            "cargo__origin_city", "cargo__destination_city", "client", "driver__user"
        ).order_by("-confirmed_at")
        if status_param := self.request.query_params.get("status"):
            qs = qs.filter(status__in=status_param.split(","))
        return _search(qs, self.request, "cargo__title", "client__full_name", "driver__user__full_name")


class ShipmentDetailView(StaffMixin, generics.RetrieveAPIView):
    serializer_class = s.AdminShipmentDetailSerializer
    queryset = Shipment.objects.select_related(
        "cargo__origin_city", "cargo__destination_city", "client", "driver__user", "offer__vehicle"
    ).prefetch_related("events__actor", "events__photos")


@extend_schema(parameters=[STATUS_PARAM])
class ReportListView(StaffMixin, generics.ListAPIView):
    serializer_class = s.AdminReportSerializer

    def get_queryset(self):
        qs = Report.objects.select_related("reporter", "reported_user", "cargo").order_by("-created_at")
        if status_param := self.request.query_params.get("status"):
            qs = qs.filter(status__in=status_param.split(","))
        return qs


class ReportUpdateView(StaffMixin, generics.UpdateAPIView):
    serializer_class = s.AdminReportSerializer
    queryset = Report.objects.all()
    http_method_names = ["patch"]

    def perform_update(self, serializer):
        require_perm(self.request.user, "reports.change_report")
        report = serializer.save()
        log_admin_action(self.request.user, report, f"Signalement : {report.get_status_display()} (application)")
