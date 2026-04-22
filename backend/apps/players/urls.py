from django.urls import path
from apps.games.views import PlayerStatsView, PlayerYakumanListView
from .views import (
    PlayerListView, PlayerDetailView, PlayerAvatarBatchView,
    PlayerMajsoulAccountListView, MajsoulAccountDetailView,
    PlayerGamesView,
)

urlpatterns = [
    path('batch-avatars/', PlayerAvatarBatchView.as_view(), name='player-batch-avatars'),
    path('', PlayerListView.as_view(), name='player-list'),
    path('<uuid:pk>/', PlayerDetailView.as_view(), name='player-detail'),
    path('<uuid:pk>/games/', PlayerGamesView.as_view(), name='player-games'),
    path('<uuid:pk>/stats/', PlayerStatsView.as_view(), name='player-stats'),
    path('<uuid:pk>/yakumans/', PlayerYakumanListView.as_view(), name='player-yakumans'),
    path('<uuid:pk>/majsoul-accounts/', PlayerMajsoulAccountListView.as_view(), name='player-majsoul-accounts'),
    path('majsoul-accounts/<uuid:account_pk>/', MajsoulAccountDetailView.as_view(), name='majsoul-account-detail'),
]
