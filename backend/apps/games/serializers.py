from rest_framework import serializers
from django.utils.translation import gettext_lazy as _
from .models import Room, RoomPlayer, Game, GamePlayer, HandRecord
from apps.players.serializers import PlayerListSerializer, PlayerBriefSerializer


class RoomPlayerSerializer(serializers.ModelSerializer):
    player = PlayerListSerializer(read_only=True)

    class Meta:
        model = RoomPlayer
        fields = ['id', 'player', 'joined_at']
        read_only_fields = ['id', 'joined_at']


class RoomListSerializer(serializers.ModelSerializer):
    player_count = serializers.SerializerMethodField()
    game_count = serializers.SerializerMethodField()
    earliest_game_time = serializers.DateTimeField(allow_null=True, read_only=True)
    latest_game_time = serializers.DateTimeField(allow_null=True, read_only=True)

    class Meta:
        model = Room
        fields = [
            'id', 'name', 'location', 'room_type', 'session_time', 'status', 'player_count', 'game_count',
            'created_at', 'closed_at', 'earliest_game_time', 'latest_game_time',
        ]

    def get_player_count(self, obj):
        return obj.room_players.count()

    def get_game_count(self, obj):
        return obj.games.count()


class RoomDetailSerializer(serializers.ModelSerializer):
    room_players = RoomPlayerSerializer(many=True, read_only=True)

    class Meta:
        model = Room
        fields = [
            'id', 'name', 'location', 'room_type', 'session_time', 'status',
            'room_players', 'created_at', 'closed_at',
        ]
        read_only_fields = ['id', 'created_at', 'closed_at']


class RoomCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Room
        fields = ['name', 'location', 'room_type', 'session_time']


class GamePlayerSerializer(serializers.ModelSerializer):
    player = PlayerListSerializer(read_only=True)
    player_id = serializers.UUIDField(write_only=True)

    class Meta:
        model = GamePlayer
        fields = ['id', 'player', 'player_id', 'seat_number', 'score', 'is_dealer_start']
        read_only_fields = ['id']


class GamePlayerScoreSerializer(serializers.Serializer):
    player_id = serializers.UUIDField()
    score = serializers.IntegerField()
    is_dealer_start = serializers.BooleanField(default=False)
    seat_number = serializers.IntegerField(required=False)


class HandRecordBriefSerializer(serializers.ModelSerializer):
    player = PlayerBriefSerializer(read_only=True)

    class Meta:
        model = HandRecord
        fields = ['id', 'player', 'record_type', 'yakuman_names']


class GameListSerializer(serializers.ModelSerializer):
    players = serializers.SerializerMethodField()
    is_scored = serializers.BooleanField(read_only=True)
    hand_records = serializers.SerializerMethodField()

    class Meta:
        model = Game
        fields = [
            'id', 'game_type', 'game_mode', 'player_count', 'start_time', 'end_time',
            'source_url', 'paipu_data', 'players', 'is_scored', 'created_at', 'hand_records',
        ]

    def get_players(self, obj):
        gps = obj.game_players.select_related('player').all()
        return [
            {
                'player': PlayerBriefSerializer(gp.player).data,
                'seat_number': gp.seat_number,
                'score': gp.score,
                'is_dealer_start': gp.is_dealer_start,
            }
            for gp in gps
        ]

    def get_hand_records(self, obj):
        records = obj.hand_records.select_related('player').all()
        return HandRecordBriefSerializer(records, many=True).data


class GameDetailSerializer(GameListSerializer):
    room = serializers.SerializerMethodField()

    class Meta(GameListSerializer.Meta):
        fields = GameListSerializer.Meta.fields + ['room', 'created_by']

    def get_room(self, obj):
        if obj.room:
            return {'id': obj.room.id, 'name': obj.room.name}
        return None


class GameCreateSerializer(serializers.ModelSerializer):
    player_ids = serializers.ListField(child=serializers.UUIDField(), write_only=True)

    class Meta:
        model = Game
        fields = ['game_type', 'game_mode', 'player_count', 'start_time', 'end_time', 'source_url', 'player_ids']


class GameUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Game
        fields = ['game_mode', 'player_count', 'start_time', 'end_time']

    def validate_start_time(self, value):
        from django.utils import timezone
        return value


class ScoreSubmitSerializer(serializers.Serializer):
    scores = GamePlayerScoreSerializer(many=True)

    def validate(self, attrs):
        scores = attrs['scores']
        player_ids = [s['player_id'] for s in scores]
        if len(player_ids) != len(set(player_ids)):
            raise serializers.ValidationError(_('存在重复的选手'))

        total = sum(s['score'] for s in scores)
        player_count = len(scores)
        if player_count == 4 and total != 1000:
            raise serializers.ValidationError(_('4人对局分数总和必须为1000，当前为%(total)s') % {'total': total})
        elif player_count == 3 and total != 1050:
            raise serializers.ValidationError(_('3人对局分数总和必须为1050，当前为%(total)s') % {'total': total})

        has_dealer = any(s.get('is_dealer_start', False) for s in scores)
        if not has_dealer:
            raise serializers.ValidationError(_('必须指定一名东起选手'))

        return attrs


class OnlineGameImportSerializer(serializers.Serializer):
    room_id = serializers.UUIDField()
    source_url = serializers.CharField(required=False, default='', allow_blank=True)
    player_data = serializers.ListField(
        child=serializers.DictField(),
    )
    game_mode = serializers.CharField(default='half_match')
    player_count = serializers.IntegerField(required=False)
    paipu_data = serializers.DictField(required=False, default=dict)
    start_time = serializers.DateTimeField(required=False, allow_null=True)
    end_time = serializers.DateTimeField(required=False, allow_null=True)
    allow_duplicate_url = serializers.BooleanField(required=False, default=False)


class OnlineGameParseSerializer(serializers.Serializer):
    url = serializers.CharField()


class HandRecordListSerializer(serializers.ModelSerializer):
    player = PlayerListSerializer(read_only=True)
    game_info = serializers.SerializerMethodField()

    class Meta:
        model = HandRecord
        fields = ['id', 'player', 'record_type', 'yakuman_names', 'hand_tiles', 'melds', 'winning_tile', 'win_type', 'created_at', 'game_info']

    def get_game_info(self, obj):
        game = obj.game
        room_name = None
        if game.room:
            room_name = game.room.name
        return {
            'game_id': str(game.id),
            'room_id': str(game.room_id) if game.room_id else None,
            'room_name': room_name,
            'game_mode': game.game_mode,
            'start_time': game.start_time.strftime('%Y-%m-%d %H:%M') if game.start_time else '',
        }


class HandRecordCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = HandRecord
        fields = ['player', 'record_type', 'yakuman_names', 'hand_tiles', 'melds', 'winning_tile', 'win_type']

    def validate_yakuman_names(self, value):
        if not value or not isinstance(value, list) or len(value) == 0:
            raise serializers.ValidationError(_('至少需要选择一个役种'))
        return value
