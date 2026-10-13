import io
import json
import urllib.error

import pytest
from rest_framework.test import APIClient

from apps.accounts.models import PhoneOTP
from apps.accounts.otp_delivery import OTPDeliveryError, WhatsAppCloudBackend

from .conftest import auth

WHATSAPP = {
    "ACCESS_TOKEN": "test-token",
    "PHONE_NUMBER_ID": "123456789",
    "TEMPLATE_NAME": "cargoconnect_code",
    "TEMPLATE_LANGUAGE": "fr",
    "API_VERSION": "v25.0",
}


@pytest.fixture
def whatsapp(settings):
    settings.CARGOCONNECT = {
        **settings.CARGOCONNECT,
        "OTP_BACKEND": "apps.accounts.otp_delivery.WhatsAppCloudBackend",
        "WHATSAPP": WHATSAPP,
    }


class FakeResponse(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.close()


def test_payload_follows_authentication_template_format(whatsapp):
    payload = WhatsAppCloudBackend().build_payload("+212611111111", "482913")
    assert payload["to"] == "212611111111"
    assert payload["template"]["name"] == "cargoconnect_code"
    assert payload["template"]["language"] == {"code": "fr"}
    body, button = payload["template"]["components"]
    assert body["parameters"][0]["text"] == "482913"
    assert button["sub_type"] == "url" and button["parameters"][0]["text"] == "482913"


def test_missing_configuration_is_reported(settings):
    settings.CARGOCONNECT = {**settings.CARGOCONNECT, "WHATSAPP": {**WHATSAPP, "ACCESS_TOKEN": ""}}
    with pytest.raises(OTPDeliveryError, match="ACCESS_TOKEN"):
        WhatsAppCloudBackend()


@pytest.mark.django_db
def test_verify_phone_sends_code_via_whatsapp(whatsapp, client_user, monkeypatch):
    calls = []

    def fake_urlopen(request, timeout):
        calls.append({"url": request.full_url, "auth": request.headers["Authorization"], "body": json.loads(request.data)})
        return FakeResponse(json.dumps({"messages": [{"id": "wamid.X"}]}).encode())

    monkeypatch.setattr("apps.accounts.otp_delivery.urllib.request.urlopen", fake_urlopen)
    monkeypatch.setattr("apps.accounts.services.secrets.randbelow", lambda n: 654321)

    response = APIClient().post("/api/auth/otp/request/", {"phone": "0611111111", "purpose": "verify_phone"})
    assert response.status_code == 202
    assert calls[0]["url"] == "https://graph.facebook.com/v25.0/123456789/messages"
    assert calls[0]["auth"] == "Bearer test-token"
    assert calls[0]["body"]["template"]["components"][0]["parameters"][0]["text"] == "654321"

    verified = auth(client_user).post("/api/me/verify-phone/", {"code": "654321"})
    assert verified.status_code == 200
    assert verified.data["phone_verified"] is True


@pytest.mark.django_db
def test_whatsapp_failure_returns_503_and_leaves_no_valid_code(whatsapp, client_user, monkeypatch):
    def failing_urlopen(request, timeout):
        raise urllib.error.HTTPError(request.full_url, 400, "Bad Request", {}, io.BytesIO(b'{"error":{"code":131026}}'))

    monkeypatch.setattr("apps.accounts.otp_delivery.urllib.request.urlopen", failing_urlopen)
    response = APIClient().post("/api/auth/otp/request/", {"phone": "0611111111", "purpose": "verify_phone"})
    assert response.status_code == 503
    assert response.data["code"] == "otp_unavailable"
    assert not PhoneOTP.objects.exists()
