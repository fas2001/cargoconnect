from datetime import timedelta

import pytest
from django.core.cache import cache
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.cargos.models import Cargo, CargoStatus, City, GoodsCategory
from apps.cargos.services import publish_cargo
from apps.drivers.models import DriverProfile, VerificationStatus
from apps.vehicles.models import TruckType, Vehicle

PASSWORD = "Camion-Maroc-2026"


@pytest.fixture(autouse=True)
def _fast_test_settings(settings):
    cache.clear()  # remet à zéro les compteurs de limitation (ex. 5 codes par heure)
    settings.PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]
    settings.REST_FRAMEWORK = {**settings.REST_FRAMEWORK, "DEFAULT_THROTTLE_CLASSES": []}


def make_user(phone, name="Test User"):
    return User.objects.create_user(phone=phone, password=PASSWORD, full_name=name)


def make_driver(phone, name="Driss Chauffeur", verified=True):
    user = make_user(phone, name)
    profile = DriverProfile.objects.create(
        user=user,
        verification_status=VerificationStatus.VERIFIED if verified else VerificationStatus.PENDING,
    )
    Vehicle.objects.create(
        driver=profile, truck_type=TruckType.PLATEAU, capacity_kg=20000, registration_number=f"REG-{phone[-4:]}"
    )
    return user


def auth(user) -> APIClient:
    client = APIClient()
    client.force_authenticate(user)
    return client


@pytest.fixture
def client_user(db):
    return make_user("0611111111", "Karim Expéditeur")


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


def offer_on(cargo, driver_user, price="5000", message=""):
    response = auth(driver_user).post(f"/api/cargos/{cargo.pk}/offers/", {"price": price, "message": message})
    assert response.status_code == 201, response.data
    return response.data
