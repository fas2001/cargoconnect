from datetime import timedelta

import pytest
from django.core.management import call_command
from django.utils import timezone

from apps.cargos.models import CargoStatus
from apps.shipments.models import Shipment, ShipmentStatus

from .conftest import auth, make_user, offer_on


@pytest.fixture
def shipment(client_user, driver_a, published_cargo):
    offer = offer_on(published_cargo, driver_a)
    response = auth(client_user).post(f"/api/offers/{offer['id']}/accept/")
    assert response.status_code == 201
    return Shipment.objects.get(pk=response.data["id"])


def move(user, shipment, status, note=""):
    return auth(user).post(f"/api/shipments/{shipment.pk}/events/", {"status": status, "note": note})


@pytest.mark.django_db
def test_full_happy_path_with_history_and_reviews(client_user, driver_a, shipment):
    assert move(driver_a, shipment, "loaded").status_code == 201
    assert move(driver_a, shipment, "in_transit").status_code == 201
    delivered = move(driver_a, shipment, "delivered")
    assert delivered.data["status"] == "delivered"

    # Le chauffeur ne peut pas confirmer sa propre livraison : c'est le client.
    assert move(driver_a, shipment, "completed").status_code == 409
    done = move(client_user, shipment, "completed")
    assert done.status_code == 201
    assert [e["to_status"] for e in done.data["events"]] == ["confirmed", "loaded", "in_transit", "delivered", "completed"]
    assert done.data["can_review"] is True

    review = auth(client_user).post(f"/api/shipments/{shipment.pk}/review/", {"rating": 5, "comment": "Ponctuel"})
    assert review.status_code == 201
    assert auth(client_user).post(f"/api/shipments/{shipment.pk}/review/", {"rating": 4}).status_code == 409

    profile = auth(driver_a).get("/api/me/driver-profile/").data
    assert profile["rating"] == {"average": 5.0, "count": 1}


@pytest.mark.django_db
def test_client_cannot_drive_status_and_steps_cannot_be_skipped(client_user, driver_a, shipment):
    assert move(client_user, shipment, "loaded").status_code == 409
    response = move(driver_a, shipment, "delivered")
    assert response.status_code == 409
    assert response.data["code"] == "invalid_transition"


@pytest.mark.django_db
def test_dispute_and_cancel_require_a_reason(client_user, driver_a, shipment):
    assert move(client_user, shipment, "cancelled").data["code"] == "note_required"
    response = move(client_user, shipment, "cancelled", "Le camion ne s'est pas présenté")
    assert response.status_code == 201
    shipment.cargo.refresh_from_db()
    assert shipment.cargo.status == CargoStatus.CANCELLED


@pytest.mark.django_db
def test_outsider_cannot_see_shipment(shipment):
    outsider = auth(make_user("0677777777"))
    assert outsider.get(f"/api/shipments/{shipment.pk}/").status_code == 404
    assert outsider.get("/api/shipments/").data["count"] == 0


@pytest.mark.django_db
def test_shipment_list_by_role(client_user, driver_a, shipment):
    assert auth(client_user).get("/api/shipments/", {"role": "client"}).data["count"] == 1
    assert auth(client_user).get("/api/shipments/", {"role": "driver"}).data["count"] == 0
    assert auth(driver_a).get("/api/shipments/", {"role": "driver", "scope": "active"}).data["count"] == 1


@pytest.mark.django_db
def test_periodic_tasks_autocomplete_and_expire(client_user, driver_a, shipment, published_cargo, cargo_payload):
    for status in ("loaded", "in_transit", "delivered"):
        move(driver_a, shipment, status)
    Shipment.objects.filter(pk=shipment.pk).update(delivered_at=timezone.now() - timedelta(hours=49))

    stale = auth(client_user).post("/api/cargos/", {**cargo_payload, "publish": True}).data
    from apps.cargos.models import Cargo

    Cargo.objects.filter(pk=stale["id"]).update(expires_at=timezone.now() - timedelta(minutes=1))

    call_command("periodic_tasks")

    shipment.refresh_from_db()
    assert shipment.status == ShipmentStatus.COMPLETED
    assert shipment.events.last().actor is None
    assert Cargo.objects.get(pk=stale["id"]).status == CargoStatus.EXPIRED
