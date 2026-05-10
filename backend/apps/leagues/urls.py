from django.urls import path

from .views import (
    LeagueMediaView, LeagueSeriesLogoUploadView,
    LeagueSeriesListView, LeagueSeriesDetailView, LeagueSeriesSeasonsView,
    CurrentSeasonListView, LeagueSeasonListView,
    LeagueSeasonCreateView, LeagueSeasonDetailView,
    SeasonStartView, SeasonFinishView, SeasonReopenView,
    SeasonPlayersView, SeasonRegisterPlayerView, SeasonBatchRegisterView,
    LeagueStageListView, LeagueStageCreateView, LeagueStageStandardCreateView,
    LeagueStageReorderView, LeagueStageDetailView,
    StageStartView, StageFinishView,
    StageRankingView, StageRecalculateView, StagePromoteView,
    StagePlayersView, StagePlayersSyncView, StagePlayersManageView,
    StageMatchListView, StageMatchCreateView, StageMatchDetailView,
    StageGenerateSemifinalView,
    StageMatchOfflineCreateView, StageMatchOnlineImportView,
)


urlpatterns = [
    path('media/<uuid:pk>/', LeagueMediaView.as_view(), name='league-media'),
    # Series
    path('series/', LeagueSeriesListView.as_view(), name='league-series-list'),
    path('series/<uuid:pk>/logo/', LeagueSeriesLogoUploadView.as_view(), name='league-series-logo'),
    path('series/<uuid:pk>/', LeagueSeriesDetailView.as_view(), name='league-series-detail'),
    path('series/<uuid:pk>/seasons/', LeagueSeriesSeasonsView.as_view(), name='league-series-seasons'),
    path('series/<uuid:series_id>/seasons/new/', LeagueSeasonCreateView.as_view(), name='league-season-create'),

    # Season
    path('seasons/current/', CurrentSeasonListView.as_view(), name='league-season-current'),
    path('seasons/', LeagueSeasonListView.as_view(), name='league-season-list'),
    path('seasons/<uuid:pk>/', LeagueSeasonDetailView.as_view(), name='league-season-detail'),
    path('seasons/<uuid:pk>/start/', SeasonStartView.as_view(), name='league-season-start'),
    path('seasons/<uuid:pk>/finish/', SeasonFinishView.as_view(), name='league-season-finish'),
    path('seasons/<uuid:pk>/reopen/', SeasonReopenView.as_view(), name='league-season-reopen'),

    # Season players
    path('seasons/<uuid:pk>/players/', SeasonPlayersView.as_view(), name='league-season-players'),
    path('seasons/<uuid:pk>/register/', SeasonRegisterPlayerView.as_view(), name='league-season-register'),
    path('seasons/<uuid:pk>/batch-register/', SeasonBatchRegisterView.as_view(), name='league-season-batch-register'),

    # Stages
    path('seasons/<uuid:season_id>/stages/', LeagueStageListView.as_view(), name='league-stage-list'),
    path('seasons/<uuid:season_id>/stages/new/', LeagueStageCreateView.as_view(), name='league-stage-create'),
    path('seasons/<uuid:season_id>/stages/standard/', LeagueStageStandardCreateView.as_view(), name='league-stage-standard'),
    path('seasons/<uuid:season_id>/stages/reorder/', LeagueStageReorderView.as_view(), name='league-stage-reorder'),

    path('stages/<uuid:pk>/', LeagueStageDetailView.as_view(), name='league-stage-detail'),
    path('stages/<uuid:pk>/start/', StageStartView.as_view(), name='league-stage-start'),
    path('stages/<uuid:pk>/finish/', StageFinishView.as_view(), name='league-stage-finish'),
    path('stages/<uuid:pk>/ranking/', StageRankingView.as_view(), name='league-stage-ranking'),
    path('stages/<uuid:pk>/recalculate/', StageRecalculateView.as_view(), name='league-stage-recalculate'),
    path('stages/<uuid:pk>/promote/', StagePromoteView.as_view(), name='league-stage-promote'),

    # Stage players
    path('stages/<uuid:pk>/players/', StagePlayersView.as_view(), name='league-stage-players'),
    path('stages/<uuid:pk>/players/sync/', StagePlayersSyncView.as_view(), name='league-stage-players-sync'),
    path('stages/<uuid:pk>/players/manage/', StagePlayersManageView.as_view(), name='league-stage-players-manage'),

    # Stage matches
    path('stages/<uuid:pk>/matches/', StageMatchListView.as_view(), name='league-stage-matches'),
    path('stages/<uuid:pk>/matches/new/', StageMatchCreateView.as_view(), name='league-stage-match-create'),
    path('stages/<uuid:pk>/matches/offline/', StageMatchOfflineCreateView.as_view(), name='league-stage-match-offline'),
    path('stages/<uuid:pk>/matches/online/', StageMatchOnlineImportView.as_view(), name='league-stage-match-online'),
    path('stages/matches/<uuid:match_pk>/', StageMatchDetailView.as_view(), name='league-match-detail'),
    path('stages/<uuid:pk>/generate-semifinal/', StageGenerateSemifinalView.as_view(), name='league-stage-generate-semifinal'),
]
