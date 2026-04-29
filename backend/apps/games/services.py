from __future__ import annotations

from collections import defaultdict
from typing import Any

from django.utils import timezone
from django.utils.translation import gettext_lazy as _
from common.exceptions import (
    BusinessException, ScoreValidationError,
    PlayerAlreadyInGame, GameAlreadyScored,
)


def _paipu_actions_from_game_data(paipu_data: dict[str, Any] | None) -> list[dict[str, Any]]:
    if not isinstance(paipu_data, dict) or not paipu_data:
        return []
    actions = paipu_data.get('actions')
    if isinstance(actions, list) and actions:
        return [a for a in actions if isinstance(a, dict)]
    nested = paipu_data.get('majsoul_record_detail')
    if isinstance(nested, dict):
        actions = nested.get('actions')
        if isinstance(actions, list) and actions:
            return [a for a in actions if isinstance(a, dict)]
    return []


def _paipu_players_list(paipu_data: dict[str, Any] | None) -> list[dict[str, Any]]:
    if not isinstance(paipu_data, dict):
        return []
    nested = paipu_data.get('majsoul_record_detail')
    if isinstance(nested, dict):
        pl = nested.get('players')
        if isinstance(pl, list):
            return [p for p in pl if isinstance(p, dict)]
    pl = paipu_data.get('players')
    if isinstance(pl, list):
        return [p for p in pl if isinstance(p, dict)]
    return []


def _paipu_uuid_for_dedupe(paipu_data: dict[str, Any] | None, source_url: str) -> str | None:
    if isinstance(paipu_data, dict):
        nested = paipu_data.get('majsoul_record_detail')
        if isinstance(nested, dict):
            u = nested.get('uuid')
            if u:
                return str(u)
        u = paipu_data.get('uuid')
        if u:
            return str(u)
    from services.majsoul import extract_paipu_uuid, normalize_paipu_input_url
    url = normalize_paipu_input_url(source_url or '')
    if url:
        return extract_paipu_uuid(url)
    return None


def _paipu_dedupe_key(game) -> tuple[str, str]:
    """同牌谱链接只统计一次；无 uuid 时退回规范化 URL 或对局 id。"""
    from services.majsoul import extract_paipu_uuid, normalize_paipu_input_url
    pd = getattr(game, 'paipu_data', None) or {}
    u = _paipu_uuid_for_dedupe(pd if isinstance(pd, dict) else None, getattr(game, 'source_url', '') or '')
    if u:
        return 'uuid', u
    url = normalize_paipu_input_url(getattr(game, 'source_url', '') or '')
    u2 = extract_paipu_uuid(url) if url else None
    if u2:
        return 'uuid', u2
    if url:
        return 'url', url
    return 'id', str(game.pk)


def _read_float_array(data: dict[str, Any], max_n: int = 4) -> list[float]:
    raw = data.get('delta_scores')
    if raw is None:
        raw = data.get('deltaScores')
    if not isinstance(raw, list):
        return []
    out: list[float] = []
    for x in raw[:max_n]:
        try:
            out.append(float(x))
        except (TypeError, ValueError):
            out.append(0.0)
    return out


def _seat_uid_map(players_list: list[dict[str, Any]]) -> dict[int, int]:
    m: dict[int, int] = {}
    for p in players_list:
        seat = p.get('seat')
        aid = p.get('accountId')
        if aid is None:
            aid = p.get('account_id')
        if seat is None or aid is None:
            continue
        try:
            m[int(seat)] = int(aid)
        except (TypeError, ValueError):
            continue
    return m


