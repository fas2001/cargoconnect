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

- **Un seul compte par personne, avec un seul rôle choisi à l'inscription** : client (expéditeur) ou
  chauffeur. Un compte chauffeur est un compte qui a un `DriverProfile`, créé à l'inscription. Seuls
  les clients publient des annonces, et seuls les chauffeurs proposent des tarifs. L'application
  ouvre directement l'espace correspondant au rôle.
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
| delivered | completed | client (ou automatique après 48 h, seulement si le code de livraison a été saisi) |
| loaded / in_transit / delivered | disputed | les deux (motif obligatoire) |
| tout statut ouvert (y compris disputed) | completed · cancelled | équipe (`resolve_by_staff`, motif obligatoire) |

Chaque changement crée un `ShipmentEvent`, qui forme un historique immuable.

### Code de livraison

À l'acceptation, le transport reçoit un code à 6 chiffres que seul le client voit (il peut l'envoyer au
destinataire par WhatsApp depuis l'application). Le chauffeur le demande au destinataire et le saisit à la
livraison : 5 essais au plus, comptés même si la déclaration est refusée. Avec le bon code, la livraison
est confirmée automatiquement après 48 h sans réponse du client. Sans code, le client doit confirmer
lui-même ; s'il ne le fait pas, le transport apparaît dans « À traiter » pour l'équipe.

### Transports à traiter (`needing_attention`)

Litiges, transports encore « confirmés » le lendemain de la date de chargement, trajets de plus de
`SHIPMENT_STALE_TRANSIT_DAYS` jours (4 par défaut), et livraisons sans code non confirmées après 48 h.
Ils sont comptés dans le tableau de bord et filtrés par `GET /api/backoffice/shipments/?status=attention`.

## Garantie « une cargaison = un seul chauffeur »

`accept_offer` (`apps/offers/services.py`) repose sur trois niveaux de protection :

1. Une transaction avec `SELECT ... FOR UPDATE` sur la cargaison : les acceptations simultanées
   s'exécutent l'une après l'autre.
2. Une contrainte unique partielle en base : `UNIQUE(cargo) WHERE status = 'accepted'`.
3. `Shipment.cargo` et `Shipment.offer` en relation un-à-un (`OneToOne`).

Si deux acceptations arrivent en même temps, la seconde reçoit `409 cargo_already_assigned`.

L'acceptation envoie aussi le tarif affiché au client (`{"price": ...}`) : si le chauffeur l'a modifié
entre-temps, elle est refusée (`409 offer_changed`). Elle revérifie enfin le chauffeur (compte actif,
profil vérifié, justificatifs et camion valides), sinon `409 driver_unavailable`.

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
- Un code n'est envoyé qu'à un compte existant (et non vérifié, pour la vérification du numéro), au plus
  3 fois par heure et par numéro, à 60 s d'intervalle au moins (`OTP_MAX_PER_PHONE_PER_HOUR`,
  `OTP_RESEND_DELAY_SECONDS`), quelle que soit l'adresse IP : chaque message est facturé.
- **Suppression du compte** (`DELETE /api/me/`, mot de passe exigé) : nom, téléphone, e-mail, photo, pièces
  d'identité, justificatifs et notifications sont effacés ; le numéro redevient libre. Les transports
  terminés restent, anonymisés (« Compte supprimé »), car ils sont aussi l'historique de l'autre partie.
  Impossible tant qu'un transport est ouvert.

## Autres règles

- Une annonce publiée ne peut plus être modifiée dès qu'elle a reçu une offre en attente.
- Un chauffeur doit être **vérifié** par l'administration pour proposer un tarif
  (`REQUIRE_VERIFIED_DRIVER_TO_OFFER`). Le profil ne peut être vérifié qu'une fois chaque justificatif
  exigé validé. Remplacer un justificatif personnel (CIN, permis, selfie) renvoie un profil vérifié en
  vérification, et un justificatif personnel refusé ou expiré bloque les propositions.
- Chaque offre indique un camion : du type demandé dans l'annonce, d'une capacité suffisante pour le poids,
  et dont la carte grise et l'assurance sont vérifiées et à jour. Un camion ajouté après la vérification
  du profil reste donc inutilisable tant que ses justificatifs n'ont pas été contrôlés.
- Ces contrôles sont refaits à l'envoi, à la modification et à l'acceptation d'une offre.
- Il ne peut pas proposer de tarif sur sa propre annonce, et n'a qu'une offre en attente par annonce.
  Une offre refusée par le client l'empêche de proposer de nouveau sur cette annonce (un simple retrait, non).
- Les clients voient, pour chaque offre, le nombre de transports réalisés et le nombre de transports
  confirmés que le chauffeur a lui-même annulés.
- Toute annonce visible peut être signalée (sauf la sienne) ; la personne signalée est déduite par le serveur.
- Suspendre un compte (ou le supprimer) retire ses offres en attente, annule ses annonces ouvertes
  (les chauffeurs concernés sont prévenus) et déconnecte tous ses appareils. Ses transports en cours
  restent à suivre par l'équipe : leur nombre est renvoyé (`open_shipments`).
- Une annonce expire le lendemain de la date de chargement (`periodic_tasks`).
- Les avis ne sont possibles qu'après livraison confirmée, à raison d'un avis par partie.

## Points connus à traiter après le MVP

- Annulation d'un transport : la cargaison passe à `cancelled` et le client doit republier. Une
  remise en ligne automatique de l'annonce serait plus confortable.
- Envoi des push de manière synchrone, en fin de transaction : prévoir une file de tâches
  (Celery/RQ) quand le volume augmentera.
- Pas de suivi GPS, ni de paiement intégré (hors périmètre du MVP).
