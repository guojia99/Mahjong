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


def _json_bool_loose(val: Any) -> bool | None:
    """解析 protobuf/JSON 布尔；须避免 Python bool('false') is True。"""
    if val is None:
        return None
    if isinstance(val, bool):
        return val
    if isinstance(val, (int, float)):
        return bool(int(val))
    if isinstance(val, str):
        s = val.strip().lower()
        if s in ('true', '1', 'yes', 'on', 'y'):
            return True
        if s in ('false', '0', 'no', 'off', 'n', ''):
            return False
        return None
    return bool(val)


def _notile_player_is_tenpai(p: dict[str, Any]) -> bool | None:
    """
    RecordNoTile 的 NoTilePlayerInfo：True=听牌，False=未听，None=无法从该对象判定。
    无 seat 时由调用方按下标对应座位。听牌信息亦可来自非空的 tings。
    """
    for key in ('tingpai', 'tingPai', 'ting_pai'):
        tb = _json_bool_loose(p.get(key))
        if tb is not None:
            return tb
    tings = p.get('tings')
    if tings is None:
        tings = p.get('Tings')
    if isinstance(tings, list):
        return len(tings) > 0
    return None


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


def _hu_points(h: dict[str, Any]) -> int:
    def n(x: Any) -> int:
        try:
            v = float(x)
            return int(v) if v == v else 0
        except (TypeError, ValueError):
            return 0
    return n(h.get('point_rong')) or n(h.get('point_zimo')) or n(h.get('point_sum')) or n(h.get('dadian'))


def _empty_seat_row() -> dict[str, int | float]:
    return {
        'riichi': 0,
        'ron': 0,
        'tsumo': 0,
        'deal_in': 0,
        'furo_actions': 0,
        'furo_rounds': 0,
        'minkan_actions': 0,
        'ankan_actions': 0,
        'minkan_rounds': 0,
        'ankan_rounds': 0,
        'first_riichi_rounds': 0,
        'chase_riichi_decls': 0,
        'win_points_sum': 0,
        'wins': 0,
        'deal_points_sum': 0,
        'deal_in_events': 0,
        'riichi_hands': 0,
        'riichi_win_hands': 0,
        'riichi_deal_hands': 0,
        'riichi_noten_hands': 0,
        'riichi_pt_sum': 0,
    }


