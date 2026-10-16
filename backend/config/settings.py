"""
Paramètres Django de CargoConnect.

Toute la configuration sensible passe par des variables d'environnement
(voir `.env.example`). Les valeurs par défaut conviennent au développement local.
"""

import os
from datetime import timedelta
from pathlib import Path

import dj_database_url

BASE_DIR = Path(__file__).resolve().parent.parent


def _load_dotenv(path: Path) -> None:
    """Charge un fichier .env simple (CLE=valeur) sans écraser l'environnement existant."""
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip())


_load_dotenv(BASE_DIR / ".env")


def env_bool(name: str, default: bool) -> bool:
    value = os.environ.get(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def env_list(name: str, default: str = "") -> list[str]:
    return [item.strip() for item in os.environ.get(name, default).split(",") if item.strip()]


SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "dev-insecure-key-change-me-in-production-0123456789")
DEBUG = env_bool("DJANGO_DEBUG", True)
ALLOWED_HOSTS = env_list("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1,10.0.2.2,*" if DEBUG else "")

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    # Tiers
    "corsheaders",
    "rest_framework",
    "rest_framework_simplejwt.token_blacklist",
    "django_filters",
    "drf_spectacular",
    # Domaines métier
    "apps.accounts",
    "apps.drivers",
    "apps.vehicles",
    "apps.cargos",
    "apps.offers",
    "apps.shipments",
    "apps.notifications",
    "apps.reviews",
    "apps.reports",
    "apps.backoffice",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.locale.LocaleMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        # Gabarits du projet (ex. accueil de l'administration web) : prioritaires sur ceux des applications.
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"

# PostgreSQL en production via DATABASE_URL ; SQLite par défaut pour démarrer vite.
DATABASES = {
    "default": dj_database_url.config(
        default=f"sqlite:///{BASE_DIR / 'db.sqlite3'}",
        conn_max_age=600,
    )
}

AUTH_USER_MODEL = "accounts.User"

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator", "OPTIONS": {"min_length": 8}},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "fr"
LANGUAGES = [("fr", "Français"), ("ar", "العربية")]
TIME_ZONE = "Africa/Casablanca"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

# Fichiers téléversés. En production : stockage objet privé (S3 compatible)
# avec URLs signées. Les justificatifs chauffeurs ne sont jamais servis publiquement.
MEDIA_URL = "media/"
MEDIA_ROOT = Path(os.environ.get("MEDIA_ROOT", BASE_DIR / "media"))
# Justificatifs chauffeurs (CIN, permis...) : dossier séparé, jamais servi par une URL publique.
# Seuls les administrateurs autorisés les ouvrent, via une vue qui journalise chaque consultation.
PRIVATE_MEDIA_ROOT = Path(os.environ.get("PRIVATE_MEDIA_ROOT", BASE_DIR / "private_media"))
FILE_UPLOAD_MAX_MEMORY_SIZE = 5 * 1024 * 1024
DATA_UPLOAD_MAX_MEMORY_SIZE = 10 * 1024 * 1024

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": ["rest_framework_simplejwt.authentication.JWTAuthentication"],
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.IsAuthenticated"],
    "DEFAULT_FILTER_BACKENDS": ["django_filters.rest_framework.DjangoFilterBackend"],
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": 20,
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "DEFAULT_THROTTLE_CLASSES": [
        "rest_framework.throttling.AnonRateThrottle",
        "rest_framework.throttling.UserRateThrottle",
    ],
    "DEFAULT_THROTTLE_RATES": {
        "anon": os.environ.get("THROTTLE_ANON", "60/min"),
        "user": os.environ.get("THROTTLE_USER", "240/min"),
        "otp": os.environ.get("THROTTLE_OTP", "5/hour"),
    },
    "EXCEPTION_HANDLER": "apps.common.exceptions.api_exception_handler",
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=int(os.environ.get("JWT_ACCESS_MINUTES", "30"))),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=int(os.environ.get("JWT_REFRESH_DAYS", "30"))),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "UPDATE_LAST_LOGIN": True,
}

