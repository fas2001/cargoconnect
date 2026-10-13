"""Identité des expéditeurs (CIN ou ICE), exigée avant la première annonce publiée."""

from django.db import transaction
from django.utils import timezone

from apps.drivers.models import VerificationStatus
from apps.notifications.services import notify

from .models import ClientDocument, ClientIdentity

D = ClientDocument.DocType

REQUIRED_DOCUMENTS = {
    ClientIdentity.AccountType.INDIVIDUAL: [(D.CIN, "recto"), (D.CIN, "verso")],
    ClientIdentity.AccountType.COMPANY: [(D.BUSINESS_REGISTER, "unique")],
}


def current_documents(identity: ClientIdentity):
    return identity.documents.filter(replaced_at__isnull=True)


def checklist(identity: ClientIdentity) -> list[dict]:
    docs = {(d.doc_type, d.side): d for d in current_documents(identity)}
    result = []
    for doc_type, side in REQUIRED_DOCUMENTS[identity.account_type]:
        doc = docs.get((doc_type, side))
        result.append(
            {
                "doc_type": doc_type,
                "side": side,
                "state": doc.status if doc else "missing",
                "document_id": str(doc.pk) if doc else None,
                "review_note": doc.review_note if doc else "",
            }
        )
    return result


def status_of(user) -> str:
    """missing (rien saisi), incomplete (documents manquants ou refusés), pending, verified ou rejected."""
    identity = getattr(user, "client_identity", None)
    if identity is None:
        return "missing"
    if identity.verification_status == VerificationStatus.REJECTED:
        return "rejected"
    if any(item["state"] in ("missing", VerificationStatus.REJECTED) for item in checklist(identity)):
        return "incomplete"
    return identity.verification_status


def publication_problem(user) -> str | None:
    """Raison pour laquelle cet utilisateur ne peut pas encore publier d'annonce, sinon None."""
    status = status_of(user)
    if status == "missing":
        return "Complétez votre identité (CIN ou ICE) avant de publier une annonce."
    if status == "incomplete":
        return "Ajoutez les photos de votre pièce d'identité (ou de votre registre de commerce) avant de publier."
    if status == "rejected":
        return f"Votre identité a été refusée : {user.client_identity.rejection_reason or '—'}. Corrigez-la avant de publier."
    return None  # en attente de vérification ou vérifiée : la publication est possible


@transaction.atomic
def save_identity(user, **fields) -> ClientIdentity:
    """Crée ou met à jour l'identité ; toute modification d'une identité vérifiée la renvoie en vérification."""
    identity = getattr(user, "client_identity", None)
    if identity is None:
        return ClientIdentity.objects.create(user=user, **fields)
    changed = any(getattr(identity, key) != value for key, value in fields.items())
    for key, value in fields.items():
        setattr(identity, key, value)
    if changed and identity.verification_status != VerificationStatus.PENDING:
        identity.verification_status = VerificationStatus.PENDING
        identity.verified_at = None
    identity.save()
    return identity


@transaction.atomic
def add_document(identity: ClientIdentity, **fields) -> ClientDocument:
    """Nouveau document ; l'envoi précédent (même type et face) est conservé comme « remplacé »."""
    current_documents(identity).filter(doc_type=fields["doc_type"], side=fields["side"]).update(replaced_at=timezone.now())
    document = ClientDocument.objects.create(identity=identity, **fields)
    if identity.verification_status == VerificationStatus.REJECTED:
        identity.verification_status = VerificationStatus.PENDING
        identity.save(update_fields=["verification_status", "updated_at"])
    return document


IDENTITY_DECISION_MESSAGES = {
    VerificationStatus.VERIFIED: "Votre identité est vérifiée : le badge « Client vérifié » apparaît sur vos annonces.",
    VerificationStatus.REJECTED: "La vérification de votre identité a été refusée : {reason}",
}


@transaction.atomic
def decide_identity(identity: ClientIdentity, status: str, *, reason: str = "") -> ClientIdentity:
    identity.verification_status = status
    identity.verified_at = timezone.now() if status == VerificationStatus.VERIFIED else None
    identity.rejection_reason = reason if status == VerificationStatus.REJECTED else ""
    identity.save(update_fields=["verification_status", "verified_at", "rejection_reason", "updated_at"])
    notify(
        identity.user,
        kind="identity_reviewed",
        title="Vérification de votre identité",
        body=IDENTITY_DECISION_MESSAGES[status].format(reason=reason or "—"),
    )
    return identity


@transaction.atomic
def decide_document(document: ClientDocument, status: str, *, by, reason: str = "") -> ClientDocument:
    document.status = status
    document.review_note = reason
    document.reviewed_by = by
    document.reviewed_at = timezone.now()
    document.save(update_fields=["status", "review_note", "reviewed_by", "reviewed_at", "updated_at"])
    return document
