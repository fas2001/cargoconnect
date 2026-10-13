import pytest

from apps.accounts import identity
from apps.accounts.models import User
from apps.drivers.models import DocumentAccessLog, VerificationStatus
from apps.notifications.models import Notification

from .conftest import PASSWORD, auth, make_user, proof_photo


@pytest.fixture
def newcomer(db):
    return make_user("0644444444", "Nadia Nouvelle")


def upload(user, **data):
    return auth(user).post("/api/me/client-identity/documents/", {"file": proof_photo(), **data}, format="multipart")


@pytest.mark.django_db
def test_identity_is_required_before_the_first_publication_but_not_for_drafts(newcomer, cargo_payload):
    api = auth(newcomer)
    assert api.get("/api/me/").data["identity_status"] == "missing"

    draft = api.post("/api/cargos/", cargo_payload, format="json")
    assert draft.status_code == 201  # brouillon : possible sans identité
    blocked = api.post(f"/api/cargos/{draft.data['id']}/publish/")
    assert blocked.status_code == 409 and blocked.data["code"] == "identity_required"

    assert api.put("/api/me/client-identity/", {"account_type": "individual", "cin_number": "ab 123456"}, format="json").status_code == 200
    assert api.get("/api/me/").data["identity_status"] == "incomplete"
    assert api.post(f"/api/cargos/{draft.data['id']}/publish/").status_code == 409

    assert upload(newcomer, doc_type="cin", side="recto").status_code == 201
    assert upload(newcomer, doc_type="cin", side="verso").status_code == 201
    me = api.get("/api/me/").data
    assert me["identity_status"] == "pending"
    assert api.post(f"/api/cargos/{draft.data['id']}/publish/").status_code == 200

    data = api.get("/api/me/client-identity/").data
    assert data["cin_number"] == "AB123456"
    assert all("file" not in d for d in data["documents"])


@pytest.mark.django_db
def test_company_identity_needs_ice_and_register(newcomer):
    api = auth(newcomer)
    bad = api.put("/api/me/client-identity/", {"account_type": "company", "company_name": "", "ice": "123"}, format="json")
    assert bad.status_code == 400 and {"company_name", "ice"} <= set(bad.data)
    ok = api.put(
        "/api/me/client-identity/",
        {"account_type": "company", "company_name": "Atlas Import", "ice": "001234567000089"},
        format="json",
    )
    assert ok.status_code == 200, ok.data
    # Une entreprise n'envoie pas de CIN, mais son registre de commerce / attestation ICE.
    assert upload(newcomer, doc_type="cin", side="recto").status_code == 400
    assert upload(newcomer, doc_type="registre_commerce").status_code == 201
    assert identity.status_of(newcomer) == "pending"


@pytest.mark.django_db
def test_drivers_have_no_client_identity(driver_a):
    assert auth(driver_a).get("/api/me/client-identity/").status_code == 403
    assert auth(driver_a).get("/api/me/").data["identity_status"] is None


@pytest.mark.django_db
def test_verified_badge_rejection_and_changes(client_user, driver_a, published_cargo):
    client_identity = client_user.client_identity
    assert auth(driver_a).get(f"/api/cargos/{published_cargo.pk}/").data["client"]["is_verified"] is False

    identity.decide_identity(client_identity, VerificationStatus.VERIFIED)
    assert auth(driver_a).get(f"/api/cargos/{published_cargo.pk}/").data["client"]["is_verified"] is True
    assert Notification.objects.filter(user=client_user, kind="identity_reviewed").exists()

    # Modifier une identité vérifiée la renvoie en vérification.
    auth(client_user).put("/api/me/client-identity/", {"account_type": "individual", "cin_number": "CD654321"}, format="json")
    client_identity.refresh_from_db()
    assert client_identity.verification_status == VerificationStatus.PENDING

    identity.decide_identity(client_identity, VerificationStatus.REJECTED, reason="CIN illisible")
    assert identity.publication_problem(client_user).startswith("Votre identité a été refusée : CIN illisible")


@pytest.mark.django_db
def test_client_documents_are_private_and_access_is_logged(client_user, client):
    document = client_user.client_identity.documents.first()
    url = f"/admin/justificatifs-clients/{document.pk}/fichier/"
    assert client.get(url).status_code == 302
    admin = User.objects.create_superuser(phone="0699999999", password=PASSWORD, full_name="Admin")
    client.force_login(admin)
    assert client.get(url).status_code == 200
    assert DocumentAccessLog.objects.filter(client_document=document, user=admin).count() == 1
    with pytest.raises(ValueError):
        document.file.url  # noqa: B018 — aucune URL publique
