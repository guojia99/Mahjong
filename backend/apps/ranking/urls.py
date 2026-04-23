from django.urls import path
from .views import (
    UmaConfigListView, UmaConfigDetailView,
    RankTierListView, RankTierDetailView,
    RecalculateRankingView,
    RankingLeaderboardView,
    PlayerRankingView,
    GameRankingSettleView,
    PlayerGameRankingResultsView,
)

urlpatterns = [
    path('uma-configs/', UmaConfigListView.as_view(), name='uma-config-list'),
    path('uma-configs/<uuid:pk>/', UmaConfigDetailView.as_view(), name='uma-config-detail'),
    path('tiers/', RankTierListView.as_view(), name='rank-tier-list'),
    path('tiers/<uuid:pk>/', RankTierDetailView.as_view(), name='rank-tier-detail'),
    path('recalculate/', RecalculateRankingView.as_view(), name='ranking-recalculate'),
    path('leaderboard/', RankingLeaderboardView.as_view(), name='ranking-leaderboard'),
    path('player/<uuid:pk>/', PlayerRankingView.as_view(), name='player-ranking'),
    path('player/<uuid:pk>/game-results/', PlayerGameRankingResultsView.as_view(), name='player-game-ranking-results'),
    path('game/<uuid:pk>/settle/', GameRankingSettleView.as_view(), name='game-ranking-settle'),
]
