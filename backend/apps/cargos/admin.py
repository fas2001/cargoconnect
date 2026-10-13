from django.contrib import admin

from apps.offers.models import Offer

from .models import Cargo, CargoPhoto, City, GoodsCategory


class CargoPhotoInline(admin.TabularInline):
    model = CargoPhoto
    extra = 0


class OfferInline(admin.TabularInline):
    model = Offer
    extra = 0
    fields = ["driver", "price", "status", "message", "created_at"]
    readonly_fields = fields
    can_delete = False


@admin.register(Cargo)
class CargoAdmin(admin.ModelAdmin):
    list_display = ["title", "client", "origin_city", "destination_city", "loading_date", "weight_kg", "status", "created_at"]
    list_filter = ["status", "truck_type", "category", "origin_city", "destination_city"]
    search_fields = ["title", "description", "client__phone", "client__full_name"]
    date_hierarchy = "created_at"
    raw_id_fields = ["client"]
    inlines = [CargoPhotoInline, OfferInline]


@admin.register(City)
class CityAdmin(admin.ModelAdmin):
    list_display = ["name_fr", "name_ar", "region", "is_active"]
    list_filter = ["region", "is_active"]
    search_fields = ["name_fr", "name_ar"]
    prepopulated_fields = {"slug": ["name_fr"]}


@admin.register(GoodsCategory)
class GoodsCategoryAdmin(admin.ModelAdmin):
    list_display = ["name_fr", "name_ar", "is_active"]
    prepopulated_fields = {"slug": ["name_fr"]}
