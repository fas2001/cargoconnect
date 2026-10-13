import threading

import pytest
from django.db import IntegrityError, connection, transaction

from apps.cargos.models import CargoStatus
from apps.offers.models import Offer, OfferStatus
from apps.shipments.models import Shipment

from .conftest import auth, make_driver, offer_on


@pytest.mark.django_db
def test_driver_sees_only_own_offers_client_sees_all(client_user, driver_a, driver_b, published_cargo):
    offer_on(published_cargo, driver_a, "5000")
    offer_on(published_cargo, driver_b, "4800")

    as_a = auth(driver_a).get(f"/api/cargos/{published_cargo.pk}/offers/")
    assert len(as_a.data) == 1 and as_a.data[0]["price"] == "5000.00"

    as_client = auth(client_user).get(f"/api/cargos/{published_cargo.pk}/offers/")
    assert [o["price"] for o in as_client.data] == ["4800.00", "5000.00"]  # triées par prix
    assert "phone" not in str(as_client.data)  # aucune coordonnée avant confirmation

    b_offer = Offer.objects.get(driver__user=driver_b)
    assert auth(driver_a).get(f"/api/offers/{b_offer.pk}/").status_code == 404


@pytest.mark.django_db
def test_offer_rules(client_user, driver_a, published_cargo):
    client_as_driver = make_driver("0655555555", "Client Chauffeur")
    published_cargo.client = client_as_driver
    published_cargo.save()
    own = auth(client_as_driver).post(f"/api/cargos/{published_cargo.pk}/offers/", {"price": "100"})
    assert own.status_code == 409 and own.data["code"] == "own_cargo"

    offer_on(published_cargo, driver_a)
    duplicate = auth(driver_a).post(f"/api/cargos/{published_cargo.pk}/offers/", {"price": "4000"})
    assert duplicate.status_code == 409 and duplicate.data["code"] == "offer_exists"

    no_profile = auth(client_user).post(f"/api/cargos/{published_cargo.pk}/offers/", {"price": "4000"})
    assert no_profile.status_code == 403


@pytest.mark.django_db
def test_unverified_driver_cannot_offer(published_cargo):
    rookie = make_driver("0666666666", verified=False)
    response = auth(rookie).post(f"/api/cargos/{published_cargo.pk}/offers/", {"price": "4000"})
    assert response.status_code == 409
    assert response.data["code"] == "driver_not_verified"


@pytest.mark.django_db
def test_contact_info_rejected_in_offer_message(driver_a, published_cargo):
    response = auth(driver_a).post(
        f"/api/cargos/{published_cargo.pk}/offers/", {"price": "4000", "message": "whatsapp +212 6 61 22 33 44"}
    )
    assert response.status_code == 400


@pytest.mark.django_db
def test_driver_can_edit_then_withdraw_pending_offer(driver_a, published_cargo):
    offer = offer_on(published_cargo, driver_a, "5000")
    api = auth(driver_a)
    assert api.patch(f"/api/offers/{offer['id']}/", {"price": "4500"}).data["price"] == "4500.00"
    assert api.post(f"/api/offers/{offer['id']}/withdraw/").data["status"] == OfferStatus.WITHDRAWN
    assert api.patch(f"/api/offers/{offer['id']}/", {"price": "4000"}).status_code == 409
    # Après retrait, il peut refaire une proposition.
    offer_on(published_cargo, driver_a, "4200")


@pytest.mark.django_db
def test_accept_creates_one_shipment_and_closes_other_offers(client_user, driver_a, driver_b, published_cargo):
    offer_a = offer_on(published_cargo, driver_a, "5000")
    offer_b = offer_on(published_cargo, driver_b, "4800")

    accepted = auth(client_user).post(f"/api/offers/{offer_b['id']}/accept/")
    assert accepted.status_code == 201, accepted.data
    assert accepted.data["status"] == "confirmed"
    # Après confirmation, les coordonnées complètes sont partagées.
    assert accepted.data["driver"]["phone"] == "+212633333333"
    assert accepted.data["client"]["phone"] == "+212611111111"
    assert accepted.data["cargo"]["origin_address"] == "Derb Omar, rue 5"

    published_cargo.refresh_from_db()
    assert published_cargo.status == CargoStatus.ASSIGNED
    assert Offer.objects.get(pk=offer_a["id"]).status == OfferStatus.CLOSED
    assert Shipment.objects.filter(cargo=published_cargo).count() == 1

    # Deuxième acceptation : refusée par la règle métier.
    second = auth(client_user).post(f"/api/offers/{offer_a['id']}/accept/")
    assert second.status_code == 409
    assert Shipment.objects.count() == 1

    # Le chauffeur retenu voit maintenant l'adresse ; l'autre non (et ne voit plus l'annonce dans la liste).
    assert "origin_address" in auth(driver_b).get(f"/api/cargos/{published_cargo.pk}/").data
    assert "origin_address" not in auth(driver_a).get(f"/api/cargos/{published_cargo.pk}/").data
    assert auth(driver_a).get("/api/cargos/").data["count"] == 0


@pytest.mark.django_db
def test_only_cargo_owner_can_accept(driver_a, driver_b, published_cargo):
    offer = offer_on(published_cargo, driver_a)
    assert auth(driver_a).post(f"/api/offers/{offer['id']}/accept/").status_code == 403
    assert auth(driver_b).post(f"/api/offers/{offer['id']}/accept/").status_code == 404


@pytest.mark.django_db
def test_database_forbids_two_accepted_offers(driver_a, driver_b, published_cargo):
    """Filet de sécurité : même si le code applicatif était contourné, la base refuse."""
    offer_on(published_cargo, driver_a)
    offer_on(published_cargo, driver_b)
    first, second = Offer.objects.filter(cargo=published_cargo)
    Offer.objects.filter(pk=first.pk).update(status=OfferStatus.ACCEPTED)
    with pytest.raises(IntegrityError), transaction.atomic():
        Offer.objects.filter(pk=second.pk).update(status=OfferStatus.ACCEPTED)


@pytest.mark.skipif(connection.vendor != "postgresql", reason="Verrous de ligne réels : à lancer sur PostgreSQL")
@pytest.mark.django_db(transaction=True)
def test_concurrent_accepts_yield_a_single_shipment(client_user, driver_a, driver_b, published_cargo):
    offers = [offer_on(published_cargo, driver_a), offer_on(published_cargo, driver_b)]
    results = []
    barrier = threading.Barrier(2)

    def accept(offer_id):
        try:
            barrier.wait()
            results.append(auth(client_user).post(f"/api/offers/{offer_id}/accept/").status_code)
        finally:
            connection.close()

    threads = [threading.Thread(target=accept, args=(o["id"],)) for o in offers]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert sorted(results) == [201, 409]
    assert Shipment.objects.filter(cargo=published_cargo).count() == 1
    assert Offer.objects.filter(cargo=published_cargo, status=OfferStatus.ACCEPTED).count() == 1
