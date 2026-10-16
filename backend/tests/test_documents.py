from datetime import timedelta
from pathlib import Path

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone

from apps.accounts.models import User
from apps.drivers import services
from apps.drivers.models import DocumentAccessLog, DriverDocument, VerificationEvent, VerificationStatus
from apps.notifications.models import Notification
from apps.vehicles.models import Vehicle

from .conftest import PASSWORD, auth, make_driver, proof_photo, vehicle_for

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


def offer(driver_user, cargo, vehicle=None):
    vehicle = vehicle or vehicle_for(driver_user, cargo)
    return auth(driver_user).post(f"/api/cargos/{cargo.pk}/offers/", {"price": "5000", "vehicle": str(vehicle.pk)})


@pytest.mark.django_db
def test_expired_documents_block_offers(driver_a, published_cargo):
    profile = driver_a.driver_profile
    DriverDocument.objects.filter(driver=profile, doc_type=D.CIN).update(expires_on=timezone.localdate() - timedelta(days=1))

    response = offer(driver_a, published_cargo)
    assert response.status_code == 409
    assert response.data["code"] == "document_expired"


@pytest.mark.django_db
def test_rejected_personal_document_blocks_offers_even_on_a_verified_profile(driver_a, published_cargo):
    DriverDocument.objects.filter(driver=driver_a.driver_profile, doc_type=D.LICENSE, side="verso").update(
        status=VerificationStatus.REJECTED
    )
    response = offer(driver_a, published_cargo)
    assert response.status_code == 409 and response.data["code"] == "document_rejected"


@pytest.mark.django_db
def test_replacing_a_personal_document_sends_a_verified_profile_back_to_review(driver_a, published_cargo):
    profile = driver_a.driver_profile
    upload(driver_a, doc_type="cin", side="recto", document_number="ZZ999999", expires_on=FUTURE)
    profile.refresh_from_db()
    assert profile.verification_status == VerificationStatus.PENDING
    assert offer(driver_a, published_cargo).data["code"] == "driver_not_verified"


@pytest.mark.django_db
def test_vehicle_with_expired_insurance_cannot_be_offered(driver_a, published_cargo):
    vehicle = vehicle_for(driver_a, published_cargo)
    DriverDocument.objects.filter(vehicle=vehicle, doc_type=D.INSURANCE).update(
        expires_on=timezone.localdate() - timedelta(days=1)
    )
    response = offer(driver_a, published_cargo, vehicle)
    assert response.status_code == 409
    assert response.data["code"] == "vehicle_documents"


@pytest.mark.django_db
def test_new_truck_needs_verified_documents_before_use(driver_a, published_cargo):
    """Un profil vérifié ne suffit pas : un camion ajouté ensuite doit avoir ses propres justificatifs validés."""
    profile = driver_a.driver_profile
    profile.vehicles.update(is_active=False)
    new_truck = Vehicle.objects.create(
        driver=profile, truck_type=published_cargo.truck_type, capacity_kg=9000, registration_number="NEW-1"
    )
    assert offer(driver_a, published_cargo, new_truck).data["code"] == "vehicle_documents"

    upload(
        driver_a,
        doc_type="assurance",
        vehicle=str(new_truck.pk),
        document_number="P-9",
        expires_on=FUTURE,
        issuer="Wafa Assurance",
        covers_goods="true",
    )
    assert offer(driver_a, published_cargo, new_truck).data["code"] == "vehicle_documents"  # pas encore vérifiée

    DriverDocument.objects.filter(vehicle=new_truck).delete()
    for doc_type, side in services.REQUIRED_PER_VEHICLE:
        DriverDocument.objects.create(
            driver=profile, vehicle=new_truck, doc_type=doc_type, side=side, file=proof_photo(), status=VerificationStatus.VERIFIED
        )
    assert offer(driver_a, published_cargo, new_truck).status_code == 201


@pytest.mark.django_db
def test_truck_must_match_the_cargo_type_and_weight(driver_a, published_cargo):
    wrong_type = driver_a.driver_profile.vehicles.exclude(truck_type=published_cargo.truck_type).first()
    response = offer(driver_a, published_cargo, wrong_type)
    assert response.status_code == 409 and response.data["code"] == "vehicle_unsuitable"

    Vehicle.objects.filter(pk=vehicle_for(driver_a, published_cargo).pk).update(capacity_kg=published_cargo.weight_kg - 1)
    response = offer(driver_a, published_cargo)
    assert response.status_code == 409 and response.data["code"] == "vehicle_unsuitable"

    no_vehicle = auth(driver_a).post(f"/api/cargos/{published_cargo.pk}/offers/", {"price": "5000"})
    assert no_vehicle.status_code == 409 and no_vehicle.data["code"] == "vehicle_required"


@pytest.mark.django_db
def test_checklist_and_expiry_reminders_are_sent_once():
    rookie = make_driver("0688888888", verified=False)
    profile = rookie.driver_profile
    states = {(i["doc_type"], i["side"]): i["state"] for i in services.checklist(profile)}
    assert states[("cin", "recto")] == "missing"
    assert ("carte_grise", "recto") in states  # un camion actif : ses justificatifs sont exigés

    soon = str(timezone.localdate() + timedelta(days=10))
    upload(rookie, doc_type="permis", side="recto", document_number="P123", expires_on=soon)
    assert services.notify_expiring_documents() == 1
    assert services.notify_expiring_documents() == 0  # pas de doublon si la tâche repasse
    assert Notification.objects.filter(user=rookie, kind="document_expiring").count() == 1


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