def aggregate_paipu_per_game_stats(actions: list[dict[str, Any]]) -> tuple[dict[int, dict[str, int | float]], int]:
    """
    单局牌谱：按座位累计；完结局数 hands。
    立直质量：仅统计宣言立直当小局（riichi_hands）；和了/铳/流听等在该小局结算时写入。
    """
    st: dict[int, dict[str, int | float]] = defaultdict(_empty_seat_row)
    hands = 0

    round_liqi = [False, False, False, False]
    round_furo = [False, False, False, False]
    round_minkan = [False, False, False, False]
    round_ankan = [False, False, False, False]

    def _reset_round_flags() -> None:
        nonlocal round_liqi, round_furo, round_minkan, round_ankan
        round_liqi = [False, False, False, False]
        round_furo = [False, False, False, False]
        round_minkan = [False, False, False, False]
        round_ankan = [False, False, False, False]

    def _flush_hand_end(data: dict[str, Any], kind: str) -> None:
        nonlocal hands
        hands += 1
        deltas = _read_float_array(data, 4)
        while len(deltas) < 4:
            deltas.append(0.0)

        payer_seat = -1
        if kind == 'hule':
            if len(deltas) >= 4:
                min_v = 0.0
                for i in range(4):
                    if deltas[i] < min_v:
                        min_v = deltas[i]
                        payer_seat = i

        hules = data.get('hules') if isinstance(data.get('hules'), list) else []
        winners: set[int] = set()
        any_ron = False
        for raw in hules:
            if not isinstance(raw, dict):
                continue
            try:
                si = int(raw.get('seat'))
            except (TypeError, ValueError):
                continue
            if si < 0 or si > 3:
                continue
            zimo = bool(raw.get('zimo'))
            pts = _hu_points(raw)
            row = st[si]
            row['win_points_sum'] = int(row['win_points_sum']) + pts
            row['wins'] = int(row['wins']) + 1
            winners.add(si)
            if zimo:
                row['tsumo'] = int(row['tsumo']) + 1
            else:
                row['ron'] = int(row['ron']) + 1
                any_ron = True
        if any_ron and payer_seat >= 0:
            loss = int(abs(deltas[payer_seat])) if payer_seat < len(deltas) else 0
            pr = st[payer_seat]
            pr['deal_in'] = int(pr['deal_in']) + 1
            pr['deal_in_events'] = int(pr['deal_in_events']) + 1
            pr['deal_points_sum'] = int(pr['deal_points_sum']) + max(loss, 0)

        tenpai: list[bool | None] = [None, None, None, None]
        if kind == 'notile':
            arr = data.get('players')
            if not isinstance(arr, list):
                arr = data.get('Players')
            if isinstance(arr, list):
                for i, p in enumerate(arr):
                    if not isinstance(p, dict):
                        continue
                    seat_raw = p.get('seat')
                    try:
                        seat = int(float(seat_raw)) if seat_raw is not None else i
                    except (TypeError, ValueError):
                        seat = i
                    if 0 <= seat <= 3:
                        tenpai[seat] = _notile_player_is_tenpai(p)

        for s in range(4):
            r = st[s]
            if round_liqi[s]:
                r['riichi_hands'] = int(r['riichi_hands']) + 1
                dv = int(deltas[s]) if s < len(deltas) else 0
                r['riichi_pt_sum'] = int(r['riichi_pt_sum']) + dv
                if s in winners:
                    r['riichi_win_hands'] = int(r['riichi_win_hands']) + 1
                if kind == 'hule' and any_ron and payer_seat == s:
                    r['riichi_deal_hands'] = int(r['riichi_deal_hands']) + 1
                if kind == 'notile' and tenpai[s] is False:
                    r['riichi_noten_hands'] = int(r['riichi_noten_hands']) + 1

        for s in range(4):
            r = st[s]
            if round_furo[s]:
                r['furo_rounds'] = int(r['furo_rounds']) + 1
            if round_minkan[s]:
                r['minkan_rounds'] = int(r['minkan_rounds']) + 1
            if round_ankan[s]:
                r['ankan_rounds'] = int(r['ankan_rounds']) + 1

        _reset_round_flags()

    for act in actions:
        name = str(act.get('name') or '')
        data = act.get('data')
        if not isinstance(data, dict):
            continue

        if name.endswith('RecordNewRound'):
            _reset_round_flags()
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
                any_before = any(round_liqi)
                st[si]['riichi'] = int(st[si]['riichi']) + 1
                if not any_before:
                    st[si]['first_riichi_rounds'] = int(st[si]['first_riichi_rounds']) + 1
                else:
                    st[si]['chase_riichi_decls'] = int(st[si]['chase_riichi_decls']) + 1
                round_liqi[si] = True
            continue

        if name.endswith('RecordChiPengGang'):
            try:
                si = int(data.get('seat'))
            except (TypeError, ValueError):
                continue
            if 0 <= si <= 3:
                st[si]['furo_actions'] = int(st[si]['furo_actions']) + 1
                round_furo[si] = True
                # type==2：雀魂侧同时用于大明杠（通常 tiles 四张）与加杠/追杠（常见单张）；
                # 二者均为鸣牌侧明杠子，与 RecordAnGangAddGang 的暗杠/摸杠区分。统计合并为「明杠」。
                t = data.get('type')
                if t == 2:
                    st[si]['minkan_actions'] = int(st[si]['minkan_actions']) + 1
                    round_minkan[si] = True
            continue

        if name.endswith('RecordAnGangAddGang'):
            try:
                si = int(data.get('seat'))
            except (TypeError, ValueError):
                continue
            if 0 <= si <= 3:
                st[si]['ankan_actions'] = int(st[si]['ankan_actions']) + 1
                round_ankan[si] = True
            continue

        if name.endswith('RecordHule'):
            _flush_hand_end(data, 'hule')
            continue

        if name.endswith('RecordLiuJu') or name.endswith('RecordNoTile'):
            _flush_hand_end(data, 'notile' if name.endswith('RecordNoTile') else 'liuju')
            continue

    return dict(st), hands


def PAIPU_RANK_BUCKET_KEYS() -> tuple[str, ...]:
    return (
        'games', 'rounds', 'riichi', 'deal_in', 'tsumo', 'ron',
        'furo_actions', 'furo_rounds', 'minkan_actions', 'ankan_actions', 'minkan_rounds', 'ankan_rounds',
        'first_riichi_rounds', 'chase_riichi_decls',
        'win_points_sum', 'wins', 'deal_points_sum', 'deal_in_events',
        'riichi_hands', 'riichi_win_hands', 'riichi_deal_hands', 'riichi_noten_hands', 'riichi_pt_sum',
    )


