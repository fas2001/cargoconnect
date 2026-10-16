import io
from datetime import timedelta

from django.conf import settings
from django.core.files.base import ContentFile
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone
from PIL import Image

from apps.accounts.models import User
from apps.cargos.models import Cargo, City, GoodsCategory
from apps.cargos.services import publish_cargo
from apps.drivers.models import DriverDocument, DriverProfile, VerificationStatus
from apps.drivers.services import REQUIRED_PER_VEHICLE, REQUIRED_PERSONAL
from apps.vehicles.models import TruckType, Vehicle

DEMO_PASSWORD = "demo-cargo-2026"
CLIENT_PHONE = "0600000001"
DRIVER_PHONE = "0600000002"


def _demo_image() -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", (64, 40), "lightgray").save(buffer, "JPEG")
    return buffer.getvalue()


class Command(BaseCommand):
    help = "Crée des comptes et annonces de démonstration (développement uniquement)."

    @transaction.atomic
    def handle(self, *args, **options):
        if not settings.DEBUG:
            raise CommandError("seed_demo est réservé au développement (DJANGO_DEBUG=true).")

        client, _ = User.objects.get_or_create(phone="+212600000001", defaults={"full_name": "Karim Expéditeur"})
        driver_user, _ = User.objects.get_or_create(phone="+212600000002", defaults={"full_name": "Ahmed Transporteur"})
        for user in (client, driver_user):
            user.set_password(DEMO_PASSWORD)
            user.phone_verified = True
            user.save()

        profile, _ = DriverProfile.objects.get_or_create(
            user=driver_user,
            defaults={
                "company_name": "Atlas Logistique",
                "verification_status": VerificationStatus.VERIFIED,
                "verified_at": timezone.now(),
            },
        )
        truck, _ = Vehicle.objects.get_or_create(
            registration_number="12345-A-6",
            defaults={"driver": profile, "truck_type": TruckType.PLATEAU, "capacity_kg": 25000, "brand_model": "Volvo FH"},
        )
        # Justificatifs validés : sans eux, un chauffeur vérifié ne peut pas proposer de tarif.
        expires = timezone.localdate() + timedelta(days=365)
        required = [(doc_type, side, None) for doc_type, side in REQUIRED_PERSONAL]
        required += [(doc_type, side, truck) for doc_type, side in REQUIRED_PER_VEHICLE]
        for doc_type, side, vehicle in required:
            if not DriverDocument.objects.filter(driver=profile, doc_type=doc_type, side=side, vehicle=vehicle).exists():
                DriverDocument.objects.create(
                    driver=profile,
                    doc_type=doc_type,
                    side=side,
                    vehicle=vehicle,
                    file=ContentFile(_demo_image(), name="demo.jpg"),
                    status=VerificationStatus.VERIFIED,
                    expires_on=expires,
                )

        city = {c.slug: c for c in City.objects.all()}
        cat = {c.slug: c for c in GoodsCategory.objects.all()}
        today = timezone.localdate()
        samples = [
            ("20 palettes de carrelage", "materiaux-construction", 18000, TruckType.PLATEAU, "casablanca", "tanger", 3, 6500),
            ("Agrumes en caisses", "fruits-legumes", 12000, TruckType.FRIGORIFIQUE, "agadir", "casablanca", 2, 7000),
            ("Déménagement appartement F4", "demenagement", 2500, TruckType.FOURGON, "rabat", "marrakech", 5, None),
            ("Machines textiles", "machines", 8000, TruckType.BACHE, "fes", "tanger", 4, 5200),
        ]
        created = 0
        for title, category, weight, truck, origin, destination, days, price in samples:
            if Cargo.objects.filter(client=client, title=title).exists():
                continue
            cargo = Cargo.objects.create(
                client=client,
                title=title,
                description="Annonce de démonstration.",
                category=cat[category],
                weight_kg=weight,
                truck_type=truck,
                origin_city=city[origin],
                origin_address="Adresse de chargement (démo)",
                destination_city=city[destination],
                destination_address="Adresse de livraison (démo)",
                loading_date=today + timedelta(days=days),
                proposed_price=price,
            )
            publish_cargo(cargo)
            created += 1

        self.stdout.write(self.style.SUCCESS(f"{created} annonce(s) créée(s)."))
        self.stdout.write(f"Client  : {CLIENT_PHONE} / {DEMO_PASSWORD}")
        self.stdout.write(f"Chauffeur (vérifié) : {DRIVER_PHONE} / {DEMO_PASSWORD}")
