from django.contrib import admin
from .models import UmaConfig, RankTier, PlayerRankingScore


@admin.register(UmaConfig)
class UmaConfigAdmin(admin.ModelAdmin):
    list_display = ['name', 'player_count', 'game_mode', 'uma_1st', 'uma_2nd', 'uma_3rd', 'uma_4th', 'base_score', 'is_active']
    list_filter = ['player_count', 'game_mode', 'is_active']


@admin.register(RankTier)
class RankTierAdmin(admin.ModelAdmin):
    list_display = ['name', 'level_order', 'initial_score', 'promotion_score', 'dajiang_score', 'fourth_penalty', 'is_protected', 'bg_color']
    list_editable = ['initial_score', 'promotion_score', 'dajiang_score', 'fourth_penalty', 'is_protected', 'bg_color']
    ordering = ['level_order']


@admin.register(PlayerRankingScore)
class PlayerRankingScoreAdmin(admin.ModelAdmin):
    list_display = ['player', 'tier', 'score', 'game_count', 'updated_at']
    list_filter = ['tier']
