from rest_framework import serializers
from django.utils.translation import gettext_lazy as _
from .models import Player, MahjongSoulAccount


class MahjongSoulAccountSerializer(serializers.ModelSerializer):
    class Meta:
        model = MahjongSoulAccount
        fields = ['id', 'uid', 'nickname', 'player', 'created_at']
        read_only_fields = ['id', 'created_at']


class PlayerBriefSerializer(serializers.ModelSerializer):
    class Meta:
        model = Player
        fields = ['id', 'nickname']


class PlayerListSerializer(serializers.ModelSerializer):
    majsoul_uids = serializers.SerializerMethodField()
    ranking_tier = serializers.SerializerMethodField()
    ranking_score = serializers.SerializerMethodField()
    total_game_count = serializers.SerializerMethodField()
    last_game_time = serializers.SerializerMethodField()

    class Meta:
        model = Player
        fields = [
            'id', 'nickname', 'real_name', 'avatar', 'majsoul_uids',
            'ranking_tier', 'ranking_score', 'total_game_count', 'last_game_time',
            'created_at',
        ]

    def get_majsoul_uids(self, obj):
        return list(obj.majsoul_accounts.values_list('uid', flat=True))

    def get_ranking_tier(self, obj):
        from apps.ranking.models import PlayerRankingScore
        from apps.ranking.serializers import RankTierSerializer
        try:
            prs = obj.ranking_scores.select_related('tier').get()
            if prs.tier:
                return RankTierSerializer(prs.tier).data
        except PlayerRankingScore.DoesNotExist:
            pass
        return None

    def get_ranking_score(self, obj):
        from apps.ranking.models import PlayerRankingScore
        try:
            prs = obj.ranking_scores.only('score').get()
            return prs.score
        except PlayerRankingScore.DoesNotExist:
            return None

    def get_total_game_count(self, obj):
        from apps.games.models import GamePlayer
        return GamePlayer.objects.filter(
            player=obj, score__isnull=False
        ).count()

    def get_last_game_time(self, obj):
        from apps.games.models import GamePlayer, Game
        latest_gp = GamePlayer.objects.filter(
            player=obj, score__isnull=False
        ).select_related('game').order_by('-game__start_time').first()
        if latest_gp and latest_gp.game and latest_gp.game.start_time:
            return latest_gp.game.start_time.strftime('%Y-%m-%d')
        return None


class PlayerDetailSerializer(serializers.ModelSerializer):
    majsoul_accounts = MahjongSoulAccountSerializer(many=True, read_only=True)

    class Meta:
        model = Player
        fields = [
            'id', 'nickname', 'real_name', 'avatar',
            'extra_info', 'majsoul_accounts', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class PlayerCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Player
        fields = ['nickname', 'real_name', 'avatar', 'extra_info']

    def create(self, validated_data):
        validated_data['created_by'] = self.context['request'].user
        return super().create(validated_data)


class PlayerUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Player
        fields = ['nickname', 'real_name', 'avatar', 'extra_info']


class MahjongSoulAccountCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = MahjongSoulAccount
        fields = ['uid', 'nickname']

    def validate_uid(self, value):
        if MahjongSoulAccount.objects.filter(uid=value).exists():
            raise serializers.ValidationError(_('该UID已绑定其他雀士'))
        return value
