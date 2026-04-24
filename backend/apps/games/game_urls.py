from django.urls import path
from .views import (
    GameListView, GameDetailView, GameScoreView,
    GamePlayerUpdateView, GameShuffleSeatsView, OnlineGameImportView,
    OnlineGameParseView, OnlineGameParseBatchView, BindMajsoulAccountView, UnboundMajsoulAccountsView,
    HandRecordListView, HandRecordDetailView,
    PlayerStatsView, PtRankingView, FunRankingView,
    YakumanListView, RecentYakumanView, PlayerYakumanListView,
)

urlpatterns = [
    path('', GameListView.as_view(), name='game-list'),
    path('online/', OnlineGameImportView.as_view(), name='game-online-import'),
    path('online/parse/', OnlineGameParseView.as_view(), name='game-online-parse'),
    path('online/parse-batch/', OnlineGameParseBatchView.as_view(), name='game-online-parse-batch'),
    path('online/bind-account/', BindMajsoulAccountView.as_view(), name='game-online-bind-account'),
    path('online/unbound-accounts/', UnboundMajsoulAccountsView.as_view(), name='game-online-unbound-accounts'),
    path('pt-ranking/', PtRankingView.as_view(), name='game-pt-ranking'),
    path('fun-ranking/', FunRankingView.as_view(), name='game-fun-ranking'),
    path('yakumans/', YakumanListView.as_view(), name='yakuman-list'),
    path('yakumans/recent/', RecentYakumanView.as_view(), name='yakuman-recent'),
    path('<uuid:pk>/', GameDetailView.as_view(), name='game-detail'),
    path('<uuid:pk>/scores/', GameScoreView.as_view(), name='game-scores'),
    path('<uuid:pk>/players/', GamePlayerUpdateView.as_view(), name='game-players'),
    path('<uuid:pk>/shuffle-seats/', GameShuffleSeatsView.as_view(), name='game-shuffle-seats'),
    path('<uuid:pk>/hand-records/', HandRecordListView.as_view(), name='game-hand-records'),
    path('<uuid:pk>/hand-records/<uuid:record_pk>/', HandRecordDetailView.as_view(), name='game-hand-record-detail'),
]
