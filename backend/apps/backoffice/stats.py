"""Chiffres du tableau de bord (application et administration web)."""

from datetime import timedelta

from django.utils import timezone

from apps.accounts.models import ClientDocument, ClientIdentity, User
from apps.cargos.models import Cargo, CargoStatus
from apps.drivers.models import DriverDocument, DriverProfile, VerificationStatus
from apps.reports.models import Report
from apps.shipments.models import Shipment, ShipmentStatus

ACTIVE_SHIPMENTS = [ShipmentStatus.CONFIRMED, ShipmentStatus.LOADED, ShipmentStatus.IN_TRANSIT, ShipmentStatus.DELIVERED]


def dashboard() -> dict:
    pending = VerificationStatus.PENDING
    users = User.objects.filter(is_active=True, is_staff=False)
    return {
        # À traiter
        "drivers_pending": DriverProfile.objects.filter(verification_status=pending).count(),
        "identities_pending": ClientIdentity.objects.filter(verification_status=pending).count(),
        "documents_pending": DriverDocument.objects.filter(status=pending, replaced_at__isnull=True).count()
        + ClientDocument.objects.filter(status=pending, replaced_at__isnull=True).count(),
        "reports_open": Report.objects.filter(status__in=[Report.Status.OPEN, Report.Status.IN_REVIEW]).count(),
        "shipments_disputed": Shipment.objects.filter(status=ShipmentStatus.DISPUTED).count(),
        # Activité
        "users_total": users.count(),
        "drivers_total": users.filter(driver_profile__isnull=False).count(),
        "clients_total": users.filter(driver_profile__isnull=True).count(),
        "new_users_7d": users.filter(date_joined__gte=timezone.now() - timedelta(days=7)).count(),
        "cargos_published": Cargo.objects.filter(status=CargoStatus.PUBLISHED).count(),
        "shipments_active": Shipment.objects.filter(status__in=ACTIVE_SHIPMENTS).count(),
        "shipments_completed": Shipment.objects.filter(status=ShipmentStatus.COMPLETED).count(),
    }
