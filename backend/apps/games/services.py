from django.utils import timezone
from common.exceptions import (
    BusinessException, ScoreValidationError,
    PlayerAlreadyInGame, GameAlreadyScored,
)


class RoomService:
    @staticmethod
    def create_room(user, **kwargs):
        from .models import Room
        return Room.objects.create(created_by=user, **kwargs)

    @staticmethod
    def close_room(room):
        if room.status == 'closed':
            raise BusinessException('房间已关闭')
        room.status = 'closed'
        room.closed_at = timezone.now()
        room.save()
        return room

    @staticmethod
    def add_player(room, player):
        from .models import RoomPlayer
        if room.room_players.filter(player=player).exists():
            raise BusinessException('该雀士已在房间中', code=409)
        if room.status == 'closed':
            raise BusinessException('房间已关闭，无法添加玩家')
        return RoomPlayer.objects.create(room=room, player=player)

    @staticmethod
    def remove_player(room, player):
        from .models import RoomPlayer
        try:
            rp = room.room_players.get(player=player)
            rp.delete()
        except room.room_players.model.DoesNotExist:
            raise BusinessException('该雀士不在房间中')

    @staticmethod
    def get_open_rooms():
        from .models import Room
        return Room.objects.filter(status='open').prefetch_related('room_players__player')


class GameService:
    @staticmethod
    def create_game(room, user, player_ids, **kwargs):
        from .models import Game, GamePlayer
        from apps.players.models import Player

        if room and room.status == 'closed':
            raise BusinessException('房间已关闭，无法创建对局')

        if 'player_count' not in kwargs:
            kwargs['player_count'] = len(player_ids)

        game = Game.objects.create(room=room, created_by=user, **kwargs)

        for i, player_id in enumerate(player_ids):
            try:
                player = Player.objects.get(pk=player_id)
            except Player.DoesNotExist:
                game.delete()
                raise BusinessException(f'雀士不存在: {player_id}')
            GamePlayer.objects.create(
                game=game, player=player, seat_number=i
            )

        return game

    @staticmethod
    def update_game(game, **kwargs):
        for key, value in kwargs.items():
            setattr(game, key, value)
        game.save()
        return game

    @staticmethod
    def update_game_players(game, player_ids):
        if game.is_scored:
            raise GameAlreadyScored('对局已录分，无法更换选手')
        from .models import GamePlayer
        from apps.players.models import Player

        game.game_players.all().delete()
        for i, player_id in enumerate(player_ids):
            try:
                player = Player.objects.get(pk=player_id)
            except Player.DoesNotExist:
                raise BusinessException(f'雀士不存在: {player_id}')
            GamePlayer.objects.create(
                game=game, player=player, seat_number=i
            )
        return game

    @staticmethod
    def submit_scores(game, scores_data):
        from .models import GamePlayer
        player_count = len(scores_data)
        total = sum(s['score'] for s in scores_data)

        if player_count == 4 and total != 1000:
            raise ScoreValidationError(f'4人对局分数总和必须为1000，当前为{total}')
        elif player_count == 3 and total != 1050:
            raise ScoreValidationError(f'3人对局分数总和必须为1050，当前为{total}')

        gps = []
        for score_data in scores_data:
            try:
                gp = game.game_players.get(player_id=score_data['player_id'])
                gp.score = score_data['score']
                gp.is_dealer_start = score_data.get('is_dealer_start', False)
                gp.seat_number = score_data.get('seat_number', gp.seat_number)
                gps.append(gp)
            except GamePlayer.DoesNotExist:
                raise BusinessException(f'选手不在对局中: {score_data["player_id"]}')

        from django.db import transaction
        with transaction.atomic():
            for gp in gps:
                gp.seat_number = -(gp.seat_number + 1)
                gp.save(update_fields=['seat_number'])
            for gp in gps:
                gp.seat_number = abs(gp.seat_number) - 1
                gp.save(update_fields=['seat_number', 'score', 'is_dealer_start'])

        try:
            from apps.ranking.services import settle_game_ranking
            settle_game_ranking(game)
        except Exception:
            pass

        return game

    @staticmethod
    def create_game_from_room(room, user, player_ids, **kwargs):
        return GameService.create_game(room, user, player_ids, **kwargs)

    @staticmethod
    def create_online_game(user, source_url, player_data, room, game_mode='half_match', player_count=None,
                           paipu_data=None, start_time=None):
        from .models import Game, GamePlayer, RoomPlayer
        from apps.players.models import Player
        from apps.players.services import PlayerService
        from datetime import datetime
        from django.db import transaction

        if player_count is None:
            player_count = len(player_data)

        if start_time is None:
            start_time = room.session_time or datetime.now()

        with transaction.atomic():
            game = Game.objects.create(
                room=room,
                game_type='online',
                game_mode=game_mode,
                player_count=player_count,
                start_time=start_time,
                source_url=source_url,
                paipu_data=paipu_data or {},
                created_by=user,
            )

            for i, pdata in enumerate(player_data):
                player_id = pdata.get('player_id')
                if not player_id:
                    continue
                try:
                    player = Player.objects.get(pk=player_id)
                except Player.DoesNotExist:
                    continue

                uid = pdata.get('uid')
                if uid is not None:
                    maj_nick = pdata.get('majsoul_nickname') or pdata.get('nickname') or ''
                    PlayerService.ensure_majsoul_uid_on_player(player, uid, maj_nick)

                GamePlayer.objects.create(
                    game=game, player=player, seat_number=i,
                    score=pdata.get('score'),
                    is_dealer_start=pdata.get('is_dealer_start', False),
                )

                if not room.room_players.filter(player=player).exists():
                    RoomPlayer.objects.create(room=room, player=player)

        try:
            from apps.ranking.services import settle_game_ranking
            settle_game_ranking(game)
        except Exception:
            pass

        return game


