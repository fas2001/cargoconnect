from django.contrib import admin, messages
from django.urls import reverse
from django.utils.html import format_html, format_html_join

from apps.common.exceptions import BusinessRuleError
from apps.vehicles.models import Vehicle

from . import services
from .models import DocumentAccessLog, DriverDocument, DriverProfile, VerificationEvent, VerificationStatus


IMAGE_EXTENSIONS = (".jpg", ".jpeg", ".png", ".webp")


def private_file_preview(url: str, filename: str) -> str:
    """Aperçu (photo) ou lien (PDF, HEIC) vers la vue protégée ; chaque affichage est journalisé."""
    if filename.lower().endswith(IMAGE_EXTENSIONS):
        return format_html(
            '<a href="{}" target="_blank" rel="noopener"><img src="{}" alt="Justificatif" '
            'style="height:88px;max-width:140px;object-fit:cover;border-radius:8px;border:1px solid #ddd"></a>',
            url,
            url,
        )
    return format_html('<a href="{}" target="_blank" rel="noopener">Ouvrir le fichier</a>', url)


def file_link(document: DriverDocument) -> str:
    """Les fichiers n'ont pas d'URL publique : aperçu servi par la vue protégée et journalisée."""
    if not document.pk or not document.file:
        return "—"
    return private_file_preview(reverse("admin-document-file", args=[document.pk]), document.file.name)


class DriverDocumentInline(admin.TabularInline):
    model = DriverDocument
    extra = 0
    can_delete = False
    show_change_link = True
    fields = ["doc_type", "side", "vehicle", "document_number", "expires_on", "status", "open_file", "replaced_at"]
    readonly_fields = fields

    @admin.display(description="Fichier")
    def open_file(self, obj):
        return file_link(obj)

    def has_add_permission(self, request, obj=None):
        return False


class VehicleInline(admin.TabularInline):
    model = Vehicle
    extra = 0
    fields = ["truck_type", "capacity_kg", "registration_number", "is_active"]


class VerificationEventInline(admin.TabularInline):
    model = VerificationEvent
    extra = 0
    can_delete = False
    fields = ["created_at", "document", "status", "reason", "decided_by"]
    readonly_fields = fields

    def has_add_permission(self, request, obj=None):
        return False


@admin.register(DriverProfile)
class DriverProfileAdmin(admin.ModelAdmin):
    list_display = ["__str__", "user", "verification_status", "verified_at", "created_at"]
    list_filter = ["verification_status"]
    search_fields = ["company_name", "user__full_name", "user__phone"]
    readonly_fields = ["verification_status", "verified_at", "checklist_summary"]
    fields = ["user", "company_name", "bio", "verification_status", "verified_at", "rejection_reason", "checklist_summary"]
    inlines = [DriverDocumentInline, VehicleInline, VerificationEventInline]
    actions = ["mark_verified", "mark_rejected"]

    @admin.display(description="Justificatifs exigés")
    def checklist_summary(self, obj):
        labels = dict(DriverDocument.DocType.choices)
        states = {"missing": "❌ manquant", "pending": "⏳ à vérifier", "verified": "✅ validé", "rejected": "⛔ refusé", "expired": "⌛ expiré"}
        items = services.checklist(obj)
        if not items:
            return "—"
        rows = format_html_join(
            "",
            "<li>{} {}{} : {}</li>",
            (
                (
                    labels[item["doc_type"]],
                    item["side"] if item["side"] != "unique" else "",
                    f" — {item['vehicle_label']}" if item["vehicle_label"] else "",
                    states[item["state"]],
                )
                for item in items
            ),
        )
        return format_html("<ul>{}</ul>", rows)

    @admin.action(description="Marquer comme vérifié")
    def mark_verified(self, request, queryset):
        verified, incomplete = 0, []
        for profile in queryset:
            try:
                services.decide_profile(profile, VerificationStatus.VERIFIED, by=request.user)
                verified += 1
            except BusinessRuleError:
                incomplete.append(str(profile))
        if verified:
            self.message_user(request, f"{verified} chauffeur(s) vérifié(s) et notifié(s).", messages.SUCCESS)
        if incomplete:
            self.message_user(
                request,
                f"Non vérifié(s), justificatifs à contrôler d'abord : {', '.join(incomplete)}.",
                messages.ERROR,
            )

    @admin.action(description="Refuser la vérification (motif : champ « motif du refus »)")
    def mark_rejected(self, request, queryset):
        missing_reason = [p for p in queryset if not p.rejection_reason]
        if missing_reason:
            self.message_user(
                request,
                "Renseignez d'abord le « motif du refus » dans la fiche de chaque chauffeur : il lui est envoyé.",
                messages.ERROR,
            )
            return
        for profile in queryset:
            services.decide_profile(profile, VerificationStatus.REJECTED, by=request.user, reason=profile.rejection_reason)
        self.message_user(request, f"{queryset.count()} chauffeur(s) refusé(s) et notifié(s).", messages.WARNING)


