from django.urls import path

from . import views

urlpatterns = [
    path("dashboard/", views.DashboardView.as_view(), name="backoffice-dashboard"),
    path("drivers/", views.DriverListView.as_view(), name="backoffice-drivers"),
    path("drivers/<uuid:pk>/", views.DriverDetailView.as_view(), name="backoffice-driver"),
    path("drivers/<uuid:pk>/decision/", views.DriverDecisionView.as_view(), name="backoffice-driver-decision"),
    path("driver-documents/<uuid:pk>/decision/", views.DriverDocumentDecisionView.as_view(), name="backoffice-driver-document-decision"),
    path("driver-documents/<uuid:pk>/file/", views.DriverDocumentFileView.as_view(), name="backoffice-driver-document-file"),
    path("identities/", views.IdentityListView.as_view(), name="backoffice-identities"),
    path("identities/<uuid:pk>/", views.IdentityDetailView.as_view(), name="backoffice-identity"),
    path("identities/<uuid:pk>/decision/", views.IdentityDecisionView.as_view(), name="backoffice-identity-decision"),
    path("client-documents/<uuid:pk>/decision/", views.ClientDocumentDecisionView.as_view(), name="backoffice-client-document-decision"),
    path("client-documents/<uuid:pk>/file/", views.ClientDocumentFileView.as_view(), name="backoffice-client-document-file"),
    path("users/", views.UserListView.as_view(), name="backoffice-users"),
    path("users/<uuid:pk>/activation/", views.UserActivationView.as_view(), name="backoffice-user-activation"),
    path("cargos/", views.CargoListView.as_view(), name="backoffice-cargos"),
    path("shipments/", views.ShipmentListView.as_view(), name="backoffice-shipments"),
    path("shipments/<uuid:pk>/", views.ShipmentDetailView.as_view(), name="backoffice-shipment"),
    path("reports/", views.ReportListView.as_view(), name="backoffice-reports"),
    path("reports/<uuid:pk>/", views.ReportUpdateView.as_view(), name="backoffice-report"),
]
