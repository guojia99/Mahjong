"""
雀魂牌谱：通过外部 HTTP 接口解析，不再使用自研 WebSocket/Protobuf 逻辑。

环境变量可覆盖接口地址与超时：MAJSOUL_PAI_PU_API_URL、MAJSOUL_PAI_PU_API_TIMEOUT
"""
import json
import logging
import re
import urllib.error
import urllib.request
from typing import Any

from django.conf import settings

logger = logging.getLogger(__name__)


def normalize_paipu_input_url(raw: str) -> str:
    """
    从整段剪贴文本中截取牌谱 URL：去掉「雀魂牌谱 :」等 https 之前的前缀，只保留以 http:// 或 https:// 开头的一段。
    """
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
    """与线上规则一致：将接口中的 finalPoint 折成与系统一致的百分位整数（4 人合计 1000）。"""
    if final_point is None:
        return 0
    try:
        v = float(final_point)
    except (TypeError, ValueError):
        return 0
    return int(round(v / 100.0))


def _normalize_api_players(players_list: list[dict[str, Any]]) -> list[dict[str, Any]]:
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


def analyze_paipu_url(source_url: str) -> dict:
    """
    调用外部接口解析牌谱，返回与历史 OnlineGameParseView 结构兼容的字典。

    返回:
      uuid, start_time, game_mode, player_count, players, raw_data(含 code/msg 与 data)
    """
    url = normalize_paipu_input_url(source_url)
    if not url:
        raise ValueError('空链接或未识别到有效的 http(s) 牌谱链接')
    paipu_uuid = extract_paipu_uuid(url) or url

    api = getattr(
        settings,
        'MAJSOUL_PAI_PU_API_URL',
        'http://manage.followyourheart.cn/backend/api/majsoul/paipu/analysis',
    )
    timeout = getattr(settings, 'MAJSOUL_PAI_PU_API_TIMEOUT', 90)

    payload = json.dumps({'paipuList': [url]}).encode('utf-8')
    http_req = urllib.request.Request(
        api,
        data=payload,
        method='POST',
        headers={
            'Content-Type': 'application/json; charset=utf-8',
            'Accept': 'application/json',
        },
    )
    try:
        with urllib.request.urlopen(http_req, timeout=timeout) as http_resp:
            status = http_resp.getcode() or 200
            raw = http_resp.read().decode('utf-8')
    except urllib.error.HTTPError as e:
        status = e.code
        try:
            raw = e.read().decode('utf-8')
        except OSError:
            raw = e.reason or ''
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        logger.error('牌谱分析接口网络错误: %s', e, exc_info=True)
        raise RuntimeError(f'牌谱分析服务不可用: {e}') from e

    try:
        body = json.loads(raw) if raw else {}
    except (ValueError, TypeError):
        logger.error('牌谱分析接口非 JSON, status=%s, text=%.500s', status, raw)
        raise RuntimeError('牌谱分析服务返回了无效数据') from None
    if not isinstance(body, dict):
        logger.error('牌谱分析接口 JSON 非对象, status=%s, text=%.500s', status, raw)
        raise RuntimeError('牌谱分析服务返回了无效数据') from None

    if status >= 400:
        err = (body or {}).get('msg') or (body or {}).get('message') or raw
        raise RuntimeError(f'牌谱分析服务错误 ({status}): {err}')

    try:
        c = int((body or {}).get('code', 0) or 0)
    except (TypeError, ValueError):
        c = -1
    if c != 0:
        raise RuntimeError((body or {}).get('msg') or '牌谱分析失败')

    data = body.get('data')
    if not data or not isinstance(data, (list, tuple)) or not data[0]:
        raise RuntimeError('未返回牌谱玩家数据，请检查链接或稍后重试')

    first = data[0]
    if not isinstance(first, (list, tuple)):
        first = [first] if first else []
    first = [x for x in first if isinstance(x, dict)]

    players = _normalize_api_players(first)
    if not players:
        raise RuntimeError('未解析到有效玩家行')

    n = len(players)
    if n not in (3, 4):
        logger.warning('非 3/4 人场，人数=%s', n)

    return {
        'uuid': str(paipu_uuid)[:80],
        'start_time': '',
        'game_mode': 'half_match',
        'player_count': n,
        'players': players,
        'raw_data': {
            'source': 'majsoul_paipu_api',
            'url': url,
            'code': body.get('code'),
            'msg': body.get('msg'),
            'data': body.get('data'),
        },
    }
