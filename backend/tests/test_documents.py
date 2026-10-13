from datetime import timedelta
from pathlib import Path

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone

from apps.accounts.models import User
from apps.drivers import services
from apps.drivers.models import DocumentAccessLog, DriverDocument, VerificationEvent, VerificationStatus
from apps.notifications.models import Notification

from .conftest import PASSWORD, auth

D = DriverDocument.DocType
FUTURE = str(timezone.localdate() + timedelta(days=400))


@pytest.fixture(autouse=True)
def private_dirs(settings, tmp_path):
    settings.MEDIA_ROOT = tmp_path / "media"
    settings.PRIVATE_MEDIA_ROOT = tmp_path / "private"
    return settings


def jpeg(name="doc.jpg"):
    return SimpleUploadedFile(name, b"\xff\xd8\xff\xe0fake-jpeg", content_type="image/jpeg")


def upload(user, **data):
    return auth(user).post("/api/me/driver-profile/documents/", {"file": jpeg(), **data}, format="multipart")


@pytest.mark.django_db
def test_required_fields_depend_on_document_type(driver_a):
    vehicle = driver_a.driver_profile.vehicles.first()

    # CIN : face obligatoire ; numéro et expiration sur le recto seulement.
    assert upload(driver_a, doc_type="cin").status_code == 400
    recto = upload(driver_a, doc_type="cin", side="recto")
    assert recto.status_code == 400 and {"document_number", "expires_on"} <= set(recto.data)
    assert upload(driver_a, doc_type="cin", side="recto", document_number="AB123456", expires_on=FUTURE).status_code == 201
    assert upload(driver_a, doc_type="cin", side="verso").status_code == 201

    # Selfie : une seule face, rien d'autre à saisir.
    assert upload(driver_a, doc_type="selfie", side="recto").status_code == 400
    assert upload(driver_a, doc_type="selfie").status_code == 201

    # Assurance : rattachée à un camion, avec assureur et couverture de la marchandise.
    missing = upload(driver_a, doc_type="assurance", document_number="P-1", expires_on=FUTURE)
    assert missing.status_code == 400 and {"vehicle", "issuer", "covers_goods"} <= set(missing.data)
    ok = upload(
        driver_a,
        doc_type="assurance",
        vehicle=str(vehicle.pk),
        document_number="P-1",
        expires_on=FUTURE,
        issuer="Wafa Assurance",
        covers_goods="true",
    )
    assert ok.status_code == 201, ok.data


@pytest.mark.django_db
def test_files_are_private_and_never_exposed(driver_a, private_dirs):
    response = upload(driver_a, doc_type="selfie")
    assert "file" not in response.data
    document = DriverDocument.objects.get(pk=response.data["id"])

    stored = Path(document.file.path)
    assert stored.exists() and stored.is_relative_to(Path(private_dirs.PRIVATE_MEDIA_ROOT))
    # Rien dans le dossier public des médias, et aucune URL publique.
    media = Path(private_dirs.MEDIA_ROOT)
    assert not media.exists() or not any(media.rglob("*.jpg"))
    with pytest.raises(ValueError):
        document.file.url  # noqa: B018


@pytest.mark.django_db
def test_new_upload_replaces_previous_one(driver_a):
    first = upload(driver_a, doc_type="selfie").data["id"]
    second = upload(driver_a, doc_type="selfie").data["id"]
    assert DriverDocument.objects.get(pk=first).replaced_at is not None
    ids = [d["id"] for d in auth(driver_a).get("/api/me/driver-profile/documents/").data["results"]]
    assert second in ids and first not in ids


