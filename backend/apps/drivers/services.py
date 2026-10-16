from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from apps.common.exceptions import BusinessRuleError
from apps.notifications.services import notify

from .models import DriverDocument, DriverProfile, VerificationEvent, VerificationStatus

D = DriverDocument.DocType
S = DriverDocument.Side

# Justificatifs exigés pour chaque chauffeur...
REQUIRED_PERSONAL = [(D.CIN, S.FRONT), (D.CIN, S.BACK), (D.SELFIE, S.SINGLE), (D.LICENSE, S.FRONT), (D.LICENSE, S.BACK)]
# ... et pour chaque camion actif.
REQUIRED_PER_VEHICLE = [(D.REGISTRATION, S.FRONT), (D.REGISTRATION, S.BACK), (D.INSURANCE, S.SINGLE)]

# Faces possibles par type de document.
TWO_SIDED = {D.CIN, D.LICENSE, D.REGISTRATION}
VEHICLE_DOCUMENTS = {D.REGISTRATION, D.INSURANCE, D.TECHNICAL_INSPECTION}
# Date d'expiration à saisir (sur le recto pour les documents à deux faces).
EXPIRING = {D.CIN, D.LICENSE, D.INSURANCE, D.TECHNICAL_INSPECTION}

EXPIRY_REMINDER_DAYS = 30


def current_documents(profile: DriverProfile):
    return profile.documents.filter(replaced_at__isnull=True)


def checklist(profile: DriverProfile) -> list[dict]:
    """État de chaque justificatif exigé : manquant, en attente, vérifié, refusé ou expiré."""
    docs = {(d.doc_type, d.side, d.vehicle_id): d for d in current_documents(profile)}
    items = [(doc_type, side, None) for doc_type, side in REQUIRED_PERSONAL]
    for vehicle in profile.vehicles.filter(is_active=True).order_by("created_at"):
        items += [(doc_type, side, vehicle) for doc_type, side in REQUIRED_PER_VEHICLE]

    result = []
    for doc_type, side, vehicle in items:
        doc = docs.get((doc_type, side, vehicle.pk if vehicle else None))
        if doc is None:
            state = "missing"
        elif doc.is_expired:
            state = "expired"
        else:
            state = doc.status
        result.append(
            {
                "doc_type": doc_type,
                "side": side,
                "vehicle_id": str(vehicle.pk) if vehicle else None,
                "vehicle_label": vehicle.registration_number if vehicle else "",
                "state": state,
                "document_id": str(doc.pk) if doc else None,
                "expires_on": doc.expires_on.isoformat() if doc and doc.expires_on else None,
                "review_note": doc.review_note if doc else "",
            }
        )
    return result


def personal_document_problem(profile: DriverProfile) -> tuple[str, str] | None:
    """
    (code, message) si un justificatif personnel exigé manque, a été refusé ou a expiré, sinon None.
    Un profil vérifié peut avoir un justificatif refusé ou expiré après coup : il ne doit plus proposer de tarif.
    """
    docs = {(d.doc_type, d.side): d for d in current_documents(profile).filter(vehicle__isnull=True)}
    for doc_type, side in REQUIRED_PERSONAL:
        doc = docs.get((doc_type, side))
        if doc is None:
            return "document_missing", f"Justificatif manquant : « {D(doc_type).label} ». Ajoutez-le depuis votre profil."
        if doc.status == VerificationStatus.REJECTED:
            return (
                "document_rejected",
                f"Votre justificatif « {doc.get_doc_type_display()} » a été refusé. Envoyez une version valide depuis votre profil.",
            )
        if doc.is_expired:
            return (
                "document_expired",
                f"Votre justificatif « {doc.get_doc_type_display()} » a expiré. Envoyez une version à jour depuis votre profil.",
            )
    return None


def vehicle_problem(vehicle) -> str | None:
    """
    Raison pour laquelle ce camion ne peut pas être proposé, sinon None : sa carte grise et son assurance
    doivent être vérifiées par l'équipe et à jour. Un camion ajouté après la vérification du profil
    reste donc inutilisable tant que ses justificatifs n'ont pas été contrôlés.
    """
    if not vehicle.is_active:
        return "Ce camion a été retiré de votre profil."
    docs = {
        (d.doc_type, d.side): d
        for d in DriverDocument.objects.filter(vehicle=vehicle, replaced_at__isnull=True)
    }
    required = [docs.get(key) for key in REQUIRED_PER_VEHICLE]
    if any(d is not None and d.status == VerificationStatus.REJECTED for d in required):
        return "Un justificatif de ce camion a été refusé. Envoyez une version valide depuis votre profil."
    if any(d is not None and d.is_expired for d in required):
        return "Un justificatif de ce camion a expiré (assurance ou carte grise). Envoyez une version à jour."
    if any(d is None or d.status != VerificationStatus.VERIFIED for d in required):
        return (
            "La carte grise et l'assurance de ce camion doivent être vérifiées par notre équipe avant de l'utiliser."
        )
    return None


def vehicle_fit_problem(vehicle, cargo) -> str | None:
    """Le camion doit être du type demandé dans l'annonce et pouvoir porter son poids."""
    if vehicle.truck_type != cargo.truck_type:
        return "Ce camion n'est pas du type demandé dans l'annonce."
    if vehicle.capacity_kg < cargo.weight_kg:
        return "Ce camion ne peut pas porter le poids de cette cargaison."
    return None


