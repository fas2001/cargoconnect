from datetime import timedelta

import pytest
from django.core.management import call_command
from django.utils import timezone

from apps.cargos.models import Cargo, CargoStatus
from apps.shipments.models import Shipment, ShipmentStatus

from .conftest import accept, auth, make_user, offer_on, proof_for


@pytest.fixture
def shipment(client_user, driver_a, published_cargo):
    offer = offer_on(published_cargo, driver_a)
    response = accept(client_user, offer)
    assert response.status_code == 201
    return Shipment.objects.get(pk=response.data["id"])


def move(user, shipment, status, note="", proof=True, code=""):
    data = {"status": status, "note": note, **(proof_for(status) if proof else {})}
    if code:
        data["delivery_code"] = code
    return auth(user).post(f"/api/shipments/{shipment.pk}/events/", data, format="multipart")


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
    shipment.cargo.refresh_from_db()
    assert shipment.cargo.status == CargoStatus.COMPLETED

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
    move(driver_a, shipment, "loaded")
    move(driver_a, shipment, "in_transit")
    move(driver_a, shipment, "delivered", code=shipment.delivery_code)
    Shipment.objects.filter(pk=shipment.pk).update(delivered_at=timezone.now() - timedelta(hours=49))

    stale = auth(client_user).post("/api/cargos/", {**cargo_payload, "publish": True}).data
    Cargo.objects.filter(pk=stale["id"]).update(expires_at=timezone.now() - timedelta(minutes=1))

    call_command("periodic_tasks")

    shipment.refresh_from_db()
    assert shipment.status == ShipmentStatus.COMPLETED
    assert shipment.events.last().actor is None
    assert shipment.cargo.status == CargoStatus.COMPLETED
    assert Cargo.objects.get(pk=stale["id"]).status == CargoStatus.EXPIRED


@pytest.mark.django_db
def test_loading_and_delivery_require_photos_gps_and_signature(client_user, driver_a, shipment):
    assert move(driver_a, shipment, "loaded", proof=False).data["code"] == "photo_required"
    no_gps = {k: v for k, v in proof_for("loaded").items() if k not in ("latitude", "longitude")}
    response = auth(driver_a).post(
        f"/api/shipments/{shipment.pk}/events/", {"status": "loaded", **no_gps}, format="multipart"
    )
    assert response.data["code"] == "location_required"
    assert move(driver_a, shipment, "loaded").status_code == 201
    assert move(driver_a, shipment, "in_transit").status_code == 201

    unsigned = {k: v for k, v in proof_for("delivered").items() if k != "signature"}
    response = auth(driver_a).post(
        f"/api/shipments/{shipment.pk}/events/", {"status": "delivered", **unsigned}, format="multipart"
    )
    assert response.data["code"] == "signature_required"
    delivered = move(driver_a, shipment, "delivered")
    assert delivered.status_code == 201

    # Les deux parties voient les preuves dans l'historique.
    events = {e["to_status"]: e for e in auth(client_user).get(f"/api/shipments/{shipment.pk}/").data["events"]}
    assert len(events["loaded"]["photos"]) == 1 and events["loaded"]["latitude"] == "33.573110"
    assert events["delivered"]["receiver_name"] == "Youssef Réception"
    assert events["delivered"]["signature"] == "M10 10 L40 40 L60 20"


@pytest.mark.django_db
def test_signature_cannot_contain_markup(driver_a, shipment):
    move(driver_a, shipment, "loaded")
    move(driver_a, shipment, "in_transit")
    data = {**proof_for("delivered"), "status": "delivered", "signature": "<script>alert(1)</script>"}
    response = auth(driver_a).post(f"/api/shipments/{shipment.pk}/events/", data, format="multipart")
    assert response.status_code == 400 and "signature" in response.data


def deliver(driver, shipment, code=""):
    move(driver, shipment, "loaded")
    move(driver, shipment, "in_transit")
    return move(driver, shipment, "delivered", code=code)


@pytest.mark.django_db
def test_delivery_code_is_shown_to_the_client_only(client_user, driver_a, shipment):
    assert len(shipment.delivery_code) == 6
    assert auth(client_user).get(f"/api/shipments/{shipment.pk}/").data["delivery_code"] == shipment.delivery_code
    assert auth(driver_a).get(f"/api/shipments/{shipment.pk}/").data["delivery_code"] is None
    assert shipment.delivery_code not in str(auth(driver_a).get(f"/api/shipments/{shipment.pk}/").data)


