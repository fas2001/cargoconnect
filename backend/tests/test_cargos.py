import pytest

from apps.cargos.models import CargoStatus
from apps.offers.models import OfferStatus

from .conftest import auth, make_user, offer_on


@pytest.mark.django_db
def test_create_draft_then_publish(client_user, cargo_payload):
    api = auth(client_user)
    response = api.post("/api/cargos/", cargo_payload)
    assert response.status_code == 201, response.data
    assert response.data["status"] == CargoStatus.DRAFT
    assert response.data["currency"] == "MAD"

    published = api.post(f"/api/cargos/{response.data['id']}/publish/")
    assert published.status_code == 200
    assert published.data["status"] == CargoStatus.PUBLISHED
    assert published.data["expires_at"] is not None


@pytest.mark.django_db
def test_create_and_publish_in_one_call(client_user, cargo_payload):
    response = auth(client_user).post("/api/cargos/", {**cargo_payload, "publish": True})
    assert response.status_code == 201
    assert response.data["status"] == CargoStatus.PUBLISHED


@pytest.mark.django_db
def test_driver_cannot_publish_cargo(driver_a, cargo_payload):
    assert auth(driver_a).post("/api/cargos/", cargo_payload).status_code == 403


@pytest.mark.django_db
def test_contact_info_is_rejected_in_description(client_user, cargo_payload):
    response = auth(client_user).post(
        "/api/cargos/", {**cargo_payload, "description": "Appelez-moi au 06 12 34 56 78"}
    )
    assert response.status_code == 400
    assert "description" in response.data


@pytest.mark.django_db
def test_marketplace_hides_drafts_own_cargos_and_private_addresses(client_user, driver_a, published_cargo, cargo_payload):
    auth(client_user).post("/api/cargos/", cargo_payload)  # brouillon

    listing = auth(driver_a).get("/api/cargos/")
    assert [c["id"] for c in listing.data["results"]] == [str(published_cargo.pk)]

    detail = auth(driver_a).get(f"/api/cargos/{published_cargo.pk}/")
    assert detail.status_code == 200
    assert "origin_address" not in detail.data
    assert detail.data["client"]["name"] == "Karim E."  # nom abrégé, pas de téléphone

    own = auth(client_user).get(f"/api/cargos/{published_cargo.pk}/")
    assert own.data["origin_address"] == "Derb Omar, rue 5"

    # Le client ne voit pas sa propre annonce dans la place de marché, mais la retrouve dans « mine ».
    assert auth(client_user).get("/api/cargos/").data["count"] == 0
    assert auth(client_user).get("/api/cargos/mine/").data["count"] == 2


@pytest.mark.django_db
def test_marketplace_filters(driver_a, published_cargo, cities):
    origin, destination = cities
    api = auth(driver_a)
    assert api.get("/api/cargos/", {"origin_city": origin.pk}).data["count"] == 1
    assert api.get("/api/cargos/", {"origin_city": destination.pk}).data["count"] == 0
    assert api.get("/api/cargos/", {"weight_min": 6000}).data["count"] == 0
    assert api.get("/api/cargos/", {"truck_type": "fourgon"}).data["count"] == 1


@pytest.mark.django_db
def test_other_user_cannot_edit_or_cancel(published_cargo):
    intruder = auth(make_user("0644444444"))
    assert intruder.patch(f"/api/cargos/{published_cargo.pk}/", {"title": "Piraté"}).status_code == 404
    assert intruder.post(f"/api/cargos/{published_cargo.pk}/cancel/").status_code == 404


@pytest.mark.django_db
def test_cargo_locked_once_offers_received(client_user, driver_a, published_cargo):
    offer_on(published_cargo, driver_a)
    response = auth(client_user).patch(f"/api/cargos/{published_cargo.pk}/", {"weight_kg": "9000"})
    assert response.status_code == 409
    assert response.data["code"] == "cargo_locked"


@pytest.mark.django_db
def test_cancel_closes_pending_offers(client_user, driver_a, published_cargo):
    offer = offer_on(published_cargo, driver_a)
    response = auth(client_user).post(f"/api/cargos/{published_cargo.pk}/cancel/", {"reason": "Plus besoin"})
    assert response.status_code == 200
    assert response.data["status"] == CargoStatus.CANCELLED
    assert published_cargo.offers.get(pk=offer["id"]).status == OfferStatus.CLOSED
    assert driver_a.notifications.filter(kind="offer_closed").exists()


@pytest.mark.django_db
def test_reference_data_is_seeded():
    from rest_framework.test import APIClient

    api = APIClient()
    assert len(api.get("/api/reference/cities/").data) >= 30
    assert len(api.get("/api/reference/goods-categories/").data) >= 10
    assert {"value": "frigorifique", "label": "Frigorifique"} in api.get("/api/reference/truck-types/").data


@pytest.mark.django_db
def test_declared_value_and_declaration_are_required_and_private(client_user, driver_a, cargo_payload):
    without = {k: v for k, v in cargo_payload.items() if k not in ("declared_value", "accept_goods_declaration")}
    response = auth(client_user).post("/api/cargos/", without, format="json")
    assert response.status_code == 400
    assert {"declared_value", "accept_goods_declaration"} <= set(response.data)

    refused = auth(client_user).post("/api/cargos/", {**cargo_payload, "accept_goods_declaration": False}, format="json")
    assert refused.status_code == 400

    created = auth(client_user).post(
        "/api/cargos/",
        {**cargo_payload, "publish": True, "recipient_name": "Dépôt Tanger", "recipient_phone": "0612345678"},
        format="json",
    )
    assert created.status_code == 201, created.data
    assert created.data["recipient_phone"] == "+212612345678"
    assert created.data["goods_declaration_at"] is not None

    # Un chauffeur qui consulte l'annonce ne voit ni la valeur ni le destinataire.
    seen = auth(driver_a).get(f"/api/cargos/{created.data['id']}/").data
    assert "declared_value" not in seen and "recipient_phone" not in seen


@pytest.mark.django_db
def test_report_a_listing(client_user, driver_a, published_cargo):
    from apps.reports.models import Report

    report = {"reason": "inaccurate", "description": "Le poids indiqué est faux", "cargo": str(published_cargo.pk)}
    response = auth(driver_a).post("/api/reports/", report)
    assert response.status_code == 201
    assert Report.objects.get().reported_user == client_user

    # Pas sa propre annonce, ni une annonce qu'on ne peut pas voir.
    assert auth(client_user).post("/api/reports/", report).status_code == 400
    published_cargo.status = "draft"
    published_cargo.save()
    assert auth(driver_a).post("/api/reports/", report).status_code == 400
