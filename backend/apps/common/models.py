import uuid

from django.db import models


class BaseModel(models.Model):
    """Identifiant UUID (non devinable dans les URLs) et horodatage."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    created_at = models.DateTimeField("créé le", auto_now_add=True)
    updated_at = models.DateTimeField("modifié le", auto_now=True)

    class Meta:
        abstract = True
        ordering = ["-created_at"]
