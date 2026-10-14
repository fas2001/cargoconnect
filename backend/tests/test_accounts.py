import pytest
from rest_framework.test import APIClient

from apps.accounts.models import PhoneOTP, User
from apps.common.validators import normalize_phone

from .conftest import PASSWORD, auth, proof_photo


@pytest.mark.parametrize(
    "raw",
    ["0612345678", "06 12 34 56 78", "+212612345678", "00212612345678", "06.12.34.56.78"],
)
def test_normalize_phone_accepts_moroccan_formats(raw):
    assert normalize_phone(raw) == "+212612345678"


@pytest.mark.django_db
def test_register_then_login_with_local_format():
    api = APIClient()
    response = api.post(
        "/api/auth/register/", {"phone": "06 98 76 54 32", "full_name": "Salma Idrissi", "password": PASSWORD}
    )
    assert response.status_code == 201, response.data
    assert response.data["user"]["phone"] == "+212698765432"
    assert response.data["user"]["roles"] == ["client"]
    assert "access" in response.data

    login = api.post("/api/auth/login/", {"phone": "0698765432", "password": PASSWORD})
    assert login.status_code == 200, login.data
    assert login.data["user"]["full_name"] == "Salma Idrissi"


@pytest.mark.django_db
def test_register_rejects_duplicate_phone(client_user):
    response = APIClient().post(
        "/api/auth/register/", {"phone": "+212611111111", "full_name": "Doublon", "password": PASSWORD}
    )
    assert response.status_code == 400
    assert "phone" in response.data


@pytest.mark.django_db
def test_register_as_driver_creates_pending_profile():
    api = APIClient()
    response = api.post(
        "/api/auth/register/",
        {"phone": "0655555555", "full_name": "Youssef Routier", "password": PASSWORD, "role": "driver", "company_name": "Trans Atlas"},
    )
    assert response.status_code == 201, response.data
    assert response.data["user"]["roles"] == ["driver"]
    assert response.data["user"]["driver_profile"]["company_name"] == "Trans Atlas"
    assert response.data["user"]["driver_profile"]["verification_status"] == "pending"


@pytest.mark.django_db
def test_client_cannot_become_driver(client_user):
    api = auth(client_user)
    assert api.post("/api/me/driver-profile/", {"company_name": "Trans Atlas"}).status_code == 405
    assert api.get("/api/me/").data["roles"] == ["client"]


@pytest.mark.django_db
def test_password_reset_via_code(client_user, monkeypatch):
    sent = {}
    monkeypatch.setattr("apps.accounts.services.deliver_code", lambda phone, code: sent.update(phone=phone, code=code))
    monkeypatch.setattr("apps.accounts.services.secrets.randbelow", lambda n: 123456)

    api = APIClient()
    assert api.post("/api/auth/otp/request/", {"phone": "0611111111", "purpose": "reset_password"}).status_code == 202
    assert sent["phone"] == "+212611111111"

    bad = api.post("/api/auth/password-reset/", {"phone": "0611111111", "code": "000000", "new_password": "Nouveau-Pass-99"})
    assert bad.status_code == 409

    ok = api.post("/api/auth/password-reset/", {"phone": "0611111111", "code": "123456", "new_password": "Nouveau-Pass-99"})
    assert ok.status_code == 204
    client_user.refresh_from_db()
    assert client_user.check_password("Nouveau-Pass-99")
    assert client_user.phone_verified
    # Un code ne sert qu'une fois.
    again = api.post("/api/auth/password-reset/", {"phone": "0611111111", "code": "123456", "new_password": "Autre-Pass-77"})
    assert again.status_code == 409


@pytest.mark.django_db
def test_otp_request_for_unknown_phone_does_not_leak(monkeypatch):
    calls = []
    monkeypatch.setattr("apps.accounts.services.deliver_code", lambda *a: calls.append(a))
    response = APIClient().post("/api/auth/otp/request/", {"phone": "0700000000", "purpose": "reset_password"})
    assert response.status_code == 202
    assert calls == []
    assert not PhoneOTP.objects.exists()


@pytest.mark.django_db
def test_deactivate_account(client_user):
    assert auth(client_user).delete("/api/me/").status_code == 204
    assert not User.objects.get(pk=client_user.pk).is_active


@pytest.mark.django_db
def test_update_name_email_and_profile_photo(client_user):
    api = auth(client_user)
    response = api.patch("/api/me/", {"full_name": "  Karim   Bennani ", "email": "karim@example.ma"}, format="json")
    assert response.status_code == 200, response.data
    assert response.data["full_name"] == "Karim Bennani"
    assert api.patch("/api/me/", {"full_name": "K"}, format="json").status_code == 400
    assert api.patch("/api/me/", {"phone": "0699999999"}, format="json").data["phone"] == "+212611111111"  # non modifiable

    photo = api.patch("/api/me/", {"avatar": proof_photo("moi.jpg")}, format="multipart")
    assert photo.status_code == 200 and photo.data["avatar"].endswith(".jpg")
    removed = api.patch("/api/me/", {"avatar": None}, format="json")
    assert removed.data["avatar"] is None


@pytest.mark.django_db
def test_change_password(client_user):
    api = auth(client_user)
    wrong = api.post("/api/me/password/", {"current_password": "mauvais", "new_password": "Nouveau-Mot-2026"}, format="json")
    assert wrong.status_code == 400
    ok = api.post("/api/me/password/", {"current_password": PASSWORD, "new_password": "Nouveau-Mot-2026"}, format="json")
    assert ok.status_code == 200
    client_user.refresh_from_db()
    assert client_user.check_password("Nouveau-Mot-2026")


@pytest.mark.django_db
def test_password_change_logs_out_other_devices(client_user):
    anon = APIClient()
    phone_a = anon.post("/api/auth/login/", {"phone": "0611111111", "password": PASSWORD}).data
    phone_b = anon.post("/api/auth/login/", {"phone": "0611111111", "password": PASSWORD}).data

    api = APIClient()
    api.credentials(HTTP_AUTHORIZATION=f"Bearer {phone_a['access']}")
    changed = api.post("/api/me/password/", {"current_password": PASSWORD, "new_password": "Nouveau-Mot-2026"}, format="json")
    assert changed.status_code == 200

    # L'autre téléphone ne peut plus renouveler sa session, ni l'ancien jeton de celui-ci.
    assert anon.post("/api/auth/refresh/", {"refresh": phone_b["refresh"]}).status_code == 401
    assert anon.post("/api/auth/refresh/", {"refresh": phone_a["refresh"]}).status_code == 401
    # Le téléphone qui a changé le mot de passe reste connecté avec ses nouveaux jetons.
    assert anon.post("/api/auth/refresh/", {"refresh": changed.data["refresh"]}).status_code == 200
