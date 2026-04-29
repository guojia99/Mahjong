"""
雀魂牌谱：通过本地 Node 脚本调用雀魂 WebSocket 协议获取牌谱详情。

环境变量可覆盖配置：MAJSOUL_ACCOUNT、MAJSOUL_PASSWORD、MAJSOUL_RATE_LIMIT_PER_MINUTE

--detail 与 majsoul_paipu_demo 行为一致：每条 action.data 为 protobuf toJSON() 原文。
"""
import json
import logging
import re
import subprocess
import time
from collections import deque
from datetime import datetime, timezone
from threading import Lock
from typing import Any

from django.conf import settings
from django.utils.translation import gettext_lazy as _

logger = logging.getLogger(__name__)

_rate_lock = Lock()
_rate_timestamps: deque[float] = deque()


def _wait_for_rate_limit():
    with _rate_lock:
        now = time.monotonic()
        limit = getattr(settings, 'MAJSOUL_RATE_LIMIT_PER_MINUTE', 20)
        window = 60.0
        while _rate_timestamps and _rate_timestamps[0] < now - window:
            _rate_timestamps.popleft()
        if len(_rate_timestamps) >= limit:
            sleep_time = _rate_timestamps[0] + window - now + 0.1
            if sleep_time > 0:
                time.sleep(sleep_time)
                now = time.monotonic()
                while _rate_timestamps and _rate_timestamps[0] < now - window:
                    _rate_timestamps.popleft()
        _rate_timestamps.append(now)


def normalize_paipu_input_url(raw: str) -> str:
    s = (raw or '').strip()
    if not s:
        return ''
    lower = s.lower()
    for needle in ('https://', 'http://'):
        idx = lower.find(needle)
        if idx != -1:
            tail = s[idx:].strip()
            parts = tail.split()
            token = parts[0] if parts else tail
            return token.rstrip('.,;；，。）)')
    return s


def extract_paipu_uuid(url: str) -> str | None:
    if not url:
        return None
    pattern = r'^[a-zA-Z0-9]{6}-[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$'
    if re.match(pattern, url):
        return url
    match = re.search(r'paipu=([a-zA-Z0-9\-_]+)', url)
    if match:
        return match.group(1).split('_')[0]
    return None


def _point_to_table_hundred(final_point) -> int:
    if final_point is None:
        return 0
    try:
        v = float(final_point)
    except (TypeError, ValueError):
        return 0
    return int(round(v / 100.0))


def _node_script_path() -> str:
    script_dir = getattr(settings, 'MAJSOUL_NODE_SCRIPT_DIR', None)
    if script_dir:
        return str(script_dir / 'paipu.js')
    return ''


def _get_credentials() -> tuple[str, str]:
    account = getattr(settings, 'MAJSOUL_ACCOUNT', '') or ''
    password = getattr(settings, 'MAJSOUL_PASSWORD', '') or ''
    return account, password


def _call_node_paipu(paipu_list: list[str], *, detail: bool = False) -> list[dict[str, Any]]:
    _wait_for_rate_limit()

    node_script = _node_script_path()
    if not node_script:
        raise RuntimeError(str(_('未配置 MAJSOUL_NODE_SCRIPT_DIR')))

    account, password = _get_credentials()
    if not account or not password:
        raise RuntimeError(str(_('未配置雀魂账号密码（MAJSOUL_ACCOUNT / MAJSOUL_PASSWORD）')))

    cmd = ['node', node_script]
    if detail:
        cmd.append('--detail')
    cmd.extend([
        json.dumps(paipu_list, ensure_ascii=False),
        account,
        password,
    ])

    script_dir = str(getattr(settings, 'MAJSOUL_NODE_SCRIPT_DIR', ''))
    result = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        timeout=120,
        cwd=script_dir,
    )

    if result.returncode != 0:
        stderr = result.stderr.strip()
        logger.error('Node paipu.js 执行失败 (exit=%d): %s', result.returncode, stderr)
        raise RuntimeError(str(_('牌谱获取失败: %(stderr)s') % {'stderr': stderr}))

    output = result.stdout.strip()
    if not output:
        raise RuntimeError(str(_('Node paipu.js 无输出')))

    try:
        data = json.loads(output)
    except json.JSONDecodeError:
        logger.error('Node 输出非 JSON: %s', output[:500])
        raise RuntimeError(str(_('牌谱获取返回了无效数据')))

    if isinstance(data, dict) and 'error' in data:
        raise RuntimeError(str(_('牌谱获取失败: %(error)s') % {'error': data['error']}))

    return data if isinstance(data, list) else []


