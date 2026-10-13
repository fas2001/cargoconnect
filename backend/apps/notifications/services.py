import json
import logging
import urllib.request

from django.conf import settings
from django.db import transaction

from .models import Notification, PushToken

logger = logging.getLogger(__name__)

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"


def notify(user, *, kind: str, title: str, body: str, data: dict | None = None) -> Notification:
    """Crée la notification in-app et envoie le push après validation de la transaction."""
    notification = Notification.objects.create(user=user, kind=kind, title=title, body=body, data=data or {})
    transaction.on_commit(lambda: _send_push(user.id, title, body, {**(data or {}), "kind": kind}))
    return notification


def _send_push(user_id, title: str, body: str, data: dict) -> None:
    if not settings.CARGOCONNECT["EXPO_PUSH_ENABLED"]:
        return
    tokens = list(PushToken.objects.filter(user_id=user_id).values_list("token", flat=True))
    if not tokens:
        return
    payload = [{"to": token, "title": title, "body": body, "data": data, "sound": "default"} for token in tokens]
    request = urllib.request.Request(
        EXPO_PUSH_URL,
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json", "Accept": "application/json"},
    )
    try:
        # TODO : passer par une file de tâches (Celery/RQ) quand le volume le justifiera.
        urllib.request.urlopen(request, timeout=5).read()
    except Exception:  # un échec de push ne doit jamais casser l'action métier
        logger.exception("Échec de l'envoi push Expo pour l'utilisateur %s", user_id)
