import mimetypes

from django.contrib.admin.views.decorators import staff_member_required
from django.core.exceptions import PermissionDenied
from django.http import FileResponse, Http404
from django.shortcuts import get_object_or_404

from apps.accounts.models import ClientDocument

from .models import DocumentAccessLog, DriverDocument


def _serve(request, private_file, permission: str, **log):
    """
    Seul accès à un justificatif privé : membre de l'équipe avec la permission de consultation.
    Chaque ouverture est enregistrée (qui, quand, depuis quelle adresse IP).
    """
    if not request.user.has_perm(permission):
        raise PermissionDenied
    if not private_file.file or not private_file.file.storage.exists(private_file.file.name):
        raise Http404("Fichier introuvable.")
    DocumentAccessLog.objects.create(user=request.user, ip_address=request.META.get("REMOTE_ADDR"), **log)
    content_type = mimetypes.guess_type(private_file.file.name)[0] or "application/octet-stream"
    response = FileResponse(private_file.file.open("rb"), content_type=content_type)
    # Pas de mise en cache (navigateur ou proxy) d'une pièce d'identité.
    response["Cache-Control"] = "no-store, private"
    response["X-Content-Type-Options"] = "nosniff"
    return response


@staff_member_required
def document_file(request, pk):
    document = get_object_or_404(DriverDocument, pk=pk)
    return _serve(request, document, "drivers.view_driverdocument", document=document)


@staff_member_required
def client_document_file(request, pk):
    document = get_object_or_404(ClientDocument, pk=pk)
    return _serve(request, document, "accounts.view_clientdocument", client_document=document)
