from django.contrib import admin

from .models import Shipment, ShipmentEvent


class ShipmentEventInline(admin.TabularInline):
    model = ShipmentEvent
    extra = 0
    fields = ["created_at", "from_status", "to_status", "actor", "note"]
    readonly_fields = fields
    can_delete = False


@admin.register(Shipment)
class ShipmentAdmin(admin.ModelAdmin):
    list_display = ["cargo", "client", "driver", "agreed_price", "status", "confirmed_at", "delivered_at"]
    list_filter = ["status"]
    search_fields = ["cargo__title", "client__phone", "driver__user__phone"]
    raw_id_fields = ["cargo", "offer", "client", "driver"]
    inlines = [ShipmentEventInline]
