from django.conf import settings
from django.db import models

from apps.common.models import BaseModel


class Notification(BaseModel):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notifications")
    kind = models.CharField(max_length=40)
    title = models.CharField(max_length=120)
    body = models.CharField(max_length=500)
    data = models.JSONField(default=dict, blank=True)  # ex. {"cargo_id": "..."} pour la navigation mobile
    is_read = models.BooleanField(default=False)

    class Meta(BaseModel.Meta):
        verbose_name = "notification"
        indexes = [models.Index(fields=["user", "is_read"])]


class PushToken(BaseModel):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="push_tokens")
    token = models.CharField(max_length=255, unique=True)
    platform = models.CharField(max_length=10, blank=True)

    class Meta(BaseModel.Meta):
        verbose_name = "jeton push"
