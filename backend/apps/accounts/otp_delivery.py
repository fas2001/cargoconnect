"""
Envoi des codes de vérification (OTP).

Le canal est choisi par `CARGOCONNECT["OTP_BACKEND"]` :
- `ConsoleBackend` (développement) : le code est écrit dans les logs du serveur ;
- `WhatsAppCloudBackend` (production) : modèle « Authentification » de l'API WhatsApp Cloud (Meta).
"""

import json
import logging
import urllib.error
import urllib.request

from django.conf import settings
from django.utils.module_loading import import_string

logger = logging.getLogger(__name__)


class OTPDeliveryError(Exception):
    """Le code n'a pas pu être remis au destinataire."""


class ConsoleBackend:
    def send_code(self, phone: str, code: str) -> None:
        ttl = settings.CARGOCONNECT["OTP_TTL_MINUTES"]
        logger.info("CODE -> %s : CargoConnect, votre code est %s (expire dans %s min).", phone, code, ttl)


class WhatsAppCloudBackend:
    """
    Envoie un modèle de catégorie AUTHENTICATION avec bouton « Copier le code ».
    Le modèle doit être créé et approuvé dans le WhatsApp Manager (voir docs/whatsapp.md).
    """

    def __init__(self):
        config = settings.CARGOCONNECT["WHATSAPP"]
        missing = [key for key in ("ACCESS_TOKEN", "PHONE_NUMBER_ID", "TEMPLATE_NAME") if not config.get(key)]
        if missing:
            raise OTPDeliveryError(f"Configuration WhatsApp incomplète : {', '.join(missing)}.")
        self.config = config

    def build_payload(self, phone: str, code: str) -> dict:
        return {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": phone.lstrip("+"),  # format international sans « + » : 2126XXXXXXXX
            "type": "template",
            "template": {
                "name": self.config["TEMPLATE_NAME"],
                "language": {"code": self.config["TEMPLATE_LANGUAGE"]},
                "components": [
                    # Le code doit être identique dans le corps et dans le bouton « Copier le code ».
                    {"type": "body", "parameters": [{"type": "text", "text": code}]},
                    {"type": "button", "sub_type": "url", "index": "0", "parameters": [{"type": "text", "text": code}]},
                ],
            },
        }

    def send_code(self, phone: str, code: str) -> None:
        url = f"https://graph.facebook.com/{self.config['API_VERSION']}/{self.config['PHONE_NUMBER_ID']}/messages"
        request = urllib.request.Request(
            url,
            data=json.dumps(self.build_payload(phone, code)).encode(),
            headers={"Authorization": f"Bearer {self.config['ACCESS_TOKEN']}", "Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=10) as response:
                body = json.loads(response.read() or b"{}")
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode(errors="replace")[:500]
            logger.error("WhatsApp Cloud API a refusé l'envoi vers %s : %s %s", phone, exc.code, detail)
            raise OTPDeliveryError("WhatsApp a refusé l'envoi du code.") from exc
        except (urllib.error.URLError, TimeoutError) as exc:
            logger.error("WhatsApp Cloud API injoignable : %s", exc)
            raise OTPDeliveryError("Service WhatsApp injoignable.") from exc
        if not body.get("messages"):
            logger.error("Réponse WhatsApp inattendue pour %s : %s", phone, body)
            raise OTPDeliveryError("Réponse WhatsApp inattendue.")


def deliver_code(phone: str, code: str) -> None:
    backend = import_string(settings.CARGOCONNECT["OTP_BACKEND"])()
    backend.send_code(phone, code)
