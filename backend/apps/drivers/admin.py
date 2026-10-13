from django.contrib import admin, messages
from django.utils import timezone

from apps.vehicles.models import Vehicle

from .models import DriverDocument, DriverProfile, VerificationStatus


class DriverDocumentInline(admin.TabularInline):
    model = DriverDocument
    extra = 0
    fields = ["doc_type", "file", "status", "review_note", "created_at"]
    readonly_fields = ["created_at"]


class VehicleInline(admin.TabularInline):
    model = Vehicle
    extra = 0
    fields = ["truck_type", "capacity_kg", "registration_number", "is_active"]


@admin.register(DriverProfile)
class DriverProfileAdmin(admin.ModelAdmin):
    list_display = ["__str__", "user", "verification_status", "verified_at", "created_at"]
    list_filter = ["verification_status"]
    search_fields = ["company_name", "user__full_name", "user__phone"]
    inlines = [DriverDocumentInline, VehicleInline]
    actions = ["mark_verified", "mark_rejected"]

    @admin.action(description="Marquer comme vérifié")
    def mark_verified(self, request, queryset):
        count = queryset.update(
            verification_status=VerificationStatus.VERIFIED, verified_at=timezone.now(), rejection_reason=""
        )
        self.message_user(request, f"{count} chauffeur(s) vérifié(s).", messages.SUCCESS)

    @admin.action(description="Refuser la vérification")
    def mark_rejected(self, request, queryset):
        count = queryset.update(verification_status=VerificationStatus.REJECTED, verified_at=None)
        self.message_user(request, f"{count} chauffeur(s) refusé(s). Pensez à renseigner le motif.", messages.WARNING)
