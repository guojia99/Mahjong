import json
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

db_config_path = BASE_DIR / 'db_config.json'
with open(db_config_path) as f:
    db_config = json.load(f)

SECRET_KEY = 'django-insecure-mahjong-dev-key-change-in-production-x9$k2m!@#'

DEBUG = True

ALLOWED_HOSTS = ['*']

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'rest_framework',
    'rest_framework.authtoken',
    'corsheaders',
    'apps.users',
    'apps.players',
    'apps.games',
    'apps.ranking',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.locale.LocaleMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

LOCALE_PATHS = [
    BASE_DIR / 'locale',
]

ROOT_URLCONF = 'config.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'config.wsgi.application'

CACHES = {
    'default': {
        'BACKEND': 'django.core.cache.backends.locmem.LocMemCache',
        'LOCATION': 'fun_ranking',
        'TIMEOUT': 300,
    }
}

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': BASE_DIR / db_config['database']['sqlite_path'],
    }
}

AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

LANGUAGE_CODE = 'zh-hans'

LANGUAGES = [
    ('zh-hans', '简体中文'),
    ('zh-hant', '繁體中文'),
    ('en', 'English'),
    ('ja', '日本語'),
]

TIME_ZONE = 'Asia/Shanghai'

USE_I18N = True

USE_TZ = False

STATIC_URL = '/static/'

MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'rest_framework.authentication.SessionAuthentication',
        'rest_framework.authentication.TokenAuthentication',
    ],
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.IsAuthenticated',
    ],
    'DEFAULT_RENDERER_CLASSES': [
        'rest_framework.renderers.JSONRenderer',
    ],
    'DEFAULT_PARSER_CLASSES': [
        'rest_framework.parsers.JSONParser',
        'rest_framework.parsers.MultiPartParser',
        'rest_framework.parsers.FormParser',
    ],
    'EXCEPTION_HANDLER': 'config.exception_handler.custom_exception_handler',
    'DATETIME_FORMAT': '%Y-%m-%d %H:%M',
}

CORS_ALLOW_ALL_ORIGINS = True
CORS_ALLOW_CREDENTIALS = True

AUTH_USER_MODEL = 'users.User'

# 雀魂牌谱解析：本地 Node 脚本（通过 WebSocket 协议获取牌谱详情）
MAJSOUL_ACCOUNT = os.environ.get('MAJSOUL_ACCOUNT', db_config.get('majsoul_account', ''))
MAJSOUL_PASSWORD = os.environ.get('MAJSOUL_PASSWORD', db_config.get('majsoul_password', ''))
MAJSOUL_NODE_SCRIPT_DIR = BASE_DIR / 'majsoul_node'
MAJSOUL_RATE_LIMIT_PER_MINUTE = int(os.environ.get('MAJSOUL_RATE_LIMIT_PER_MINUTE', '20'))

# 后端处理日志：统一写入 /tmp/marjong.log（与 apps、services 等业务模块）
_MARJONG_LOG_PATH = '/tmp/marjong.log'
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'marjong': {
            'format': '[{levelname}] {asctime} {name} {message}',
            'style': '{',
            'datefmt': '%Y-%m-%d %H:%M:%S',
        },
    },
    'handlers': {
        'marjong_file': {
            'level': 'INFO',
            'class': 'logging.handlers.RotatingFileHandler',
            'filename': _MARJONG_LOG_PATH,
            'maxBytes': 20 * 1024 * 1024,
            'backupCount': 3,
            'formatter': 'marjong',
            'encoding': 'utf-8',
        },
    },
    'loggers': {
        'django': {
            'handlers': ['marjong_file'],
            'level': 'INFO',
            'propagate': False,
        },
        'django.request': {
            'handlers': ['marjong_file'],
            'level': 'WARNING',
            'propagate': False,
        },
    },
    'root': {
        'handlers': ['marjong_file'],
        'level': 'INFO',
    },
}
