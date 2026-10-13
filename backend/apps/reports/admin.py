from django.contrib import admin

from .models import Report


@admin.register(Report)
class ReportAdmin(admin.ModelAdmin):
    list_display = ["reason", "reporter", "reported_user", "status", "created_at"]
    list_filter = ["status", "reason"]
    search_fields = ["description", "reporter__phone", "reported_user__phone"]
    raw_id_fields = ["reporter", "reported_user", "cargo", "shipment"]
    list_editable = ["status"]
