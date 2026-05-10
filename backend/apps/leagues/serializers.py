from django.urls import reverse
from rest_framework import serializers
from apps.players.serializers import PlayerListSerializer
from .models import (
    LeagueSeries, LeagueSeason, LeagueStage,
    LeagueSeasonPlayer, LeagueStagePlayer, LeagueMatch,
)


# ---------------------------------------------------------------------------
# Series
# ---------------------------------------------------------------------------

class LeagueSeriesSerializer(serializers.ModelSerializer):
    season_count = serializers.SerializerMethodField()
    current_season_name = serializers.SerializerMethodField()
    current_season_id = serializers.SerializerMethodField()
    logo_url = serializers.SerializerMethodField()

    class Meta:
        model = LeagueSeries
        fields = [
            'id', 'name', 'cover', 'logo_url', 'description',
            'season_count', 'current_season_name', 'current_season_id',
            'created_by', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'created_by']

    def get_logo_url(self, obj):
        if not getattr(obj, 'logo_asset_id', None):
            return None
        request = self.context.get('request')
        path = reverse('league-media', kwargs={'pk': str(obj.logo_asset_id)})
        if request:
            return request.build_absolute_uri(path)
        return path

    def get_season_count(self, obj) -> int:
        return obj.seasons.count()

    def get_current_season_name(self, obj):
        cur = obj.seasons.filter(is_current=True).first()
        return cur.name if cur else None

    def get_current_season_id(self, obj):
        cur = obj.seasons.filter(is_current=True).first()
        return str(cur.id) if cur else None


class LeagueSeriesWriteSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=100)
    description = serializers.CharField(required=False, allow_blank=True, default='')
    cover = serializers.ImageField(required=False, allow_null=True)


# ---------------------------------------------------------------------------
# Season
# ---------------------------------------------------------------------------

class LeagueSeasonListSerializer(serializers.ModelSerializer):
    series_name = serializers.CharField(source='series.name', read_only=True)
    player_count = serializers.SerializerMethodField()
    stage_count = serializers.SerializerMethodField()
    is_locked = serializers.BooleanField(read_only=True)

    class Meta:
        model = LeagueSeason
        fields = [
            'id', 'series', 'series_name', 'season_number', 'name',
            'cover', 'status', 'is_current', 'is_locked',
            'allow_online', 'allow_offline',
            'start_time', 'end_time',
            'player_count', 'stage_count',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'series', 'season_number', 'created_at', 'updated_at']

    def get_player_count(self, obj) -> int:
        return obj.season_players.count()

    def get_stage_count(self, obj) -> int:
        return obj.stages.count()


class LeagueSeasonWriteSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=150)
    description = serializers.CharField(required=False, allow_blank=True, default='')
    cover = serializers.ImageField(required=False, allow_null=True)
    is_current = serializers.BooleanField(required=False, default=False)
    allow_online = serializers.BooleanField(required=False, default=True)
    allow_offline = serializers.BooleanField(required=False, default=True)
    start_time = serializers.DateTimeField(required=False, allow_null=True)
    end_time = serializers.DateTimeField(required=False, allow_null=True)


class LeagueSeasonDetailSerializer(LeagueSeasonListSerializer):
    description = serializers.CharField(read_only=True)
    stages = serializers.SerializerMethodField()
    season_players = serializers.SerializerMethodField()

    class Meta(LeagueSeasonListSerializer.Meta):
        fields = LeagueSeasonListSerializer.Meta.fields + [
            'description', 'stages', 'season_players',
        ]

    def get_stages(self, obj):
        return LeagueStageSerializer(
            obj.stages.order_by('order'), many=True, context=self.context,
        ).data

    def get_season_players(self, obj):
        qs = obj.season_players.select_related('player').order_by('joined_at')
        return LeagueSeasonPlayerSerializer(qs, many=True).data


# ---------------------------------------------------------------------------
# Stage
# ---------------------------------------------------------------------------

class LeagueStageSerializer(serializers.ModelSerializer):
    player_count = serializers.SerializerMethodField()
    game_count = serializers.SerializerMethodField()
    has_groups = serializers.BooleanField(read_only=True)
    bypass_players = serializers.SerializerMethodField()

    class Meta:
        model = LeagueStage
        fields = [
            'id', 'season', 'name', 'stage_type', 'status', 'order',
            'games_per_player', 'uma_1st', 'uma_2nd', 'uma_3rd', 'uma_4th',
            'base_score', 'allow_companion', 'allow_free_table',
            'record_ranking', 'notes', 'has_groups',
            'promotion_rules',
            'player_count', 'game_count',
            'bypass_players',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'season', 'order', 'status', 'created_at', 'updated_at']

    def get_bypass_players(self, obj):
        from apps.players.serializers import PlayerListSerializer

        from .services import get_elimination_stage_bypass_players

        players = get_elimination_stage_bypass_players(obj)
        if not players:
            return []
        return PlayerListSerializer(players, many=True, context=self.context).data

    def get_player_count(self, obj) -> int:
        return obj.stage_players.count()

    def get_game_count(self, obj) -> int:
        return obj.matches.count()


class LeagueStageWriteSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=100)
    stage_type = serializers.ChoiceField(
        choices=[
            'swiss', 'elimination_1', 'elimination_2', 'elimination_3',
            'revival', 'semifinal', 'final',
        ],
    )
    games_per_player = serializers.IntegerField(default=8, min_value=1)
    uma_1st = serializers.FloatField(default=20)
    uma_2nd = serializers.FloatField(default=10)
    uma_3rd = serializers.FloatField(default=-10)
    uma_4th = serializers.FloatField(default=-20)
    base_score = serializers.FloatField(default=25000)
    allow_companion = serializers.BooleanField(default=False)
    allow_free_table = serializers.BooleanField(default=True)
    record_ranking = serializers.BooleanField(default=True)
    notes = serializers.CharField(required=False, allow_blank=True, default='')
    promotion_rules = serializers.JSONField(required=False, default=dict)


class LeagueStagePartialUpdateSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=100, required=False)
    stage_type = serializers.ChoiceField(
        choices=[
            'swiss', 'elimination_1', 'elimination_2', 'elimination_3',
            'revival', 'semifinal', 'final',
        ],
        required=False,
    )
    games_per_player = serializers.IntegerField(min_value=1, required=False)
    uma_1st = serializers.FloatField(required=False)
    uma_2nd = serializers.FloatField(required=False)
    uma_3rd = serializers.FloatField(required=False)
    uma_4th = serializers.FloatField(required=False)
    base_score = serializers.FloatField(required=False)
    allow_companion = serializers.BooleanField(required=False)
    allow_free_table = serializers.BooleanField(required=False)
    record_ranking = serializers.BooleanField(required=False)
    notes = serializers.CharField(allow_blank=True, required=False)
    promotion_rules = serializers.JSONField(required=False)


# ---------------------------------------------------------------------------
# Players
# ---------------------------------------------------------------------------

class LeagueSeasonPlayerSerializer(serializers.ModelSerializer):
    player = PlayerListSerializer(read_only=True)
    player_id = serializers.UUIDField(write_only=True, required=False)

    class Meta:
        model = LeagueSeasonPlayer
        fields = ['id', 'season', 'player', 'player_id', 'seed_label', 'joined_at']
        read_only_fields = ['id', 'joined_at', 'season']


class LeagueStagePlayerSerializer(serializers.ModelSerializer):
    player = PlayerListSerializer(read_only=True)
    is_full = serializers.BooleanField(read_only=True)
    games_per_player = serializers.IntegerField(source='stage.games_per_player', read_only=True)
    seed_label = serializers.SerializerMethodField()

    class Meta:
        model = LeagueStagePlayer
        fields = [
            'id', 'stage', 'player', 'group_type',
            'is_eliminated', 'is_promoted',
            'games_played', 'total_pt', 'rank_in_stage',
            'is_full', 'games_per_player', 'seed_label',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'stage', 'created_at', 'updated_at',
                            'games_played', 'total_pt', 'rank_in_stage']

    def get_seed_label(self, obj) -> str:
        sp = LeagueSeasonPlayer.objects.filter(
            season=obj.stage.season_id, player=obj.player_id,
        ).first()
        return sp.seed_label if sp else ''


# ---------------------------------------------------------------------------
# Match
# ---------------------------------------------------------------------------

class LeagueMatchSerializer(serializers.ModelSerializer):
    game_id = serializers.UUIDField(source='game.id', read_only=True, allow_null=True)
    game_start_time = serializers.DateTimeField(source='game.start_time', read_only=True, allow_null=True)
    players = serializers.SerializerMethodField()
    companions = serializers.SerializerMethodField()
    game_scores = serializers.SerializerMethodField()
    game_is_scored = serializers.SerializerMethodField()

    class Meta:
        model = LeagueMatch
        fields = [
            'id', 'stage', 'game', 'game_id', 'game_start_time',
            'match_label', 'round_index', 'table_index',
            'scheduled_players', 'companion_players',
            'players', 'companions',
            'game_scores', 'game_is_scored',
            'created_at',
        ]
        read_only_fields = ['id', 'created_at', 'players', 'companions',
                            'game_scores', 'game_is_scored']

    def _player_qs_by_ids(self, ids):
        from apps.players.models import Player
        if not ids:
            return Player.objects.none()
        return Player.objects.filter(id__in=ids)

    def get_players(self, obj):
        qs = self._player_qs_by_ids(obj.scheduled_players or [])
        return PlayerListSerializer(qs, many=True).data

    def get_companions(self, obj):
        qs = self._player_qs_by_ids(obj.companion_players or [])
        return PlayerListSerializer(qs, many=True).data

    def get_game_scores(self, obj):
        if not obj.game_id:
            return []
        gps = obj.game.game_players.select_related('player').all()
        return [
            {
                'player_id': str(gp.player_id),
                'nickname': gp.player.nickname,
                'seat_number': gp.seat_number,
                'score': gp.score,
            }
            for gp in gps
        ]

    def get_game_is_scored(self, obj) -> bool:
        return bool(obj.game and obj.game.is_scored)
