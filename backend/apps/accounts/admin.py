from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin

from .models import PhoneOTP, User


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
