# Architecture et règles métier

## Modèle de données

```
User ─┬─< Cargo ──< Offer >── DriverProfile ──< Vehicle
      │     │  └──< CargoPhoto        │   └──< DriverDocument
      │     └── 1:1 ── Shipment ──────┘
      │                  ├──< ShipmentEvent
      │                  ├──< Review
      │                  └──< Report
      ├─< Notification / PushToken
      └── 1:1 DriverProfile
City, GoodsCategory : référentiels (données initiales dans une migration)
```

- **Un seul compte par personne.** Tout utilisateur peut publier (rôle client). Le rôle chauffeur
  correspond à l'existence d'un `DriverProfile`. Le rôle actif est un choix d'interface, mémorisé
  sur le téléphone.
- Identifiants UUID, prix en `Decimal` avec devise explicite (`MAD`), dates en UTC et affichage
  dans le fuseau `Africa/Casablanca`.
- Les villes viennent d'une table de référence, ce qui fiabilise les filtres de recherche.

## Cycles de vie (trois entités distinctes)

| Entité | Statuts |
|---|---|
| Cargaison | `draft` → `published` → `assigned` · `cancelled` · `expired` |
| Offre | `pending` → `accepted` · `rejected` · `withdrawn` · `closed` (caduque) |
| Transport | `confirmed` → `loaded` → `in_transit` → `delivered` → `completed` · `cancelled` · `disputed` |

Le statut « En négociation » du cahier des charges est remplacé par « publiée avec N offres ».

### Transitions de transport autorisées (`apps/shipments/services.py`)

| De | Vers | Qui |
|---|---|---|
| confirmed | loaded | chauffeur |
| confirmed | cancelled | les deux (motif obligatoire) |
| loaded | in_transit | chauffeur |
| in_transit | delivered | chauffeur |
| delivered | completed | client (ou automatique après 48 h) |
| loaded / in_transit / delivered | disputed | les deux (motif obligatoire) |

Chaque changement crée un `ShipmentEvent`, qui forme un historique immuable.

## Garantie « une cargaison = un seul chauffeur »

`accept_offer` (`apps/offers/services.py`) repose sur trois niveaux de protection :

1. Une transaction avec `SELECT ... FOR UPDATE` sur la cargaison : les acceptations simultanées
   s'exécutent l'une après l'autre.
2. Une contrainte unique partielle en base : `UNIQUE(cargo) WHERE status = 'accepted'`.
3. `Shipment.cargo` et `Shipment.offer` en relation un-à-un (`OneToOne`).

Si deux acceptations arrivent en même temps, la seconde reçoit `409 cargo_already_assigned`.

## Confidentialité

- **Avant confirmation**, un chauffeur voit les villes, le poids et le prix, mais pas les adresses
  précises. Le client est affiché sous la forme « Prénom N. », sans téléphone.
- **Après confirmation**, les deux parties voient le nom complet, le téléphone et les adresses.
- Les numéros de téléphone et e-mails sont refusés dans les champs libres (description, commentaire
  d'offre, avis) pour éviter que les échanges se poursuivent hors de l'application.
- Un chauffeur ne voit que ses propres offres. Le client voit toutes les offres de ses annonces.
- Les justificatifs sont téléversés dans `private/` et ne sont consultables que dans l'administration.
- Les codes de vérification (envoyés par WhatsApp) sont hachés, valables 10 minutes et limités à 5 tentatives. La demande de code répond
  de la même façon que le numéro existe ou non, ce qui empêche d'énumérer les comptes.

## Autres règles

- Une annonce publiée ne peut plus être modifiée dès qu'elle a reçu une offre en attente.
- Un chauffeur doit être **vérifié** par l'administration pour proposer un tarif
  (`REQUIRE_VERIFIED_DRIVER_TO_OFFER`).
- Il ne peut pas proposer de tarif sur sa propre annonce, et n'a qu'une offre en attente par annonce.
- Une annonce expire le lendemain de la date de chargement (`periodic_tasks`).
- Les avis ne sont possibles qu'après livraison confirmée, à raison d'un avis par partie.

## Points connus à traiter après le MVP

- Annulation d'un transport : la cargaison passe à `cancelled` et le client doit republier. Une
  remise en ligne automatique de l'annonce serait plus confortable.
- Envoi des push de manière synchrone, en fin de transaction : prévoir une file de tâches
  (Celery/RQ) quand le volume augmentera.
- Pas de suivi GPS, ni de paiement intégré (hors périmètre du MVP).
