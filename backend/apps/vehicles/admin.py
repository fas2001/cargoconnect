from django.contrib import admin

from .models import Vehicle


@admin.register(Vehicle)
class VehicleAdmin(admin.ModelAdmin):
    list_display = ["registration_number", "truck_type", "capacity_kg", "driver", "is_active"]
    list_filter = ["truck_type", "is_active"]
    search_fields = ["registration_number", "driver__user__full_name"]
