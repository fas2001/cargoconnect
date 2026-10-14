from django.urls import reverse
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from apps.accounts import identity as identity_services
from apps.accounts.models import ClientDocument, ClientIdentity, User
from apps.cargos.models import Cargo
from apps.drivers import services as driver_services
from apps.drivers.models import DriverDocument, DriverProfile, VerificationEvent, VerificationStatus
from apps.drivers.serializers import VehicleSerializer
from apps.reports.models import Report
from apps.shipments.models import Shipment
from apps.shipments.serializers import ShipmentEventSerializer


def _absolute(context, name, pk):
    url = reverse(name, args=[pk])
    request = context.get("request")
    return request.build_absolute_uri(url) if request else url


def _avatar(context, user):
    if not user.avatar:
        return None
    request = context.get("request")
    return request.build_absolute_uri(user.avatar.url) if request else user.avatar.url


class DecisionSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=[VerificationStatus.VERIFIED, VerificationStatus.REJECTED])
    reason = serializers.CharField(required=False, allow_blank=True, max_length=255, default="")

    def validate(self, attrs):
        if attrs["status"] == VerificationStatus.REJECTED and not attrs["reason"].strip():
            raise serializers.ValidationError({"reason": "Indiquez le motif du refus : il est envoyé à l'utilisateur."})
        return attrs


# --- Transporteurs --------------------------------------------------------------


class AdminDriverDocumentSerializer(serializers.ModelSerializer):
    doc_type_label = serializers.CharField(source="get_doc_type_display")
    vehicle_label = serializers.CharField(source="vehicle.registration_number", default="")
    is_expired = serializers.BooleanField()
    file_url = serializers.SerializerMethodField()

    class Meta:
        model = DriverDocument
        fields = [
            "id",
            "doc_type",
            "doc_type_label",
            "side",
            "vehicle_label",
            "document_number",
            "holder_name",
            "issuer",
            "expires_on",
            "covers_goods",
            "data_source",
            "status",
            "review_note",
            "is_expired",
            "file_url",
            "created_at",
        ]

    def get_file_url(self, document) -> str:
        return _absolute(self.context, "backoffice-driver-document-file", document.pk)


class VerificationEventSerializer(serializers.ModelSerializer):
    decided_by = serializers.CharField(source="decided_by.full_name", default="")
    document = serializers.CharField(source="document.get_doc_type_display", default="")

    class Meta:
        model = VerificationEvent
        fields = ["id", "status", "reason", "decided_by", "document", "created_at"]


class AdminDriverListSerializer(serializers.ModelSerializer):
    name = serializers.CharField(source="user.full_name")
    phone = serializers.CharField(source="user.phone")
    avatar = serializers.SerializerMethodField()
    progress = serializers.SerializerMethodField()

    class Meta:
        model = DriverProfile
        fields = ["id", "name", "phone", "avatar", "company_name", "verification_status", "progress", "created_at"]

    def get_avatar(self, profile) -> str | None:
        return _avatar(self.context, profile.user)

    @extend_schema_field(serializers.DictField())
    def get_progress(self, profile):
        items = driver_services.checklist(profile)
        return {
            "verified": sum(1 for i in items if i["state"] == "verified"),
            "pending": sum(1 for i in items if i["state"] == "pending"),
            "total": len(items),
        }


class AdminDriverDetailSerializer(AdminDriverListSerializer):
    email = serializers.CharField(source="user.email")
    phone_verified = serializers.BooleanField(source="user.phone_verified")
    is_active = serializers.BooleanField(source="user.is_active")
    user_id = serializers.UUIDField(source="user.id")
    vehicles = VehicleSerializer(many=True)
    documents = serializers.SerializerMethodField()
    checklist = serializers.SerializerMethodField()
    events = VerificationEventSerializer(source="verification_events", many=True)

    class Meta(AdminDriverListSerializer.Meta):
        fields = AdminDriverListSerializer.Meta.fields + [
            "user_id",
            "email",
            "phone_verified",
            "is_active",
            "rejection_reason",
            "vehicles",
            "documents",
            "checklist",
            "events",
        ]

    @extend_schema_field(AdminDriverDocumentSerializer(many=True))
    def get_documents(self, profile):
        docs = driver_services.current_documents(profile).select_related("vehicle")
        return AdminDriverDocumentSerializer(docs, many=True, context=self.context).data

    @extend_schema_field(serializers.ListField(child=serializers.DictField()))
    def get_checklist(self, profile):
        return driver_services.checklist(profile)


# --- Identités clients ------------------------------------------------------------


class AdminClientDocumentSerializer(serializers.ModelSerializer):
    doc_type_label = serializers.CharField(source="get_doc_type_display")
    file_url = serializers.SerializerMethodField()

    class Meta:
        model = ClientDocument
        fields = ["id", "doc_type", "doc_type_label", "side", "status", "review_note", "file_url", "created_at"]

    def get_file_url(self, document) -> str:
        return _absolute(self.context, "backoffice-client-document-file", document.pk)


class AdminIdentityListSerializer(serializers.ModelSerializer):
    name = serializers.CharField(source="user.full_name")
    phone = serializers.CharField(source="user.phone")
    avatar = serializers.SerializerMethodField()
    status = serializers.SerializerMethodField()

    class Meta:
        model = ClientIdentity
        fields = [
            "id",
            "name",
            "phone",
            "avatar",
            "account_type",
            "cin_number",
            "company_name",
            "ice",
            "verification_status",
            "status",
            "created_at",
        ]

    def get_avatar(self, identity) -> str | None:
        return _avatar(self.context, identity.user)

    def get_status(self, identity) -> str:
        return identity_services.status_of(identity.user)


