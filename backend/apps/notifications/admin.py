from django.contrib import admin

from .models import Notification, PushToken


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ["user", "kind", "title", "is_read", "created_at"]
    list_filter = ["kind", "is_read"]
    raw_id_fields = ["user"]


@admin.register(PushToken)
class PushTokenAdmin(admin.ModelAdmin):
    list_display = ["user", "platform", "created_at"]
    raw_id_fields = ["user"]