@pytest.mark.django_db
def test_only_authorised_staff_can_open_a_document_and_access_is_logged(driver_a, client):
    document_id = upload(driver_a, doc_type="selfie").data["id"]
    url = f"/admin/justificatifs/{document_id}/fichier/"

    assert client.get(url).status_code == 302  # non connecté : renvoyé vers la connexion admin

    staff = User.objects.create_user(phone="0699999998", password=PASSWORD, full_name="Équipe", is_staff=True)
    client.force_login(staff)
    assert client.get(url).status_code == 403  # membre de l'équipe sans la permission

    admin = User.objects.create_superuser(phone="0699999999", password=PASSWORD, full_name="Admin")
    client.force_login(admin)
    response = client.get(url)
    assert response.status_code == 200
    assert response["Cache-Control"] == "no-store, private"
    assert DocumentAccessLog.objects.filter(document_id=document_id, user=admin).count() == 1


@pytest.mark.django_db
def test_decisions_are_recorded_and_notified(driver_a):
    profile = driver_a.driver_profile
    admin = User.objects.create_superuser(phone="0699999999", password=PASSWORD, full_name="Admin")
    document = DriverDocument.objects.get(pk=upload(driver_a, doc_type="selfie").data["id"])

    services.decide_document(document, VerificationStatus.REJECTED, by=admin, reason="Photo floue")
    services.decide_profile(profile, VerificationStatus.REJECTED, by=admin, reason="Justificatifs incomplets")

    events = VerificationEvent.objects.filter(driver=profile)
    assert events.count() == 2 and all(e.decided_by == admin for e in events)
    assert Notification.objects.filter(user=driver_a, kind="document_reviewed").exists()
    assert Notification.objects.filter(user=driver_a, kind="profile_reviewed").exists()
    profile.refresh_from_db()
    assert profile.rejection_reason == "Justificatifs incomplets"


@pytest.mark.django_db
def test_expired_documents_block_offers(driver_a, published_cargo):
    profile = driver_a.driver_profile
    upload(driver_a, doc_type="cin", side="recto", document_number="AB1", expires_on=FUTURE)
    DriverDocument.objects.filter(driver=profile, doc_type=D.CIN).update(expires_on=timezone.localdate() - timedelta(days=1))

    response = auth(driver_a).post(f"/api/cargos/{published_cargo.pk}/offers/", {"price": "5000"})
    assert response.status_code == 409
    assert response.data["code"] == "document_expired"


@pytest.mark.django_db
def test_vehicle_with_expired_insurance_cannot_be_offered(driver_a, published_cargo):
    vehicle = driver_a.driver_profile.vehicles.first()
    upload(
        driver_a,
        doc_type="assurance",
        vehicle=str(vehicle.pk),
        document_number="P-1",
        expires_on=FUTURE,
        issuer="Wafa Assurance",
        covers_goods="false",
    )
    DriverDocument.objects.filter(vehicle=vehicle).update(expires_on=timezone.localdate() - timedelta(days=1))

    response = auth(driver_a).post(
        f"/api/cargos/{published_cargo.pk}/offers/", {"price": "5000", "vehicle": str(vehicle.pk)}
    )
    assert response.status_code == 409
    assert response.data["code"] == "vehicle_insurance"


@pytest.mark.django_db
def test_checklist_and_expiry_reminders_are_sent_once(driver_a):
    profile = driver_a.driver_profile
    states = {(i["doc_type"], i["side"]): i["state"] for i in services.checklist(profile)}
    assert states[("cin", "recto")] == "missing"
    assert ("carte_grise", "recto") in states  # un camion actif : ses justificatifs sont exigés

    soon = str(timezone.localdate() + timedelta(days=10))
    upload(driver_a, doc_type="permis", side="recto", document_number="P123", expires_on=soon)
    assert services.notify_expiring_documents() == 1
    assert services.notify_expiring_documents() == 0  # pas de doublon si la tâche repasse
    assert Notification.objects.filter(user=driver_a, kind="document_expiring").count() == 1


@pytest.mark.django_db
def test_other_users_cannot_attach_documents_to_someone_elses_truck(driver_a, driver_b):
    other_vehicle = driver_b.driver_profile.vehicles.first()
    response = upload(
        driver_a,
        doc_type="carte_grise",
        side="recto",
        vehicle=str(other_vehicle.pk),
        document_number="12345-A-6",
    )
    assert response.status_code == 400 and "vehicle" in response.data