def _detect_game_mode(uuid_val: str) -> str:
    if not uuid_val:
        return 'half_match'
    mode_map = {
        '1': 'half_match',
        '2': 'half_match',
        '3': 'east_wind',
        '4': 'east_wind',
        '5': 'east_wind',
        '6': 'half_match',
    }
    prefix = uuid_val.split('-')[0] if '-' in uuid_val else uuid_val[:1]
    return mode_map.get(prefix[:1], 'half_match')


def analyze_paipu_url(source_url: str) -> dict:
    url = normalize_paipu_input_url(source_url)
    if not url:
        raise ValueError(str(_('空链接或未识别到有效的 http(s) 牌谱链接')))
    paipu_uuid = extract_paipu_uuid(url) or url

    try:
        records = _call_node_paipu([url], detail=True)
    except Exception as e:
        logger.error('牌谱解析失败: %s', e, exc_info=True)
        raise RuntimeError(str(_('牌谱解析失败: %(e)s') % {'e': e})) from e

    if not records or len(records) == 0:
        raise RuntimeError(str(_('未返回牌谱数据，请检查链接是否有效')))

    rec = records[0]
    valid, val_errors = validate_paipu_detail_record(rec, paipu_uuid)
    if not valid:
        logger.warning('牌谱 detail 结构校验未通过: %s', val_errors)

    players = _normalize_players_from_record(rec)
    if not players:
        raise RuntimeError(str(_('未解析到有效玩家行')))

    n = len(players)
    if n not in (3, 4):
        logger.warning('非 3/4 人场，人数=%s', n)

    game_mode = _detect_game_mode(rec.get('uuid', ''))

    start_time_val = rec.get('start_time')
    end_time_val = rec.get('end_time')

    start_time_str = ''
    end_time_str = ''
    if start_time_val:
        start_time_str = _timestamp_to_str(start_time_val)
    if end_time_val:
        end_time_str = _timestamp_to_str(end_time_val)

    return {
        'uuid': str(rec.get('uuid', paipu_uuid))[:80],
        'start_time': start_time_str,
        'end_time': end_time_str,
        'game_mode': game_mode,
        'player_count': n,
        'players': players,
        'raw_data': {
            'source': 'majsoul_local_node',
            'detail': True,
            'url': url,
            'uuid': rec.get('uuid', ''),
            'start_time': start_time_val,
            'end_time': end_time_val,
            'players': rec.get('players', []),
            'result': rec.get('result'),
            'actions': rec.get('actions', []),
            'validation_ok': valid,
            'validation_errors': val_errors,
        },
    }