def aggregate_paipu_per_game_stats(actions: list[dict[str, Any]]) -> tuple[dict[int, dict[str, int]], int]:
    """
    单局牌谱：按座位统计立直次数、荣和、自摸、放铳次数；返回 (seat->counts, 完结局数)。
    counts: riichi, ron, tsumo, deal_in
    """
    seat_stat = defaultdict(lambda: {'riichi': 0, 'ron': 0, 'tsumo': 0, 'deal_in': 0})
    hands = 0

    for act in actions:
        name = str(act.get('name') or '')
        data = act.get('data')
        if not isinstance(data, dict):
            continue

        if name.endswith('RecordDiscardTile'):
            seat = data.get('seat')
            try:
                si = int(seat)
            except (TypeError, ValueError):
                continue
            if si < 0 or si > 3:
                continue
            if data.get('is_liqi') or data.get('is_wliqi'):
                seat_stat[si]['riichi'] += 1

        elif name.endswith('RecordHule'):
            deltas = _read_float_array(data, 4)
            payer_seat = -1
            if len(deltas) >= 4:
                min_v = 0.0
                for i in range(4):
                    dv = deltas[i]
                    if dv < min_v:
                        min_v = dv
                        payer_seat = i

            hules = data.get('hules')
            any_ron = False
            if isinstance(hules, list):
                for raw in hules:
                    if not isinstance(raw, dict):
                        continue
                    seat = raw.get('seat')
                    try:
                        si = int(seat)
                    except (TypeError, ValueError):
                        continue
                    if si < 0 or si > 3:
                        continue
                    zimo = bool(raw.get('zimo'))
                    if zimo:
                        seat_stat[si]['tsumo'] += 1
                    else:
                        seat_stat[si]['ron'] += 1
                        any_ron = True
            if any_ron and payer_seat >= 0:
                seat_stat[payer_seat]['deal_in'] += 1
            hands += 1

        elif name.endswith('RecordLiuJu') or name.endswith('RecordNoTile'):
            hands += 1

    return dict(seat_stat), hands


def fun_ranking_paipu_aggregates(
    games_qs,
    uid_to_player_id: dict[int, str],
) -> dict[str, dict[str, float | int]]:
    """
    遍历线上对局牌谱（调用方保证仅 online、已去重、含 actions）。
    以雀魂 accountId -> 绑定 Player 为准累计。
    """
    buckets: dict[str, dict[str, float | int]] = {}

    def _ensure(pid: str) -> dict[str, float | int]:
        if pid not in buckets:
            buckets[pid] = {
                'games': 0,
                'rounds': 0,
                'riichi': 0,
                'deal_in': 0,
                'tsumo': 0,
                'ron': 0,
            }
        return buckets[pid]

    for game in games_qs:
        pd = game.paipu_data if isinstance(getattr(game, 'paipu_data', None), dict) else {}
        actions = _paipu_actions_from_game_data(pd)
        if not actions:
            continue
        players_l = _paipu_players_list(pd)
        seat_uid = _seat_uid_map(players_l)
        seat_stat, hands = aggregate_paipu_per_game_stats(actions)
        if hands <= 0:
            continue

        for seat, uid in seat_uid.items():
            pid = uid_to_player_id.get(uid)
            if not pid:
                continue
            st = seat_stat.get(seat)
            if not st:
                st = {'riichi': 0, 'ron': 0, 'tsumo': 0, 'deal_in': 0}
            b = _ensure(pid)
            b['games'] = int(b['games']) + 1
            b['rounds'] = int(b['rounds']) + hands
            b['riichi'] = int(b['riichi']) + int(st['riichi'])
            b['deal_in'] = int(b['deal_in']) + int(st['deal_in'])
            b['tsumo'] = int(b['tsumo']) + int(st['tsumo'])
            b['ron'] = int(b['ron']) + int(st['ron'])

    return buckets


