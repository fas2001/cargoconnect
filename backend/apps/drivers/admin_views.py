import mimetypes

from django.contrib.admin.views.decorators import staff_member_required
from django.core.exceptions import PermissionDenied
from django.http import FileResponse, Http404
from django.shortcuts import get_object_or_404

from .models import DocumentAccessLog, DriverDocument


@staff_member_required
def document_file(request, pk):
    """
    Seul accès à un justificatif : membre de l'équipe avec la permission de consulter les justificatifs.
    Chaque ouverture est enregistrée (qui, quand, depuis quelle adresse IP).
    """
    if not request.user.has_perm("drivers.view_driverdocument"):
        raise PermissionDenied
    document = get_object_or_404(DriverDocument, pk=pk)
    if not document.file or not document.file.storage.exists(document.file.name):
        raise Http404("Fichier introuvable.")
    DocumentAccessLog.objects.create(document=document, user=request.user, ip_address=request.META.get("REMOTE_ADDR"))
    content_type = mimetypes.guess_type(document.file.name)[0] or "application/octet-stream"
    response = FileResponse(document.file.open("rb"), content_type=content_type)
    # Pas de mise en cache (navigateur ou proxy) d'une pièce d'identité.
    response["Cache-Control"] = "no-store, private"
    response["X-Content-Type-Options"] = "nosniff"
    return response