@pytest.mark.django_db
def test_wrong_delivery_codes_are_counted_then_locked(driver_a, shipment):
    move(driver_a, shipment, "loaded")
    move(driver_a, shipment, "in_transit")
    wrong = "000000" if shipment.delivery_code != "000000" else "111111"
    for _ in range(5):
        response = move(driver_a, shipment, "delivered", code=wrong)
        assert response.status_code == 409 and response.data["code"] == "delivery_code_invalid"
    shipment.refresh_from_db()
    assert shipment.delivery_code_attempts == 5 and shipment.status == ShipmentStatus.IN_TRANSIT

    # Même le bon code est refusé : il ne reste que la déclaration sans code.
    assert move(driver_a, shipment, "delivered", code=shipment.delivery_code).data["code"] == "delivery_code_locked"
    assert move(driver_a, shipment, "delivered").status_code == 201


@pytest.mark.django_db
def test_delivery_without_code_is_never_auto_confirmed(client_user, driver_a, shipment, admin_user):
    from apps.notifications.models import Notification
    from apps.shipments.services import needing_attention

    assert deliver(driver_a, shipment).data["delivered_with_code"] is False
    assert "sans le code" in Notification.objects.filter(user=client_user, kind="shipment_delivered").get().body
    Shipment.objects.filter(pk=shipment.pk).update(delivered_at=timezone.now() - timedelta(hours=49))

    call_command("periodic_tasks")
    shipment.refresh_from_db()
    assert shipment.status == ShipmentStatus.DELIVERED
    assert list(needing_attention()) == [shipment]
    assert auth(admin_user).get("/api/backoffice/dashboard/").data["shipments_attention"] == 1
    listed = auth(admin_user).get("/api/backoffice/shipments/", {"status": "attention"}).data["results"]
    assert [s["id"] for s in listed] == [str(shipment.pk)]


@pytest.mark.django_db
def test_correct_code_marks_the_delivery_as_proven(client_user, driver_a, shipment):
    delivered = deliver(driver_a, shipment, code=shipment.delivery_code)
    assert delivered.status_code == 201 and delivered.data["delivered_with_code"] is True
    assert delivered.data["delivery_code"] is None


@pytest.mark.django_db
def test_staff_can_close_a_disputed_shipment(client_user, driver_a, shipment, admin_user):
    from apps.notifications.models import Notification

    move(driver_a, shipment, "loaded")
    move(client_user, shipment, "disputed", "Marchandise abîmée au chargement")
    url = f"/api/backoffice/shipments/{shipment.pk}/resolve/"

    assert auth(client_user).post(url, {"status": "completed", "note": "x"}, format="json").status_code == 403
    assert auth(admin_user).post(url, {"status": "delivered", "note": "x"}, format="json").status_code == 400
    assert auth(admin_user).get(f"/api/backoffice/shipments/{shipment.pk}/").data["can_resolve"] is True

    response = auth(admin_user).post(url, {"status": "cancelled", "note": "Accord trouvé avec les deux parties"}, format="json")
    assert response.status_code == 200 and response.data["status"] == "cancelled"
    assert response.data["can_resolve"] is False
    last = shipment.events.last()
    assert last.actor == admin_user and "Accord trouvé" in last.note
    assert Notification.objects.filter(kind="shipment_cancelled", user__in=[client_user, driver_a]).count() == 2
    assert auth(admin_user).post(url, {"status": "completed", "note": "x"}, format="json").data["code"] == "shipment_closed"


@pytest.mark.django_db
def test_shipment_not_loaded_after_the_loading_date_needs_attention(shipment):
    from apps.shipments.services import needing_attention

    assert not needing_attention().exists()
    Cargo.objects.filter(pk=shipment.cargo_id).update(loading_date=timezone.localdate() - timedelta(days=2))
    assert list(needing_attention()) == [shipment]


@pytest.fixture
def admin_user(db):
    from apps.accounts.models import User

    return User.objects.create_superuser(phone="0699999999", password="Camion-Maroc-2026", full_name="Admin Équipe")
