from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView

from apps.accounts import views as accounts
from apps.cargos import views as cargos
from apps.drivers import views as drivers
from apps.drivers.admin_views import client_document_file, document_file
from apps.notifications import views as notifications
from apps.offers import views as offers
from apps.reports import views as reports
from apps.shipments import views as shipments

admin.site.site_header = "CargoConnect — Administration"
admin.site.site_title = "CargoConnect"

router = DefaultRouter()
router.register("cargos", cargos.CargoViewSet, basename="cargo")
router.register("offers", offers.OfferViewSet, basename="offer")
router.register("shipments", shipments.ShipmentViewSet, basename="shipment")
router.register("notifications", notifications.NotificationViewSet, basename="notification")
router.register("push-tokens", notifications.PushTokenViewSet, basename="push-token")
router.register("reports", reports.ReportViewSet, basename="report")
router.register("me/vehicles", drivers.MyVehiclesViewSet, basename="my-vehicle")
router.register("me/driver-profile/documents", drivers.MyDocumentsViewSet, basename="my-document")

api = [
    # Authentification
    path("auth/register/", accounts.RegisterView.as_view(), name="register"),
    path("auth/login/", accounts.LoginView.as_view(), name="login"),
    path("auth/refresh/", TokenRefreshView.as_view(), name="token-refresh"),
    path("auth/logout/", accounts.LogoutView.as_view(), name="logout"),
    path("auth/otp/request/", accounts.OTPRequestView.as_view(), name="otp-request"),
    path("auth/password-reset/", accounts.PasswordResetView.as_view(), name="password-reset"),
    # Profil
    path("me/", accounts.MeView.as_view(), name="me"),
    path("me/password/", accounts.ChangePasswordView.as_view(), name="change-password"),
    path("me/verify-phone/", accounts.VerifyPhoneView.as_view(), name="verify-phone"),
    path("me/driver-profile/", drivers.MyDriverProfileView.as_view(), name="my-driver-profile"),
    path("me/client-identity/", accounts.MyClientIdentityView.as_view(), name="my-client-identity"),
    path("me/client-identity/documents/", accounts.MyClientDocumentsView.as_view(), name="my-client-documents"),
    path("drivers/<uuid:pk>/", drivers.PublicDriverView.as_view(), name="driver-public"),
    # Cargaisons : offres imbriquées
    path("cargos/<uuid:pk>/offers/", cargos.CargoOffersView.as_view(), name="cargo-offers"),
    # Référentiels
    path("reference/cities/", cargos.CityListView.as_view(), name="cities"),
    path("reference/goods-categories/", cargos.GoodsCategoryListView.as_view(), name="goods-categories"),
    path("reference/truck-types/", cargos.TruckTypeListView.as_view(), name="truck-types"),
    path("", include(router.urls)),
]

urlpatterns = [
    # Justificatifs chauffeurs : vue protégée et journalisée (avant les URLs de l'admin).
    path("admin/justificatifs/<uuid:pk>/fichier/", document_file, name="admin-document-file"),
    path("admin/justificatifs-clients/<uuid:pk>/fichier/", client_document_file, name="admin-client-document-file"),
    path("admin/", admin.site.urls),
    path("api/", include(api)),
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path("api/docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="swagger"),
]

if settings.DEBUG:
    # Développement uniquement. En production, les photos passent par le stockage objet (URLs signées).
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
