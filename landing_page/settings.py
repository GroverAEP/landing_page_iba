import os
from pathlib import Path
import cloudinary
import dj_database_url





# ============================================================
# CONFIGURACIÓN DE EMAIL (Gmail SMTP) usando .env — settings.py
# ============================================================
#
# INSTALACIÓN (una sola vez):
#   pip install python-decouple
#
# Luego crea, en la RAÍZ del proyecto (junto a manage.py), un archivo
# llamado ".env" (basándote en .env.example) con tus datos reales:
#
#   EMAIL_HOST_USER=tu_correo_real@gmail.com
#   EMAIL_HOST_PASSWORD=xxxxxxxxxxxxxxxx
#   DOMINIO_SITIO=http://127.0.0.1:8000
#
# Y agrega esta línea a tu archivo .gitignore para que NUNCA se suba a git:
#   .env

from decouple import config

EMAIL_BACKEND = 'django.core.mail.backends.smtp.EmailBackend'
EMAIL_HOST = 'smtp.gmail.com'
EMAIL_PORT = 587
EMAIL_USE_TLS = True
EMAIL_USE_SSL = False

EMAIL_HOST_USER = config('EMAIL_HOST_USER')
EMAIL_HOST_PASSWORD = config('EMAIL_HOST_PASSWORD')

DEFAULT_FROM_EMAIL = EMAIL_HOST_USER

DOMINIO_SITIO = config('DOMINIO_SITIO', default='http://127.0.0.1:8000')





# from dotenv import load_dotenv
# from urllib.parse import urlparse

# load_dotenv()
# # Replace the DATABASES section of your settings.py with this
# tmpPostgres = urlparse(os.getenv("DATABASE_URL"))


# con la siguiente configuracion puedo trabajar con los datos de la bd remota en mi loca,
# pero si cambiamos de bd remota a local trabajmos con ella exitosamente
BASE_DIR = Path(__file__).resolve().parent.parent
SECRET_KEY = os.environ.get('SECRET_KEY', default="asassasadasd")
DEFAULT_CHARSET = 'utf-8'
DEBUG = 'RENDER' not in os.environ
# DEBUG = False  # desactivarlo si estás en producción

ALLOWED_HOSTS = []
if os.environ.get('RENDER_EXTERNAL_HOSTNAME'):
    ALLOWED_HOSTS.append(os.environ['RENDER_EXTERNAL_HOSTNAME'])
    
# STATICFILES_DIRS se inicia siempre (lista vacía en produccion) 
# parar q no haiga archivos duplicados ya q collecstatic ya los crea autoamticamente 
STATICFILES_DIRS = []

# solo se ejecutarar el base dir si debug es true es decir que si esta en desarrollo
if DEBUG:
    STATICFILES_DIRS = [
        BASE_DIR / "products" / "static",
    ]

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "products",
    "administracion",
    "cloudinary",  # 👈 añadido para cloudinary
    "cloudinary_storage",  # 👈 añadido para cloudinary
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",  # 👈 añadido el whiteNoiseMideeleware
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "landing_page.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        'DIRS': [BASE_DIR / 'templates'],
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

WSGI_APPLICATION = "landing_page.wsgi.application"

# DATABASE CONEXION LOCAL
#DATABASES = {
#    "default": {
#        "ENGINE": "django.db.backends.sqlite3",
#        "NAME": BASE_DIR / "db.sqlite3",
#    }
#}

# DATABASE CONEXION A RENDER
# DATABASES = {
#     'default': dj_database_url.config(
#         default="postgresql://ibafex:4ngr02QYxXXylde8cq6fdsZU6VmRwisD@dpg-d057chi4d50c73ahcgs0-a.oregon-postgres.render.com/bd_ibafex",
#         conn_max_age=600,
#     )
# }


# DATABASE CONEXION A NEON - INFOPILLACA - ibafex1
# DATABASES = {
#     'default': {
#         'ENGINE': 'django.db.backends.postgresql',
#         'NAME': 'neondb',
#         'USER': 'neondb',
#         'PASSWORD': 'npg_cNKSIHpf9v1s',
#         'HOST': 'ep-super-hall-afw1uarg-pooler.c-2.us-west-2.aws.neon.tech',
#         'PORT': '5432',
#         'CONN_MAX_AGE': 600,
#         'OPTIONS': {
#             'sslmode': 'require',
#         },
#     }
# }


# DATABASE CONEXION A NEON - INFOPILLACA - ibafex2
DATABASES = {
     'default': {
         'ENGINE': 'django.db.backends.postgresql',
         'NAME': 'neondb',
         'USER': 'neondb_owner',
         'PASSWORD': 'npg_PbML6quVT7fo',
         'HOST': 'ep-summer-paper-afaep138-pooler.c-2.us-west-2.aws.neon.tech',
         'PORT': '5432',
        'CONN_MAX_AGE': 600,
         'OPTIONS': {
            'sslmode': 'require',
         },
     }
 }


# DATABASE CONEXION A SUPABASE - INFOPILLACA - ibafex
#DATABASES = {
#    "default": {
#        "ENGINE": "django.db.backends.postgresql",
#        "NAME": "postgres",
#        "USER": "postgres.grmryeseuwnlbodielqh",
#        "PASSWORD": "DNnw9BU32yvafY3c",
#        "HOST": "aws-1-us-west-2.pooler.supabase.com",
#        "PORT": "5432",
#        "CONN_MAX_AGE": 600,
#        "OPTIONS": {
#            "sslmode": "require",
#        },
#    }
#}


# DATABASE CONEXION A RAILWAY
# DATABASES = {
#     'default': {
#         'ENGINE': 'django.db.backends.postgresql',
#         'NAME': 'railway',  # nombre de la base de datos
#         'USER': 'postgres',  # usuario
#         'PASSWORD': 'BMUXzGhsYYtjHMyJUGLSfqbRFuOQTJyM',  # contraseña
#         'HOST': 'shuttle.proxy.rlwy.net',  # host
#         'PORT': '16472',  # puerto
#     }
# }


AUTH_PASSWORD_VALIDATORS = [
    {
        "NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.CommonPasswordValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.NumericPasswordValidator",
    },
]

LANGUAGE_CODE = "es"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

# Static files (CSS, JavaScript)
STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / 'staticfiles'

# Media files (IMÁGENES SUBIDAS POR EL USUARIO LOCALMENTE)
# MEDIA_URL = '/media/'
# MEDIA_ROOT = os.path.join(BASE_DIR, 'products/media')  # ❌ Ya no se usa, porque usas Cloudinary

# Configuración de Cloudinary IMAGENES SUBIDAS 
cloudinary.config(
    cloud_name='duv5jc1d0',  # Tu nombre de la nube de Cloudinary
    api_key='561134372158658',  # Tu API Key de Cloudinary
    api_secret='neo6ehkdBBVnaMC9lPZc-D-iPx8'  # Tu API Secret de Cloudinary
)

DEFAULT_FILE_STORAGE = 'cloudinary_storage.storage.MediaCloudinaryStorage'

# Producción en Render con whitenoise
if not DEBUG:
    STATICFILES_STORAGE = 'whitenoise.storage.CompressedManifestStaticFilesStorage'

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

