import pytest
from django.contrib.admin.models import LogEntry

from apps.accounts.models import User
from apps.drivers.models import DocumentAccessLog, DriverDocument, VerificationEvent
from apps.notifications.models import Notification
from apps.reports.models import Report

from .conftest import PASSWORD, auth, give_driver_documents, proof_photo


@pytest.fixture
def admin_user(db):
    return User.objects.create_superuser(phone="0699999999", password=PASSWORD, full_name="Admin Équipe")


@pytest.fixture
def staff_without_rights(db):
    return User.objects.create_user(phone="0699999998", password=PASSWORD, full_name="Stagiaire", is_staff=True)


@pytest.mark.django_db
def test_only_staff_can_use_the_backoffice(client_user, driver_a, admin_user):
    assert auth(client_user).get("/api/backoffice/dashboard/").status_code == 403
    assert auth(driver_a).get("/api/backoffice/drivers/").status_code == 403
    stats = auth(admin_user).get("/api/backoffice/dashboard/").data
    assert stats["users_total"] >= 2 and "drivers_pending" in stats
    assert auth(admin_user).get("/api/me/").data["is_staff"] is True


@pytest.mark.django_db
def test_verify_driver_from_the_app(admin_user, published_cargo):
    from .conftest import make_driver

    driver = make_driver("0655555555", "Nouveau Routier", verified=False)
    profile = driver.driver_profile
    api = auth(admin_user)

    pending = api.get("/api/backoffice/drivers/", {"status": "pending"}).data["results"]
    assert [d["id"] for d in pending] == [str(profile.pk)]

    upload = auth(driver).post(
        "/api/me/driver-profile/documents/", {"file": proof_photo(), "doc_type": "selfie"}, format="multipart"
    )
    detail = api.get(f"/api/backoffice/drivers/{profile.pk}/").data
    document = detail["documents"][0]
    assert document["id"] == upload.data["id"] and document["file_url"].endswith("/file/")

    # L'image s'ouvre depuis l'app, et l'ouverture est journalisée.
    assert api.get(f"/api/backoffice/driver-documents/{document['id']}/file/").status_code == 200
    assert DocumentAccessLog.objects.filter(document_id=document["id"], user=admin_user).exists()

    assert api.post(f"/api/backoffice/drivers/{profile.pk}/decision/", {"status": "rejected"}, format="json").status_code == 400
    assert api.post(f"/api/backoffice/driver-documents/{document['id']}/decision/", {"status": "verified"}, format="json").status_code == 200

    # Le profil ne peut être vérifié qu'une fois chaque justificatif exigé validé (personnels et camions).
    refused = api.post(f"/api/backoffice/drivers/{profile.pk}/decision/", {"status": "verified"}, format="json")
    assert refused.status_code == 409 and refused.data["code"] == "documents_not_verified"
    others = give_driver_documents(profile)
    for other in others:
        api.post(f"/api/backoffice/driver-documents/{other.pk}/decision/", {"status": "verified"}, format="json")

    response = api.post(f"/api/backoffice/drivers/{profile.pk}/decision/", {"status": "verified"}, format="json")
    assert response.status_code == 200 and response.data["verification_status"] == "verified"
    assert VerificationEvent.objects.filter(driver=profile, decided_by=admin_user).count() == 2 + len(others)
    assert Notification.objects.filter(user=driver, kind="profile_reviewed").exists()
    assert DriverDocument.objects.get(pk=document["id"]).reviewed_by == admin_user


@pytest.mark.django_db
def test_staff_without_permissions_cannot_decide_or_open_documents(staff_without_rights, client_user):
    identity = client_user.client_identity
    api = auth(staff_without_rights)
    assert api.get("/api/backoffice/identities/").status_code == 200  # consultation des listes : oui
    assert api.post(f"/api/backoffice/identities/{identity.pk}/decision/", {"status": "verified"}, format="json").status_code == 403
    document = identity.documents.first()
    assert api.get(f"/api/backoffice/client-documents/{document.pk}/file/").status_code == 403


@pytest.mark.django_db
def test_verify_client_identity_and_logs(admin_user, client_user):
    identity = client_user.client_identity
    api = auth(admin_user)
    detail = api.get(f"/api/backoffice/identities/{identity.pk}/").data
    assert detail["cin_number"] == "AB123456" and len(detail["documents"]) == 2

    response = api.post(f"/api/backoffice/identities/{identity.pk}/decision/", {"status": "verified"}, format="json")
    assert response.data["verification_status"] == "verified"
    assert LogEntry.objects.filter(user=admin_user, object_id=str(identity.pk)).exists()


