from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from django.http import JsonResponse
from django.utils.translation import activate, get_language


def i18n_languages(request):
    activate(get_language())
    available = [
        {'code': code, 'name': str(name)}
        for code, name in settings.LANGUAGES
    ]
    return JsonResponse({'languages': available})


urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/v1/i18n/languages/', i18n_languages, name='i18n-languages'),
    path('api/v1/auth/', include('apps.users.urls')),
    path('api/v1/players/', include('apps.players.urls')),
    path('api/v1/rooms/', include('apps.games.urls')),
    path('api/v1/games/', include('apps.games.game_urls')),
    path('api/v1/ranking/', include('apps.ranking.urls')),
    path('api/v1/leagues/', include('apps.leagues.urls')),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