YAKUMAN_LIST = [
    '国士无双', '国士無双十三面待ち', '大四喜', '小四喜', '字一色',
    '緑一色', '清老頭', '四暗刻', '四暗刻単騎待ち', '四暗刻単騎',
    '天和', '地和', '人和', '九蓮宝燈', '純正九蓮宝燈',
    '大三元', '龍槍和', '四槓子', '十三幺九',
]


def validate_yakuman(yakuman_name):
    return yakuman_name in YAKUMAN_LIST


def calculate_pt(game):
    gps = list(game.game_players.filter(score__isnull=False).order_by('-score'))
    if not gps:
        return {}

    ranked = sorted(gps, key=lambda x: x.score, reverse=True)
    result = {}

    base_score = 250
    uma_map = [30, 10, -10, -30]
    if game.player_count == 3:
        base_score = 350
        uma_map = [30, 0, -30]

    for i, gp in enumerate(ranked):
        if i < len(uma_map):
            score_pt = (gp.score - base_score) / 10
            result[str(gp.player_id)] = round(score_pt + uma_map[i], 2)

    return result


def annotate_serialized_games_with_pt(games, data_list):
    """GameListSerializer 结果不含 pt；与全服对局列表一致为每条附带 calculate_pt 结果。"""
    game_list = list(games)
    for item in data_list:
        gid = item.get('id')
        game_obj = next((g for g in game_list if str(g.id) == str(gid)), None)
        if game_obj:
            item['pt'] = calculate_pt(game_obj)


def game_detail_with_pt(game):
    from .serializers import GameDetailSerializer

    data = GameDetailSerializer(game).data
    data['pt'] = calculate_pt(game)
    return data


class HandRecordService:
    @staticmethod
    def create_hand_record(game, **kwargs):
        from .models import HandRecord
        if not game.is_scored:
            raise BusinessException('对局未录分，无法添加牌谱')
        yakuman_names = kwargs.get('yakuman_names', [])
        for name in yakuman_names:
            if not validate_yakuman(name):
                raise BusinessException(f'无效的役种: {name}')
        return HandRecord.objects.create(game=game, **kwargs)

    @staticmethod
    def delete_hand_record(record):
        record.delete()

    @staticmethod
    def get_game_hand_records(game):
        from .models import HandRecord
        return game.hand_records.select_related('player').all()

    @staticmethod
    def get_recent_yakumans(limit=10, record_type=None):
        from .models import HandRecord
        qs = HandRecord.objects.all()
        if record_type:
            qs = qs.filter(record_type=record_type)
        return qs.select_related('player', 'game').order_by('-created_at')[:limit]

    @staticmethod
    def get_all_yakumans(record_type=None):
        from .models import HandRecord
        qs = HandRecord.objects.all()
        if record_type:
            qs = qs.filter(record_type=record_type)
        return qs.select_related('player', 'game').order_by('-created_at')

    @staticmethod
    def get_player_yakumans(player, record_type=None):
        from .models import HandRecord
        qs = HandRecord.objects.filter(player=player)
        if record_type:
            qs = qs.filter(record_type=record_type)
        return qs.select_related('game').order_by('-created_at')
