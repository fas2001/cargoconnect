import pytest
from rest_framework.test import APIClient

from apps.accounts.models import PhoneOTP, User
from apps.common.validators import normalize_phone

from .conftest import PASSWORD, auth


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
def test_activate_driver_role(client_user):
    api = auth(client_user)
    response = api.post("/api/me/driver-profile/", {"company_name": "Trans Atlas"})
    assert response.status_code == 201
    assert response.data["verification_status"] == "pending"
    client_user.refresh_from_db()
    assert api.get("/api/me/").data["roles"] == ["client", "driver"]
    assert api.post("/api/me/driver-profile/", {}).status_code == 409


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