class RoomService:
    @staticmethod
    def create_room(user, **kwargs):
        from .models import Room
        return Room.objects.create(created_by=user, **kwargs)

    @staticmethod
    def close_room(room):
        if room.status == 'closed':
            raise BusinessException(_('房间已关闭'))
        room.status = 'closed'
        room.closed_at = timezone.now()
        room.save()
        return room

    @staticmethod
    def add_player(room, player):
        from .models import RoomPlayer
        if room.room_players.filter(player=player).exists():
            raise BusinessException(_('该雀士已在房间中'), code=409)
        if room.status == 'closed':
            raise BusinessException(_('房间已关闭，无法添加玩家'))
        return RoomPlayer.objects.create(room=room, player=player)

    @staticmethod
    def remove_player(room, player):
        from .models import RoomPlayer
        try:
            rp = room.room_players.get(player=player)
            rp.delete()
        except room.room_players.model.DoesNotExist:
            raise BusinessException(_('该雀士不在房间中'))

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
            raise BusinessException(_('房间已关闭，无法创建对局'))

        if 'player_count' not in kwargs:
            kwargs['player_count'] = len(player_ids)

        game = Game.objects.create(room=room, created_by=user, **kwargs)

        for i, player_id in enumerate(player_ids):
            try:
                player = Player.objects.get(pk=player_id)
            except Player.DoesNotExist:
                game.delete()
                raise BusinessException(_('雀士不存在: %(player_id)s') % {'player_id': player_id})
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
            raise GameAlreadyScored(_('对局已录分，无法更换选手'))
        from .models import GamePlayer
        from apps.players.models import Player

        game.game_players.all().delete()
        for i, player_id in enumerate(player_ids):
            try:
                player = Player.objects.get(pk=player_id)
            except Player.DoesNotExist:
                raise BusinessException(_('雀士不存在: %(player_id)s') % {'player_id': player_id})
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
            raise ScoreValidationError(_('4人对局分数总和必须为1000，当前为%(total)s') % {'total': total})
        elif player_count == 3 and total != 1050:
            raise ScoreValidationError(_('3人对局分数总和必须为1050，当前为%(total)s') % {'total': total})

        gps = []
        for score_data in scores_data:
            try:
                gp = game.game_players.get(player_id=score_data['player_id'])
                gp.score = score_data['score']
                gp.is_dealer_start = score_data.get('is_dealer_start', False)
                gp.seat_number = score_data.get('seat_number', gp.seat_number)
                gps.append(gp)
            except GamePlayer.DoesNotExist:
                raise BusinessException(_('选手不在对局中: %(player_id)s') % {'player_id': score_data["player_id"]})

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
                           paipu_data=None, start_time=None, end_time=None):
        from .models import Game, GamePlayer, RoomPlayer
        from apps.players.models import Player
        from apps.players.services import PlayerService
        from datetime import datetime
        from django.db import transaction

        if player_count is None:
            player_count = len(player_data)

        if start_time is None:
            start_time = room.session_time or datetime.now()

        from services.majsoul import build_majsoul_record_detail_blob

        paipu_data = dict(paipu_data or {})
        if (
            paipu_data.get('detail')
            and paipu_data.get('actions') is not None
            and 'majsoul_record_detail' not in paipu_data
        ):
            paipu_data['majsoul_record_detail'] = build_majsoul_record_detail_blob(
                {
                    'uuid': paipu_data.get('uuid'),
                    'start_time': paipu_data.get('start_time'),
                    'end_time': paipu_data.get('end_time'),
                    'players': paipu_data.get('players'),
                    'result': paipu_data.get('result'),
                    'actions': paipu_data.get('actions'),
                },
                validation_ok=bool(paipu_data.get('validation_ok', True)),
                validation_errors=list(paipu_data.get('validation_errors') or []),
            )

        with transaction.atomic():
            game = Game.objects.create(
                room=room,
                game_type='online',
                game_mode=game_mode,
                player_count=player_count,
                start_time=start_time,
                end_time=end_time,
                source_url=source_url,
                paipu_data=paipu_data,
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
    """列表序列化本身不含 pt；此处为每条注入 calculate_pt。列表亦不含 paipu_data 全文，仅有 has_paipu_data / paipu_has_actions。"""
    game_list = list(games)
    for item in data_list:
        gid = item.get('id')
        game_obj = next((g for g in game_list if str(g.id) == str(gid)), None)
        if game_obj:
            item['pt'] = calculate_pt(game_obj)


def game_detail_with_pt(game):
    from .models import Game
    from .serializers import GameDetailSerializer

    game = (
        Game.objects.prefetch_related(
            'game_players__player__majsoul_accounts',
            'hand_records__player',
        )
        .select_related('room')
        .get(pk=game.pk)
    )
    data = GameDetailSerializer(game).data
    data['pt'] = calculate_pt(game)
    return data


class HandRecordService:
    @staticmethod
    def create_hand_record(game, **kwargs):
        from .models import HandRecord
        if not game.is_scored:
            raise BusinessException(_('对局未录分，无法添加牌谱'))
        yakuman_names = kwargs.get('yakuman_names', [])
        for name in yakuman_names:
            if not validate_yakuman(name):
                raise BusinessException(_('无效的役种: %(name)s') % {'name': name})
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
