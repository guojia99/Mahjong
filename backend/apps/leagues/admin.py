from django.contrib import admin

from .models import (
    LeagueSeries, LeagueSeason, LeagueStage,
    LeagueSeasonPlayer, LeagueStagePlayer, LeagueMatch,
)


@admin.register(LeagueSeries)
class LeagueSeriesAdmin(admin.ModelAdmin):
    list_display = ['name', 'created_by', 'created_at']
    search_fields = ['name']


@admin.register(LeagueSeason)
class LeagueSeasonAdmin(admin.ModelAdmin):
    list_display = [
        'name', 'series', 'season_number', 'status',
        'is_current', 'allow_online', 'allow_offline', 'created_at',
    ]
    list_filter = ['status', 'is_current']
    search_fields = ['name', 'series__name']
    list_editable = ['is_current', 'status']


@admin.register(LeagueStage)
class LeagueStageAdmin(admin.ModelAdmin):
    list_display = [
        'season', 'order', 'name', 'stage_type', 'status',
        'games_per_player', 'allow_companion',
    ]
    list_filter = ['stage_type', 'status']
    ordering = ['season', 'order']


@admin.register(LeagueSeasonPlayer)
class LeagueSeasonPlayerAdmin(admin.ModelAdmin):
    list_display = ['season', 'player', 'seed_label', 'joined_at']
    list_filter = ['season']


@admin.register(LeagueStagePlayer)
class LeagueStagePlayerAdmin(admin.ModelAdmin):
    list_display = [
        'stage', 'player', 'group_type',
        'is_eliminated', 'is_promoted',
        'games_played', 'total_pt', 'rank_in_stage',
    ]
    list_filter = ['stage', 'group_type', 'is_eliminated', 'is_promoted']


@admin.register(LeagueMatch)
class LeagueMatchAdmin(admin.ModelAdmin):
    list_display = [
        'stage', 'round_index', 'table_index',
        'match_label', 'game', 'created_at',
    ]
    list_filter = ['stage']