def fun_ranking_paipu_aggregates(
    games_qs,
    uid_to_player_id: dict[int, str],
) -> dict[str, dict[str, float | int]]:
    """
    遍历线上对局牌谱（调用方保证仅 online、已去重、含 actions）。
    以雀魂 accountId -> 绑定 Player 为准累计。
    """
    keys = PAIPU_RANK_BUCKET_KEYS()
    buckets: dict[str, dict[str, float | int]] = {}

    def _ensure(pid: str) -> dict[str, float | int]:
        if pid not in buckets:
            buckets[pid] = {k: 0 for k in keys}
        return buckets[pid]

    for game in games_qs:
        pd = game.paipu_data if isinstance(getattr(game, 'paipu_data', None), dict) else {}
        actions = _paipu_actions_from_game_data(pd)
        if not actions:
            continue
        players_l = _paipu_players_list(pd)
        seat_uid = _seat_uid_map(players_l)
        seat_stat, nhands = aggregate_paipu_per_game_stats(actions)
        if nhands <= 0:
            continue

        for seat, uid in seat_uid.items():
            pid = uid_to_player_id.get(uid)
            if not pid:
                continue
            row = seat_stat.get(seat) or _empty_seat_row()
            b = _ensure(pid)
            b['games'] = int(b['games']) + 1
            b['rounds'] = int(b['rounds']) + nhands
            for k in keys:
                if k == 'games':
                    continue
                if k == 'rounds':
                    continue
                b[k] = int(b[k]) + int(row.get(k, 0) or 0)

    return buckets


PAIPU_STATS_RANK_TYPES = frozenset({
    'avg_riichi', 'riichi_rate', 'avg_deal_in', 'deal_in_rate', 'tsumo_rate', 'win_rate', 'avg_win_count',
    'avg_furo', 'furo_rate', 'avg_win_point', 'avg_deal_point',
    'first_riichi_rate', 'chase_riichi_rate',
    'total_minkan', 'avg_minkan', 'minkan_rate', 'total_ankan', 'avg_ankan', 'ankan_rate',
    'riichi_win_rate', 'riichi_deal_rate', 'riichi_noten_rate', 'avg_riichi_pt', 'riichi_quality',
    'riichi_composite',
})


def _riichi_composite_score(b: dict[str, float | int]) -> float | None:
    """
    立直质量综合分（0～100）：立直小局内五维加权。
    和了率 24%、（1−铳率）24%、（1−流听率）19%、场均素点归一 19%、净胜指数归一 14%。
    素点/小局 ∈ [−3000,+3000] 线性映射到 [0,1]；净胜 (−1,+1) 映射到 [0,1]。
    """
    rh = int(b['riichi_hands'])
    if rh <= 0:
        return None
    rw = int(b['riichi_win_hands'])
    rdh = int(b['riichi_deal_hands'])
    rn = int(b['riichi_noten_hands'])
    rpt = int(b['riichi_pt_sum'])
    pt_per = float(rpt) / float(rh)
    pt_n = max(0.0, min(1.0, (pt_per + 3000.0) / 6000.0))
    net_n = max(0.0, min(1.0, ((float(rw - rdh) / float(rh)) + 1.0) * 0.5))
    s = (
        0.24 * (float(rw) / float(rh))
        + 0.24 * (1.0 - float(rdh) / float(rh))
        + 0.19 * (1.0 - float(rn) / float(rh))
        + 0.19 * pt_n
        + 0.14 * net_n
    )
    return round(100.0 * s, 2)


