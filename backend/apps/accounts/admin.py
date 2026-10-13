from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin

from django.contrib import messages
from django.urls import reverse
from django.utils.html import format_html

from apps.drivers.models import VerificationStatus

from . import identity as identity_services
from .models import ClientDocument, ClientIdentity, PhoneOTP, User


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    ordering = ["-date_joined"]
    list_display = ["phone", "full_name", "email", "phone_verified", "is_active", "is_staff", "date_joined"]
    list_filter = ["is_active", "is_staff", "phone_verified"]
    search_fields = ["phone", "full_name", "email"]
    fieldsets = [
        (None, {"fields": ["phone", "password"]}),
        ("Identité", {"fields": ["full_name", "email", "phone_verified"]}),
        ("Droits", {"fields": ["is_active", "is_staff", "is_superuser", "groups", "user_permissions"]}),
        ("Dates", {"fields": ["last_login", "date_joined"]}),
    ]
    add_fieldsets = [(None, {"classes": ["wide"], "fields": ["phone", "full_name", "password1", "password2"]})]


@admin.register(PhoneOTP)
class PhoneOTPAdmin(admin.ModelAdmin):
    list_display = ["phone", "purpose", "created_at", "expires_at", "attempts", "used_at"]
    list_filter = ["purpose"]
    search_fields = ["phone"]
    readonly_fields = ["code_hash"]


class ClientDocumentInline(admin.TabularInline):
    model = ClientDocument
    extra = 0
    can_delete = False
    fields = ["doc_type", "side", "status", "review_note", "open_file", "replaced_at", "created_at"]
    readonly_fields = ["doc_type", "side", "open_file", "replaced_at", "created_at"]

    @admin.display(description="Fichier")
    def open_file(self, obj):
        if not obj.pk:
            return "—"
        url = reverse("admin-client-document-file", args=[obj.pk])
        return format_html('<a href="{}" target="_blank" rel="noopener">Ouvrir le fichier</a>', url)

    def has_add_permission(self, request, obj=None):
        return False


@admin.register(ClientIdentity)
class ClientIdentityAdmin(admin.ModelAdmin):
    list_display = ["__str__", "user", "account_type", "cin_number", "ice", "verification_status", "created_at"]
    list_filter = ["verification_status", "account_type"]
    search_fields = ["user__full_name", "user__phone", "cin_number", "ice", "company_name"]
    readonly_fields = ["user", "verification_status", "verified_at"]
    fields = ["user", "account_type", "cin_number", "company_name", "ice", "verification_status", "verified_at", "rejection_reason"]
    inlines = [ClientDocumentInline]
    actions = ["mark_verified", "mark_rejected"]

    def save_formset(self, request, form, formset, change):
        # Statut ou note d'un document modifié dans la fiche : on garde qui l'a décidé et quand.
        for inline_form in formset.forms:
            document = inline_form.instance
            if document.pk and {"status", "review_note"} & set(inline_form.changed_data):
                identity_services.decide_document(document, document.status, by=request.user, reason=document.review_note)
                self.log_change(request, form.instance, f"{document} : {document.get_status_display()}")
        formset.save()

    @admin.action(description="Marquer l'identité comme vérifiée")
    def mark_verified(self, request, queryset):
        for identity in queryset:
            identity_services.decide_identity(identity, VerificationStatus.VERIFIED)
            self.log_change(request, identity, "Identité vérifiée")
        self.message_user(request, f"{queryset.count()} identité(s) vérifiée(s) et notifiée(s).", messages.SUCCESS)

    @admin.action(description="Refuser (motif : champ « motif du refus »)")
    def mark_rejected(self, request, queryset):
        if any(not identity.rejection_reason for identity in queryset):
            self.message_user(request, "Renseignez d'abord le « motif du refus » : il est envoyé au client.", messages.ERROR)
            return
        for identity in queryset:
            identity_services.decide_identity(identity, VerificationStatus.REJECTED, reason=identity.rejection_reason)
            self.log_change(request, identity, f"Identité refusée : {identity.rejection_reason}")
        self.message_user(request, f"{queryset.count()} identité(s) refusée(s) et notifiée(s).", messages.WARNING)
