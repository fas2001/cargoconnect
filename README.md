# CargoConnect — MVP

Application mobile de mise en relation entre expéditeurs et transporteurs de poids lourds au Maroc.
Nom de travail, provisoire.

```
cargoconnect/
├── backend/          API Django REST + PostgreSQL
│   ├── config/       paramètres, routes
│   ├── apps/         un module par domaine métier
│   │   ├── accounts/       comptes, connexion par téléphone, codes WhatsApp
│   │   ├── drivers/        profil transporteur, justificatifs, vérification
│   │   ├── vehicles/       véhicules et types de camion
│   │   ├── cargos/         annonces, villes, catégories, photos
│   │   ├── offers/         propositions tarifaires et attribution
│   │   ├── shipments/      transports confirmés et historique des statuts
│   │   ├── notifications/  notifications in-app et push Expo
│   │   ├── reviews/        avis après livraison
│   │   └── reports/        signalements
│   └── tests/        tests pytest (règles métier et permissions)
├── mobile/           application Expo (React Native, TypeScript, Expo Router)
│   └── src/
│       ├── app/      écrans : (auth), (client), (driver), cargo/[id], shipment/[id]...
│       ├── components/  composants UI
│       ├── features/    logique par domaine (auth, cargos, profil)
│       ├── services/    client API, stockage sécurisé des jetons, upload
│       ├── i18n/        libellés français (l'arabe s'ajoutera ici)
│       └── types/       types alignés sur l'API
└── docs/
    ├── architecture.md  modèle de données, statuts, règles métier
    └── openapi.yaml     contrat de l'API (généré)
```

## Démarrer le backend

Prérequis : Python 3.12+.

```bash
cd backend
python -m venv .venv
.venv/Scripts/activate          # Windows (macOS/Linux : source .venv/bin/activate)
pip install -r requirements-dev.txt
python manage.py migrate
python manage.py seed_demo      # comptes et annonces de démonstration
python manage.py createsuperuser
python manage.py runserver 0.0.0.0:8000
```

- API : http://localhost:8000/api/
- Documentation Swagger : http://localhost:8000/api/docs/
- Administration : http://localhost:8000/admin/ (vérification des chauffeurs, signalements...)

Sans `DATABASE_URL`, le backend utilise SQLite. Pour PostgreSQL :

```bash
docker compose up -d db
cp backend/.env.example backend/.env   # DATABASE_URL déjà renseignée
```

En développement, les codes de vérification (téléphone, mot de passe oublié) s'affichent dans le
terminal de `runserver`. En production, ils sont envoyés par WhatsApp : voir [docs/whatsapp.md](docs/whatsapp.md).

Comptes de démonstration créés par `seed_demo` (développement uniquement) : voir
`backend/apps/accounts/management/commands/seed_demo.py`.

### Tests

```bash
cd backend
python -m pytest
```

Le test d'acceptations concurrentes (`test_concurrent_accepts_yield_a_single_shipment`) ne s'exécute
que sur PostgreSQL, car il a besoin de vrais verrous de ligne.

### Tâches périodiques

À planifier toutes les 15 minutes (cron, planificateur de l'hébergeur) :

```bash
python manage.py periodic_tasks
```

Cette commande fait expirer les annonces dépassées et confirme automatiquement les livraisons
déclarées sans réponse du client depuis 48 h.

## Démarrer l'application mobile

Prérequis : Node 20+ et l'application **Expo Go** sur le téléphone, ou un émulateur.

```bash
cd mobile
npm install
npx expo start
```

L'application détecte l'adresse de l'API automatiquement : même machine que Metro, ou `10.0.2.2` pour
l'émulateur Android. Pour la forcer, copiez `.env.example` en `.env` et renseignez `EXPO_PUBLIC_API_URL`.

Vérifications :

```bash
npm run typecheck
npx expo lint
```

## Avant le lancement pilote

- Configurer l'envoi des codes par WhatsApp (voir [docs/whatsapp.md](docs/whatsapp.md)) et un stockage objet privé
  pour les justificatifs (S3 compatible, URLs signées).
- Déclaration CNDP (loi 09-08), conditions d'utilisation et politique de confidentialité.
- Configurer EAS (build et distribution Android/iOS) et activer `EXPO_PUSH_ENABLED`.
- Ajouter les traductions arabes dans `mobile/src/i18n/`.
