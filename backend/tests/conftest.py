import io
from datetime import timedelta

import pytest
from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone
from PIL import Image
from rest_framework.test import APIClient

from apps.accounts.models import ClientDocument, ClientIdentity, User
from apps.cargos.models import Cargo, CargoStatus, City, GoodsCategory
from apps.cargos.services import publish_cargo
from apps.drivers.models import DriverDocument, DriverProfile, VerificationStatus
from apps.vehicles.models import TruckType, Vehicle

PASSWORD = "Camion-Maroc-2026"


@pytest.fixture(autouse=True)
def _fast_test_settings(settings, tmp_path):
    # Fichiers téléversés pendant les tests : dossier temporaire, jamais les vrais dossiers media.
    settings.MEDIA_ROOT = tmp_path / "media"
    settings.PRIVATE_MEDIA_ROOT = tmp_path / "private"
    cache.clear()  # remet à zéro les compteurs de limitation (ex. 5 codes par heure)
    settings.PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]
    settings.REST_FRAMEWORK = {**settings.REST_FRAMEWORK, "DEFAULT_THROTTLE_CLASSES": []}


def make_user(phone, name="Test User"):
    return User.objects.create_user(phone=phone, password=PASSWORD, full_name=name)


def make_driver(phone, name="Driss Chauffeur", verified=True):
    """Chauffeur avec un plateau et un fourgon. Vérifié : tous ses justificatifs exigés sont validés et à jour."""
    user = make_user(phone, name)
    profile = DriverProfile.objects.create(
        user=user,
        verification_status=VerificationStatus.VERIFIED if verified else VerificationStatus.PENDING,
    )
    for truck_type in (TruckType.PLATEAU, TruckType.FOURGON):
        Vehicle.objects.create(
            driver=profile, truck_type=truck_type, capacity_kg=20000, registration_number=f"REG-{truck_type}-{phone[-4:]}"
        )
    if verified:
        give_driver_documents(profile, VerificationStatus.VERIFIED)
    return user


def give_driver_documents(profile, status=VerificationStatus.PENDING):
    """Tous les justificatifs exigés (personnels et par camion actif), avec le statut donné."""
    from apps.drivers.services import REQUIRED_PER_VEHICLE, REQUIRED_PERSONAL

    expires = timezone.localdate() + timedelta(days=365)
    items = [(doc_type, side, None) for doc_type, side in REQUIRED_PERSONAL]
    for vehicle in profile.vehicles.filter(is_active=True):
        items += [(doc_type, side, vehicle) for doc_type, side in REQUIRED_PER_VEHICLE]
    return [
        DriverDocument.objects.create(
            driver=profile, doc_type=doc_type, side=side, vehicle=vehicle, file=proof_photo(), status=status, expires_on=expires
        )
        for doc_type, side, vehicle in items
    ]


def vehicle_for(driver_user, cargo):
    """Camion du chauffeur adapté à l'annonce (même type)."""
    return driver_user.driver_profile.vehicles.get(truck_type=cargo.truck_type)


def auth(user) -> APIClient:
    client = APIClient()
    client.force_authenticate(user)
    return client


def give_identity(user, cin="AB123456"):
    """Identité de particulier complète (CIN + photos recto/verso), en attente de vérification."""
    identity = ClientIdentity.objects.create(user=user, account_type="individual", cin_number=cin)
    for side in ("recto", "verso"):
        ClientDocument.objects.create(identity=identity, doc_type="cin", side=side, file=proof_photo(f"cin-{side}.jpg"))
    return identity


@pytest.fixture
def client_user(db):
    user = make_user("0611111111", "Karim Expéditeur")
    give_identity(user)
    return user


@pytest.fixture
def driver_a(db):
    return make_driver("0622222222", "Ahmed Alaoui")


@pytest.fixture
def driver_b(db):
    return make_driver("0633333333", "Brahim Bennani")


@pytest.fixture
def cities(db):
    return City.objects.get(slug="casablanca"), City.objects.get(slug="tanger")


@pytest.fixture
def category(db):
    return GoodsCategory.objects.get(slug="palettes-colis")


@pytest.fixture
def cargo_payload(cities, category):
    origin, destination = cities
    return {
        "title": "20 palettes de carrelage",
        "description": "Carrelage emballé sur palettes filmées.",
        "category": category.pk,
        "weight_kg": "18000",
        "truck_type": TruckType.PLATEAU,
        "origin_city": origin.pk,
        "origin_address": "Zone industrielle Aïn Sebaâ, lot 12",
        "destination_city": destination.pk,
        "destination_address": "Port Tanger Med, zone franche",
        "loading_date": str(timezone.localdate() + timedelta(days=3)),
        "proposed_price": "6500",
        "declared_value": "120000",
        "accept_goods_declaration": True,
    }


@pytest.fixture
def published_cargo(client_user, cities, category):
    origin, destination = cities
    cargo = Cargo.objects.create(
        client=client_user,
        title="Électroménager",
        category=category,
        weight_kg=5000,
        truck_type=TruckType.FOURGON,
        origin_city=origin,
        origin_address="Derb Omar, rue 5",
        destination_city=destination,
        destination_address="Zone franche, bâtiment B",
        loading_date=timezone.localdate() + timedelta(days=2),
    )
    cargo = publish_cargo(cargo)
    assert cargo.status == CargoStatus.PUBLISHED
    return cargo


def proof_photo(name="preuve.jpg"):
    """Vraie image JPEG (ImageField vérifie le contenu)."""
    buffer = io.BytesIO()
    Image.new("RGB", (8, 8), "gray").save(buffer, "JPEG")
    return SimpleUploadedFile(name, buffer.getvalue(), content_type="image/jpeg")


# Preuves exigées au chargement et à la livraison (photos, GPS, réceptionnaire et signature).
def proof_for(status):
    if status not in ("loaded", "delivered"):
        return {}
    proof = {"photos": [proof_photo()], "latitude": "33.573110", "longitude": "-7.589843", "location_accuracy_m": "12"}
    if status == "delivered":
        proof |= {"receiver_name": "Youssef Réception", "signature": "M10 10 L40 40 L60 20"}
    return proof


def offer_on(cargo, driver_user, price="5000", message=""):
    payload = {"price": price, "message": message, "vehicle": str(vehicle_for(driver_user, cargo).pk)}
    response = auth(driver_user).post(f"/api/cargos/{cargo.pk}/offers/", payload)
    assert response.status_code == 201, response.data
    return response.data


def accept(client_user, offer):
    """Le client accepte l'offre au tarif qu'il voit affiché."""
    return auth(client_user).post(f"/api/offers/{offer['id']}/accept/", {"price": offer["price"]})
