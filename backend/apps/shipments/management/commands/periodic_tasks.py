from django.core.management.base import BaseCommand

from apps.cargos.services import expire_stale_cargos
from apps.drivers.services import notify_expiring_documents
from apps.shipments.services import auto_complete_deliveries


class Command(BaseCommand):
    help = "Tâches périodiques (toutes les 15 min via cron) : expiration des annonces, confirmation auto des livraisons, rappels d'expiration des justificatifs."

    def handle(self, *args, **options):
        expired = expire_stale_cargos()
        completed = auto_complete_deliveries()
        reminders = notify_expiring_documents()
        self.stdout.write(
            self.style.SUCCESS(
                f"{expired} annonce(s) expirée(s), {completed} livraison(s) confirmée(s), "
                f"{reminders} rappel(s) d'expiration de justificatif."
            )
        )