@pytest.mark.django_db
def test_suspend_account_and_handle_report(admin_user, client_user, driver_a):
    api = auth(admin_user)
    users = api.get("/api/backoffice/users/", {"search": "Karim"}).data["results"]
    assert [u["phone"] for u in users] == ["+212611111111"]

    response = api.post(f"/api/backoffice/users/{client_user.pk}/activation/", {"is_active": False}, format="json")
    assert response.data["is_active"] is False
    assert api.post(f"/api/backoffice/users/{admin_user.pk}/activation/", {"is_active": False}, format="json").status_code == 409

    report = Report.objects.create(reporter=driver_a, reason="fraud", description="Annonce suspecte")
    assert api.get("/api/backoffice/reports/", {"status": "open"}).data["results"][0]["id"] == str(report.pk)
    updated = api.patch(f"/api/backoffice/reports/{report.pk}/", {"status": "resolved", "admin_note": "Compte suspendu"}, format="json")
    assert updated.status_code == 200 and updated.data["status"] == "resolved"


@pytest.mark.django_db
def test_shipment_file_with_proofs(admin_user, client_user, driver_a, published_cargo):
    from .conftest import accept, offer_on

    offer = offer_on(published_cargo, driver_a)
    shipment_id = accept(client_user, offer).data["id"]
    api = auth(admin_user)
    assert api.get("/api/backoffice/shipments/").data["results"][0]["id"] == shipment_id
    detail = api.get(f"/api/backoffice/shipments/{shipment_id}/").data
    assert detail["origin_address"] == "Derb Omar, rue 5" and detail["client_phone"] == "+212611111111"
    assert api.get("/api/backoffice/cargos/").data["count"] >= 1


@pytest.mark.django_db
def test_web_admin_dashboard_and_document_previews(admin_user, driver_a, client_user, client):
    auth(driver_a).post("/api/me/driver-profile/documents/", {"file": proof_photo(), "doc_type": "selfie"}, format="multipart")
    client.force_login(admin_user)
    home = client.get("/admin/").content.decode()
    assert "À traiter" in home and "transporteurs à vérifier" in home
    driver_page = client.get(f"/admin/drivers/driverprofile/{driver_a.driver_profile.pk}/change/").content.decode()
    assert "/admin/justificatifs/" in driver_page and "<img" in driver_page
    identity_page = client.get(f"/admin/accounts/clientidentity/{client_user.client_identity.pk}/change/")
    assert identity_page.status_code == 200 and "/admin/justificatifs-clients/" in identity_page.content.decode()


@pytest.mark.django_db
def test_suspension_removes_the_account_from_the_marketplace(admin_user, client_user, driver_a, driver_b, published_cargo):
    from apps.cargos.models import CargoStatus
    from apps.offers.models import Offer, OfferStatus

    from .conftest import offer_on

    offer_a = offer_on(published_cargo, driver_a)
    offer_on(published_cargo, driver_b)
    api = auth(admin_user)

    # Chauffeur suspendu : son offre disparaît, il ne peut plus être retenu.
    suspended = api.post(f"/api/backoffice/users/{driver_a.pk}/activation/", {"is_active": False}, format="json")
    assert suspended.data["is_active"] is False and suspended.data["open_shipments"] == 0
    assert Offer.objects.get(pk=offer_a["id"]).status == OfferStatus.WITHDRAWN

    # Client suspendu : ses annonces ouvertes sont annulées et les chauffeurs prévenus.
    api.post(f"/api/backoffice/users/{client_user.pk}/activation/", {"is_active": False}, format="json")
    published_cargo.refresh_from_db()
    assert published_cargo.status == CargoStatus.CANCELLED
    assert Offer.objects.get(driver__user=driver_b).status == OfferStatus.CLOSED
    assert Notification.objects.filter(user=driver_b, kind="offer_closed").exists()
    assert auth(driver_b).get("/api/cargos/").data["count"] == 0


@pytest.mark.django_db
def test_suspension_reports_open_shipments(admin_user, client_user, driver_a, published_cargo):
    from .conftest import accept, offer_on

    accept(client_user, offer_on(published_cargo, driver_a))
    response = auth(admin_user).post(f"/api/backoffice/users/{driver_a.pk}/activation/", {"is_active": False}, format="json")
    assert response.data["open_shipments"] == 1
