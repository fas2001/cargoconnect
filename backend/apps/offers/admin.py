from django.contrib import admin

from .models import Offer


@admin.register(Offer)
class OfferAdmin(admin.ModelAdmin):
    list_display = ["cargo", "driver", "price", "currency", "status", "created_at"]
    list_filter = ["status"]
    search_fields = ["cargo__title", "driver__user__full_name", "driver__user__phone"]
    raw_id_fields = ["cargo", "driver", "vehicle"]