@admin.register(DriverDocument)
class DriverDocumentAdmin(admin.ModelAdmin):
    list_display = ["__str__", "document_number", "expires_on", "status", "replaced_at", "created_at"]
    list_filter = ["status", "doc_type", "data_source", ("replaced_at", admin.EmptyFieldListFilter)]
    search_fields = ["document_number", "holder_name", "driver__user__full_name", "driver__user__phone"]
    readonly_fields = [
        "driver",
        "doc_type",
        "side",
        "vehicle",
        "open_file",
        "status",
        "reviewed_by",
        "reviewed_at",
        "replaced_at",
        "expiry_notified_at",
        "created_at",
    ]
    fields = [
        "driver",
        "doc_type",
        "side",
        "vehicle",
        "open_file",
        "document_number",
        "holder_name",
        "issuer",
        "expires_on",
        "covers_goods",
        "data_source",
        "status",
        "review_note",
        "reviewed_by",
        "reviewed_at",
        "replaced_at",
        "expiry_notified_at",
        "created_at",
    ]
    actions = ["approve", "reject"]

    @admin.display(description="Fichier")
    def open_file(self, obj):
        return file_link(obj)

    def has_add_permission(self, request):
        return False  # les justificatifs sont envoyés par les chauffeurs depuis l'application

    def has_delete_permission(self, request, obj=None):
        return False  # conservés pour l'historique ; un nouvel envoi remplace l'ancien

    def save_model(self, request, obj, form, change):
        # Informations corrigées par l'équipe : on le note pour distinguer de la saisie du chauffeur.
        if change and form.changed_data and set(form.changed_data) & {"document_number", "holder_name", "issuer", "expires_on", "covers_goods"}:
            obj.data_source = DriverDocument.DataSource.ADMIN
        super().save_model(request, obj, form, change)

    @admin.action(description="Valider les justificatifs")
    def approve(self, request, queryset):
        for document in queryset:
            services.decide_document(document, VerificationStatus.VERIFIED, by=request.user)
        self.message_user(request, f"{queryset.count()} justificatif(s) validé(s).", messages.SUCCESS)

    @admin.action(description="Refuser (motif : champ « note de vérification »)")
    def reject(self, request, queryset):
        if any(not d.review_note for d in queryset):
            self.message_user(request, "Renseignez d'abord la « note de vérification » : elle est envoyée au chauffeur.", messages.ERROR)
            return
        for document in queryset:
            services.decide_document(document, VerificationStatus.REJECTED, by=request.user, reason=document.review_note)
        self.message_user(request, f"{queryset.count()} justificatif(s) refusé(s).", messages.WARNING)


@admin.register(DocumentAccessLog)
class DocumentAccessLogAdmin(admin.ModelAdmin):
    list_display = ["accessed_at", "user", "document", "ip_address"]
    list_filter = ["accessed_at"]
    search_fields = ["user__full_name", "document__driver__user__full_name"]

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(VerificationEvent)
class VerificationEventAdmin(admin.ModelAdmin):
    list_display = ["created_at", "driver", "document", "status", "reason", "decided_by"]
    list_filter = ["status", "created_at"]

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