@transaction.atomic
def add_document(profile: DriverProfile, **fields) -> DriverDocument:
    """Enregistre un justificatif ; l'envoi précédent du même document est marqué comme remplacé."""
    current_documents(profile).filter(
        doc_type=fields["doc_type"], side=fields["side"], vehicle=fields.get("vehicle")
    ).update(replaced_at=timezone.now())
    document = DriverDocument.objects.create(driver=profile, **fields)
    # Un nouveau justificatif relance la vérification si le profil avait été refusé, et aussi s'il était
    # vérifié et que le document est personnel (CIN, permis, selfie) : sinon un profil vérifié pourrait
    # remplacer ses pièces par d'autres sans contrôle. Les documents d'un camion n'ont pas cet effet :
    # c'est le camion seul qui reste inutilisable tant qu'ils ne sont pas vérifiés (voir `vehicle_problem`).
    personal = fields.get("vehicle") is None and (fields["doc_type"], fields["side"]) in REQUIRED_PERSONAL
    if profile.verification_status == VerificationStatus.REJECTED or (
        personal and profile.verification_status == VerificationStatus.VERIFIED
    ):
        profile.verification_status = VerificationStatus.PENDING
        profile.verified_at = None
        profile.save(update_fields=["verification_status", "verified_at", "updated_at"])
    return document


DOCUMENT_DECISION_MESSAGES = {
    VerificationStatus.VERIFIED: "Votre justificatif « {doc} » a été validé.",
    VerificationStatus.REJECTED: "Votre justificatif « {doc} » a été refusé : {reason}",
}
PROFILE_DECISION_MESSAGES = {
    VerificationStatus.VERIFIED: "Votre profil transporteur est vérifié : vous pouvez proposer vos tarifs.",
    VerificationStatus.REJECTED: "La vérification de votre profil a été refusée : {reason}",
}


@transaction.atomic
def decide_document(document: DriverDocument, status: str, *, by, reason: str = "") -> DriverDocument:
    """Décision de l'équipe sur un justificatif : enregistrée dans l'historique et notifiée au chauffeur."""
    document.status = status
    document.review_note = reason
    document.reviewed_by = by
    document.reviewed_at = timezone.now()
    document.save(update_fields=["status", "review_note", "reviewed_by", "reviewed_at", "updated_at"])
    VerificationEvent.objects.create(driver=document.driver, document=document, status=status, reason=reason, decided_by=by)
    if status in DOCUMENT_DECISION_MESSAGES:
        notify(
            document.driver.user,
            kind="document_reviewed",
            title="Vérification de vos justificatifs",
            body=DOCUMENT_DECISION_MESSAGES[status].format(doc=document.get_doc_type_display(), reason=reason or "—"),
            data={"document_id": str(document.pk)},
        )
    return document


def unverified_requirements(profile: DriverProfile) -> list[dict]:
    """Justificatifs exigés (personnels et camions actifs) qui ne sont pas encore vérifiés et à jour."""
    return [item for item in checklist(profile) if item["state"] != VerificationStatus.VERIFIED]


@transaction.atomic
def decide_profile(profile: DriverProfile, status: str, *, by, reason: str = "") -> DriverProfile:
    """Décision de l'équipe sur le profil transporteur : historique + notification."""
    if status == VerificationStatus.VERIFIED and unverified_requirements(profile):
        raise BusinessRuleError(
            "Vérifiez d'abord chaque justificatif exigé (pièces personnelles et documents des camions).",
            code="documents_not_verified",
        )
    profile.verification_status = status
    profile.verified_at = timezone.now() if status == VerificationStatus.VERIFIED else None
    profile.rejection_reason = reason if status == VerificationStatus.REJECTED else ""
    profile.save(update_fields=["verification_status", "verified_at", "rejection_reason", "updated_at"])
    VerificationEvent.objects.create(driver=profile, status=status, reason=reason, decided_by=by)
    if status in PROFILE_DECISION_MESSAGES:
        notify(
            profile.user,
            kind="profile_reviewed",
            title="Vérification de votre profil",
            body=PROFILE_DECISION_MESSAGES[status].format(reason=reason or "—"),
            data={"driver_id": str(profile.pk)},
        )
    return profile


def notify_expiring_documents() -> int:
    """Prévient le chauffeur (une seule fois par document) 30 jours avant l'expiration. Commande `periodic_tasks`."""
    limit = timezone.localdate() + timedelta(days=EXPIRY_REMINDER_DAYS)
    count = 0
    candidates = DriverDocument.objects.filter(
        replaced_at__isnull=True, expiry_notified_at__isnull=True, expires_on__lte=limit
    ).exclude(status=VerificationStatus.REJECTED).values_list("pk", flat=True)
    for pk in candidates:
        with transaction.atomic():
            doc = DriverDocument.objects.select_for_update().select_related("driver__user").get(pk=pk)
            if doc.expiry_notified_at or doc.replaced_at:
                continue  # déjà traité par une autre exécution
            doc.expiry_notified_at = timezone.now()
            doc.save(update_fields=["expiry_notified_at", "updated_at"])
            when = doc.expires_on.strftime("%d/%m/%Y")
            body = (
                f"Votre justificatif « {doc.get_doc_type_display()} » a expiré le {when}. Envoyez une version à jour."
                if doc.is_expired
                else f"Votre justificatif « {doc.get_doc_type_display()} » expire le {when}. Pensez à le renouveler."
            )
            notify(doc.driver.user, kind="document_expiring", title="Justificatif à renouveler", body=body, data={"document_id": str(doc.pk)})
            count += 1
    return count