SPECTACULAR_SETTINGS = {
    "TITLE": "CargoConnect API",
    "DESCRIPTION": "API de mise en relation expéditeurs / transporteurs (MVP Maroc).",
    "VERSION": "0.1.0",
    "SERVE_INCLUDE_SCHEMA": False,
    "COMPONENT_SPLIT_REQUEST": True,
    "ENUM_NAME_OVERRIDES": {
        "CargoStatusEnum": "apps.cargos.models.CargoStatus",
        "OfferStatusEnum": "apps.offers.models.OfferStatus",
        "ShipmentStatusEnum": "apps.shipments.models.ShipmentStatus",
        "VerificationStatusEnum": "apps.drivers.models.VerificationStatus",
        "ReportStatusEnum": "apps.reports.models.Report.Status",
        "TruckTypeEnum": "apps.vehicles.models.TruckType",
    },
}

# CORS : utile uniquement pour la version web de l'app en développement (les apps natives n'en ont pas besoin).
CORS_ALLOWED_ORIGIN_REGEXES = [r"^http://(localhost|127\.0\.0\.1)(:\d+)?$"] if DEBUG else []
CORS_ALLOWED_ORIGINS = env_list("CORS_ALLOWED_ORIGINS")

# --- Règles métier configurables -------------------------------------------

CARGOCONNECT = {
    "CURRENCY": "MAD",
    # Un chauffeur doit être vérifié par l'administration avant de proposer un tarif.
    "REQUIRE_VERIFIED_DRIVER_TO_OFFER": env_bool("REQUIRE_VERIFIED_DRIVER_TO_OFFER", True),
    # Délai après lequel une livraison déclarée est confirmée automatiquement.
    "DELIVERY_AUTO_CONFIRM_HOURS": int(os.environ.get("DELIVERY_AUTO_CONFIRM_HOURS", "48")),
    # Au-delà de N jours entre chargement et livraison, le transport est signalé à l'équipe.
    "SHIPMENT_STALE_TRANSIT_DAYS": int(os.environ.get("SHIPMENT_STALE_TRANSIT_DAYS", "4")),
    # Une annonce expire N jours après la date de chargement souhaitée.
    "CARGO_EXPIRY_DAYS_AFTER_LOADING": int(os.environ.get("CARGO_EXPIRY_DAYS_AFTER_LOADING", "1")),
    "MAX_CARGO_PHOTOS": 5,
    # Codes de vérification (envoyés par WhatsApp en production)
    "OTP_LENGTH": 6,
    "OTP_TTL_MINUTES": 10,
    "OTP_MAX_ATTEMPTS": 5,
    "OTP_BACKEND": os.environ.get("OTP_BACKEND", "apps.accounts.otp_delivery.ConsoleBackend"),
    "WHATSAPP": {
        "ACCESS_TOKEN": os.environ.get("WHATSAPP_ACCESS_TOKEN", ""),
        "PHONE_NUMBER_ID": os.environ.get("WHATSAPP_PHONE_NUMBER_ID", ""),
        "TEMPLATE_NAME": os.environ.get("WHATSAPP_TEMPLATE_NAME", "cargoconnect_code"),
        "TEMPLATE_LANGUAGE": os.environ.get("WHATSAPP_TEMPLATE_LANGUAGE", "fr"),
        "API_VERSION": os.environ.get("WHATSAPP_API_VERSION", "v25.0"),
    },
    # Notifications push via le service Expo
    "EXPO_PUSH_ENABLED": env_bool("EXPO_PUSH_ENABLED", not DEBUG),
}

if not DEBUG:
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
    SECURE_SSL_REDIRECT = env_bool("DJANGO_SECURE_SSL_REDIRECT", True)
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    CSRF_TRUSTED_ORIGINS = env_list("DJANGO_CSRF_TRUSTED_ORIGINS")

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {"console": {"class": "logging.StreamHandler"}},
    "root": {"handlers": ["console"], "level": "INFO"},
}
