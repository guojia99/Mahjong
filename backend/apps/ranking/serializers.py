from rest_framework import serializers
from .models import UmaConfig, RankTier, PlayerRankingScore, GameRankingResult
from apps.players.serializers import PlayerListSerializer


class UmaConfigSerializer(serializers.ModelSerializer):
    class Meta:
        model = UmaConfig
        fields = '__all__'
        read_only_fields = ['id', 'created_at', 'updated_at']


class RankTierSerializer(serializers.ModelSerializer):
    class Meta:
        model = RankTier
        fields = '__all__'
        read_only_fields = ['id', 'created_at', 'updated_at']


class PlayerRankingScoreSerializer(serializers.ModelSerializer):
    player = PlayerListSerializer(read_only=True)
    tier = RankTierSerializer(read_only=True)

    class Meta:
        model = PlayerRankingScore
        fields = ['id', 'player', 'tier', 'score', 'game_count', 'updated_at']


class GameRankingResultSerializer(serializers.ModelSerializer):
    class Meta:
        model = GameRankingResult
        fields = ['game', 'player', 'rank', 'delta', 'old_tier_name', 'new_tier_name', 'old_score', 'new_score']


class RankingCalcResultSerializer(serializers.Serializer):
    player_id = serializers.UUIDField()
    rank = serializers.IntegerField()
    delta = serializers.FloatField()
    basic_pt = serializers.FloatField()
    uma = serializers.FloatField()
    dajiang = serializers.FloatField()
    fourth_penalty = serializers.FloatField()
    extra_dajiang = serializers.FloatField()
    old_tier = serializers.CharField()
    new_tier = serializers.CharField()
    old_score = serializers.FloatField()
    new_score = serializers.FloatField()
