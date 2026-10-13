from rest_framework.permissions import BasePermission


class IsDriver(BasePermission):
    message = "Un profil chauffeur est nécessaire pour cette action."

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and hasattr(request.user, "driver_profile"))
