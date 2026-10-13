from django.contrib import admin
from django.utils.html import format_html, format_html_join

from .models import Shipment, ShipmentEvent


class ShipmentEventInline(admin.TabularInline):
    """Historique et preuves (photos, position, réceptionnaire, signature) : utiles en cas de litige ou de vol."""

    model = ShipmentEvent
    extra = 0
    fields = ["created_at", "from_status", "to_status", "actor", "note", "location", "receiver_name", "signature_preview", "photo_links"]
    readonly_fields = fields
    can_delete = False

    def has_add_permission(self, request, obj=None):
        return False

    @admin.display(description="Position")
    def location(self, event):
        if not event.has_location:
            return "—"
        url = f"https://www.google.com/maps/search/?api=1&query={event.latitude},{event.longitude}"
        accuracy = f" (±{event.location_accuracy_m:.0f} m)" if event.location_accuracy_m is not None else ""
        return format_html('<a href="{}" target="_blank" rel="noopener">Voir sur la carte</a>{}', url, accuracy)

    @admin.display(description="Signature")
    def signature_preview(self, event):
        if not event.signature:
            return "—"
        # Tracé validé à l'enregistrement (commandes de chemin SVG uniquement).
        return format_html(
            '<svg width="160" height="80" viewBox="0 0 320 160" style="border:1px solid #ccc;background:#fff">'
            '<path d="{}" fill="none" stroke="#111" stroke-width="3" stroke-linecap="round"/></svg>',
            event.signature,
        )

    @admin.display(description="Photos")
    def photo_links(self, event):
        photos = list(event.photos.all())
        if not photos:
            return "—"
        return format_html_join(
            " ",
            '<a href="{}" target="_blank" rel="noopener"><img src="{}" style="height:48px;border-radius:4px"></a>',
            ((p.image.url, p.image.url) for p in photos),
        )


@admin.register(Shipment)
class ShipmentAdmin(admin.ModelAdmin):
    list_display = ["cargo", "client", "driver", "agreed_price", "status", "confirmed_at", "delivered_at"]
    list_filter = ["status"]
    search_fields = ["cargo__title", "client__phone", "driver__user__phone"]
    raw_id_fields = ["cargo", "offer", "client", "driver"]
    inlines = [ShipmentEventInline]