class AdminIdentityDetailSerializer(AdminIdentityListSerializer):
    user_id = serializers.UUIDField(source="user.id")
    email = serializers.CharField(source="user.email")
    is_active = serializers.BooleanField(source="user.is_active")
    documents = serializers.SerializerMethodField()
    checklist = serializers.SerializerMethodField()

    class Meta(AdminIdentityListSerializer.Meta):
        fields = AdminIdentityListSerializer.Meta.fields + ["user_id", "email", "is_active", "rejection_reason", "documents", "checklist"]

    @extend_schema_field(AdminClientDocumentSerializer(many=True))
    def get_documents(self, identity):
        return AdminClientDocumentSerializer(identity_services.current_documents(identity), many=True, context=self.context).data

    @extend_schema_field(serializers.ListField(child=serializers.DictField()))
    def get_checklist(self, identity):
        return identity_services.checklist(identity)


# --- Comptes, annonces, transports, signalements -----------------------------------


class AdminUserSerializer(serializers.ModelSerializer):
    role = serializers.SerializerMethodField()
    avatar = serializers.SerializerMethodField()
    verification = serializers.SerializerMethodField()
    driver_id = serializers.UUIDField(source="driver_profile.id", default=None)
    identity_id = serializers.UUIDField(source="client_identity.id", default=None)

    class Meta:
        model = User
        fields = [
            "id",
            "full_name",
            "phone",
            "email",
            "avatar",
            "role",
            "verification",
            "driver_id",
            "identity_id",
            "phone_verified",
            "is_active",
            "is_staff",
            "date_joined",
        ]

    def get_role(self, user) -> str:
        return "staff" if user.is_staff else user.roles[0]

    def get_avatar(self, user) -> str | None:
        return _avatar(self.context, user)

    def get_verification(self, user) -> str:
        if user.is_driver:
            return user.driver_profile.verification_status
        return identity_services.status_of(user)


class AdminCargoSerializer(serializers.ModelSerializer):
    client = serializers.CharField(source="client.full_name")
    origin = serializers.CharField(source="origin_city.name_fr")
    destination = serializers.CharField(source="destination_city.name_fr")
    status_label = serializers.CharField(source="get_status_display")
    offers_count = serializers.IntegerField(source="offers.count")
    shipment_id = serializers.UUIDField(source="shipment.id", default=None)

    class Meta:
        model = Cargo
        fields = [
            "id",
            "title",
            "client",
            "origin",
            "destination",
            "loading_date",
            "weight_kg",
            "proposed_price",
            "declared_value",
            "status",
            "status_label",
            "offers_count",
            "shipment_id",
            "created_at",
        ]


class AdminShipmentListSerializer(serializers.ModelSerializer):
    title = serializers.CharField(source="cargo.title")
    origin = serializers.CharField(source="cargo.origin_city.name_fr")
    destination = serializers.CharField(source="cargo.destination_city.name_fr")
    client = serializers.CharField(source="client.full_name")
    driver = serializers.CharField(source="driver.user.full_name")
    status_label = serializers.CharField(source="get_status_display")

    class Meta:
        model = Shipment
        fields = [
            "id",
            "title",
            "origin",
            "destination",
            "client",
            "driver",
            "status",
            "status_label",
            "agreed_price",
            "currency",
            "confirmed_at",
        ]


class AdminShipmentDetailSerializer(AdminShipmentListSerializer):
    """Tout le dossier d'un transport, preuves comprises : utile en cas de litige ou de vol."""

    client_phone = serializers.CharField(source="client.phone")
    driver_phone = serializers.CharField(source="driver.user.phone")
    vehicle = VehicleSerializer(source="offer.vehicle")
    origin_address = serializers.CharField(source="cargo.origin_address")
    destination_address = serializers.CharField(source="cargo.destination_address")
    declared_value = serializers.DecimalField(source="cargo.declared_value", max_digits=12, decimal_places=2)
    recipient_name = serializers.CharField(source="cargo.recipient_name")
    recipient_phone = serializers.CharField(source="cargo.recipient_phone")
    events = ShipmentEventSerializer(many=True)

    class Meta(AdminShipmentListSerializer.Meta):
        fields = AdminShipmentListSerializer.Meta.fields + [
            "client_phone",
            "driver_phone",
            "vehicle",
            "origin_address",
            "destination_address",
            "declared_value",
            "recipient_name",
            "recipient_phone",
            "events",
        ]


class AdminReportSerializer(serializers.ModelSerializer):
    reason_label = serializers.CharField(source="get_reason_display", read_only=True)
    status_label = serializers.CharField(source="get_status_display", read_only=True)
    reporter = serializers.CharField(source="reporter.full_name", read_only=True)
    reporter_phone = serializers.CharField(source="reporter.phone", read_only=True)
    reported_user = serializers.CharField(source="reported_user.full_name", default="", read_only=True)
    cargo_title = serializers.CharField(source="cargo.title", default="", read_only=True)

    class Meta:
        model = Report
        fields = [
            "id",
            "reason",
            "reason_label",
            "description",
            "status",
            "status_label",
            "admin_note",
            "reporter",
            "reporter_phone",
            "reported_user",
            "cargo",
            "cargo_title",
            "shipment",
            "created_at",
        ]
        read_only_fields = ["reason", "description", "cargo", "shipment", "created_at"]