def paipu_stats_build_rank_items(
    buckets: dict[str, dict[str, float | int]],
    rank_type: str,
    min_games: int,
) -> tuple[list[dict[str, Any]], bool]:
    """
    Returns (items with player_id, rate, count, total), reverse_sort
    """
    items: list[dict[str, Any]] = []
    reverse = True

    for pid, b in buckets.items():
        gcount = int(b['games'])
        if gcount < min_games:
            continue
        rounds = int(b['rounds'])
        riichi = int(b['riichi'])
        deal_in = int(b['deal_in'])
        tsumo = int(b['tsumo'])
        ron = int(b['ron'])
        wins = tsumo + ron

        row: dict[str, Any] | None = None

        if rank_type == 'avg_riichi':
            row = {'player_id': pid, 'rate': round(riichi / gcount, 3), 'count': riichi, 'total': gcount}
        elif rank_type == 'riichi_rate':
            row = {'player_id': pid, 'rate': round(riichi / rounds * 100, 2), 'count': riichi, 'total': rounds}
        elif rank_type == 'avg_deal_in':
            row = {'player_id': pid, 'rate': round(deal_in / gcount, 3), 'count': deal_in, 'total': gcount}
        elif rank_type == 'deal_in_rate':
            row = {'player_id': pid, 'rate': round(deal_in / rounds * 100, 2), 'count': deal_in, 'total': rounds}
        elif rank_type == 'tsumo_rate':
            if wins <= 0:
                continue
            row = {'player_id': pid, 'rate': round(tsumo / wins * 100, 2), 'count': tsumo, 'total': wins}
        elif rank_type == 'win_rate':
            row = {'player_id': pid, 'rate': round(wins / rounds * 100, 2), 'count': wins, 'total': rounds}
        elif rank_type == 'avg_win_count':
            wn = int(b['wins'])
            row = {'player_id': pid, 'rate': round(wn / gcount, 3), 'count': wn, 'total': gcount}
        elif rank_type == 'avg_furo':
            fa = int(b['furo_actions'])
            row = {'player_id': pid, 'rate': round(fa / gcount, 3), 'count': fa, 'total': gcount}
        elif rank_type == 'furo_rate':
            fr = int(b['furo_rounds'])
            row = {'player_id': pid, 'rate': round(fr / rounds * 100, 2), 'count': fr, 'total': rounds}
        elif rank_type == 'avg_win_point':
            wsum = int(b['win_points_sum'])
            wn = int(b['wins'])
            if wn <= 0:
                continue
            row = {'player_id': pid, 'rate': round(wsum / wn, 1), 'count': wsum, 'total': wn}
        elif rank_type == 'avg_deal_point':
            dsum = int(b['deal_points_sum'])
            dev = int(b['deal_in_events'])
            if dev <= 0:
                continue
            row = {'player_id': pid, 'rate': round(dsum / dev, 1), 'count': dsum, 'total': dev}
        elif rank_type == 'first_riichi_rate':
            fir = int(b['first_riichi_rounds'])
            row = {'player_id': pid, 'rate': round(fir / rounds * 100, 2), 'count': fir, 'total': rounds}
        elif rank_type == 'chase_riichi_rate':
            ch = int(b['chase_riichi_decls'])
            if riichi <= 0:
                continue
            row = {'player_id': pid, 'rate': round(ch / riichi * 100, 2), 'count': ch, 'total': riichi}
        elif rank_type == 'total_minkan':
            ga = int(b['minkan_actions'])
            row = {'player_id': pid, 'rate': float(ga), 'count': ga, 'total': gcount}
        elif rank_type == 'avg_minkan':
            ga = int(b['minkan_actions'])
            row = {'player_id': pid, 'rate': round(ga / gcount, 3), 'count': ga, 'total': gcount}
        elif rank_type == 'minkan_rate':
            kr = int(b['minkan_rounds'])
            row = {'player_id': pid, 'rate': round(kr / rounds * 100, 2), 'count': kr, 'total': rounds}
        elif rank_type == 'total_ankan':
            ga = int(b['ankan_actions'])
            row = {'player_id': pid, 'rate': float(ga), 'count': ga, 'total': gcount}
        elif rank_type == 'avg_ankan':
            ga = int(b['ankan_actions'])
            row = {'player_id': pid, 'rate': round(ga / gcount, 3), 'count': ga, 'total': gcount}
        elif rank_type == 'ankan_rate':
            kr = int(b['ankan_rounds'])
            row = {'player_id': pid, 'rate': round(kr / rounds * 100, 2), 'count': kr, 'total': rounds}
        elif rank_type == 'riichi_win_rate':
            rh = int(b['riichi_hands'])
            if rh <= 0:
                continue
            rw = int(b['riichi_win_hands'])
            row = {'player_id': pid, 'rate': round(rw / rh * 100, 2), 'count': rw, 'total': rh}
        elif rank_type == 'riichi_deal_rate':
            rh = int(b['riichi_hands'])
            if rh <= 0:
                continue
            rdh = int(b['riichi_deal_hands'])
            row = {'player_id': pid, 'rate': round(rdh / rh * 100, 2), 'count': rdh, 'total': rh}
        elif rank_type == 'riichi_noten_rate':
            rh = int(b['riichi_hands'])
            if rh <= 0:
                continue
            rn = int(b['riichi_noten_hands'])
            row = {'player_id': pid, 'rate': round(rn / rh * 100, 2), 'count': rn, 'total': rh}
        elif rank_type == 'avg_riichi_pt':
            rh = int(b['riichi_hands'])
            if rh <= 0:
                continue
            rpt = int(b['riichi_pt_sum'])
            row = {'player_id': pid, 'rate': round(rpt / rh, 1), 'count': rpt, 'total': rh}
        elif rank_type == 'riichi_quality':
            rh = int(b['riichi_hands'])
            if rh <= 0:
                continue
            rw = int(b['riichi_win_hands'])
            rdh = int(b['riichi_deal_hands'])
            row = {
                'player_id': pid,
                'rate': round((rw - rdh) / rh * 100, 2),
                'count': rw - rdh,
                'total': rh,
            }
        elif rank_type == 'riichi_composite':
            sc = _riichi_composite_score(b)
            if sc is None:
                continue
            rh = int(b['riichi_hands'])
            rw = int(b['riichi_win_hands'])
            row = {'player_id': pid, 'rate': float(sc), 'count': rw, 'total': rh}
        else:
            continue

        if row:
            items.append(row)

    if rank_type == 'riichi_noten_rate':
        reverse = False
    else:
        reverse = True

    items.sort(key=lambda x: x['rate'], reverse=reverse)
    return items, reverse


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
