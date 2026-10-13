from django.contrib import admin

from .models import Review


@admin.register(Review)
class ReviewAdmin(admin.ModelAdmin):
    list_display = ["target", "target_role", "rating", "author", "created_at"]
    list_filter = ["target_role", "rating"]
    raw_id_fields = ["shipment", "author", "target"]
