import re

from django.core.exceptions import ValidationError

_MOROCCAN_PHONE = re.compile(r"^(?:\+212|00212|0)([5-7]\d{8})$")


def normalize_phone(raw: str) -> str:
    """Convertit un numéro marocain (06..., +2126..., 002126...) au format E.164 +212XXXXXXXXX."""
    compact = re.sub(r"[\s.\-()]", "", raw or "")
    match = _MOROCCAN_PHONE.match(compact)
    if not match:
        raise ValidationError("Numéro de téléphone marocain invalide (ex. 0612345678).", code="invalid_phone")
    return f"+212{match.group(1)}"


# Suite de 8 chiffres ou plus, éventuellement séparés (06 12 34 56 78, +212.6...).
_PHONE_IN_TEXT = re.compile(r"(?:\+|00)?\d(?:[\s.\-/]*\d){7,}")
_EMAIL_IN_TEXT = re.compile(r"[\w.+-]+@[\w-]+\.[\w.]+")


def validate_no_contact_info(text: str) -> None:
    """
    Les coordonnées ne sont partagées qu'après confirmation du transport.
    On refuse donc les numéros et e-mails dans les champs de texte libre.
    """
    if not text:
        return
    if _PHONE_IN_TEXT.search(text) or _EMAIL_IN_TEXT.search(text):
        raise ValidationError(
            "Les coordonnées (téléphone, e-mail) ne peuvent pas être partagées ici. "
            "Elles seront visibles automatiquement après confirmation du transport.",
            code="contact_info",
        )