def _normalize_node_players(players_list: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """fetchGameRecordsDetail（summary）节点：players 含 finalPoint / final_point。"""
    out = []
    for seat, item in enumerate(players_list or []):
        if not isinstance(item, dict):
            continue
        uid = item.get('accountId') or item.get('account_id')
        if uid is None:
            continue
        name = (item.get('nickName') or item.get('nickname') or '') or ''
        final_point = item.get('finalPoint', item.get('final_point'))
        score = _point_to_table_hundred(final_point)
        try:
            uid = int(uid)
        except (TypeError, ValueError):
            continue
        out.append({
            'seat': seat,
            'uid': uid,
            'nickname': str(name)[:200],
            'score': score,
        })
    return out


def _normalize_node_players_from_detail(rec: dict[str, Any]) -> list[dict[str, Any]]:
    """fetchGameRecord --detail：players 与 result.players 分表，用 seat 关联 part_point_1。"""
    players = rec.get('players') or []
    r_players = (rec.get('result') or {}).get('players') or []
    seat_to_pr: dict[int, dict[str, Any]] = {}
    for p in r_players:
        if not isinstance(p, dict) or p.get('seat') is None:
            continue
        try:
            seat_to_pr[int(p['seat'])] = p
        except (TypeError, ValueError):
            continue
    out: list[dict[str, Any]] = []
    for item in players:
        if not isinstance(item, dict):
            continue
        uid = item.get('accountId') or item.get('account_id')
        if uid is None:
            continue
        try:
            seat = int(item.get('seat', 0))
        except (TypeError, ValueError):
            seat = 0
        name = (item.get('nickName') or item.get('nickname') or '') or ''
        pr = seat_to_pr.get(seat, {})
        final_point = pr.get('part_point_1')
        score = _point_to_table_hundred(final_point)
        try:
            uid = int(uid)
        except (TypeError, ValueError):
            continue
        out.append({
            'seat': seat,
            'uid': uid,
            'nickname': str(name)[:200],
            'score': score,
        })
    out.sort(key=lambda x: x['seat'])
    return out


def _normalize_players_from_record(rec: dict[str, Any]) -> list[dict[str, Any]]:
    players_list = rec.get('players') or []
    if not players_list:
        return []
    first = players_list[0]
    if isinstance(first, dict) and ('finalPoint' in first or 'final_point' in first):
        return _normalize_node_players(players_list)
    if isinstance(first, dict) and ('accountId' in first or 'account_id' in first):
        return _normalize_node_players_from_detail(rec)
    return _normalize_node_players(players_list)


def validate_paipu_detail_record(
    rec: dict[str, Any],
    expected_uuid: str | None = None,
) -> tuple[bool, list[str]]:
    """校验 Node --detail 单条对局 JSON 结构（与 demo/paipu_raw 一致）。"""
    errors: list[str] = []
    if not isinstance(rec, dict):
        return False, ['record_not_object']
    if rec.get('error'):
        return False, ['record_has_error_field']
    if expected_uuid:
        got = rec.get('uuid')
        if got and str(got) != str(expected_uuid):
            errors.append(f'uuid_mismatch expected={expected_uuid!r} got={got!r}')
    acts = rec.get('actions')
    if acts is None:
        errors.append('actions_missing')
    elif not isinstance(acts, list):
        errors.append('actions_not_list')
    elif len(acts) == 0:
        errors.append('actions_empty')
    else:
        for i, a in enumerate(acts):
            if not isinstance(a, dict):
                errors.append(f'action_{i}_not_object')
                continue
            if a.get('name') in (None, ''):
                errors.append(f'action_{i}_missing_name')
            if 'step' not in a:
                errors.append(f'action_{i}_missing_step')
            if 'data' not in a:
                errors.append(f'action_{i}_missing_data')
    pl = rec.get('players')
    if not pl or not isinstance(pl, list):
        errors.append('players_missing_or_invalid')
    return len(errors) == 0, errors


def build_majsoul_record_detail_blob(rec: dict[str, Any], *, validation_ok: bool, validation_errors: list[str]) -> dict[str, Any]:
    """写入 Game.paipu_data['majsoul_record_detail'] 的标准结构。"""
    return {
        'version': 1,
        'fetched_at': datetime.now(timezone.utc).isoformat(),
        'validation_ok': validation_ok,
        'validation_errors': list(validation_errors),
        'uuid': rec.get('uuid'),
        'start_time': rec.get('start_time'),
        'end_time': rec.get('end_time'),
        'players': rec.get('players'),
        'result': rec.get('result'),
        'actions': rec.get('actions'),
    }


def _timestamp_to_str(ts) -> str:
    if ts is None:
        return ''
    try:
        import time as _time
        ts_val = int(ts)
        local = _time.localtime(ts_val)
        return _time.strftime('%Y-%m-%d %H:%M', local)
    except (TypeError, ValueError, OSError):
        return ''


def _timestamp_to_naive_dt(ts) -> 'datetime | None':
    if ts is None:
        return None
    try:
        import time as _time
        from datetime import datetime
        ts_val = int(ts)
        local = _time.localtime(ts_val)
        return datetime(
            local.tm_year, local.tm_mon, local.tm_mday,
            local.tm_hour, local.tm_min, local.tm_sec,
        )
    except (TypeError, ValueError, OSError):
        return None


def fetch_paipu_records(urls: list[str], *, detail: bool = True) -> list[dict[str, Any]]:
    """批量获取牌谱记录（供解析、重试等使用）。

    默认 detail=True，与 majsoul_paipu_demo --detail 一致（含 actions 完整步进）。
    """
    valid_urls = [normalize_paipu_input_url(u) for u in urls if normalize_paipu_input_url(u)]
    if not valid_urls:
        return []
    return _call_node_paipu(valid_urls, detail=detail)
