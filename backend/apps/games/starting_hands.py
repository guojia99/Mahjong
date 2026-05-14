"""
起手牌评分（v2.2.2）。

从雀魂线上对局的 `paipu_data.actions` 内每个 `.lq.RecordNewRound` 提取每个座位的起手 13 张牌，
按面子 / 搭子 / 对子 / 役牌 / 赤宝牌 / 本局宝牌 / 起手向听数等综合评分。

输入字段 / 评分要点：
  - 顺子 / 刻子 / 对子（数值牌通过最大化形状评分 DP；字牌按格率独立计）
  - 搭子分良型（45/56）/ 普通（23/34/67/78）/ 边张（12/89）/ 嵌张（13/24/35…）
  - 字牌单张不加分；字牌对子 / 刻子在役牌（场风、自风、三元）时加分更高
  - 赤宝牌与表宝牌合并为「当量」按枚累计计分；三张同宝牌额外加分；邻张规则不变
  - 起手向听数：综合形 / 七对子 / 国士 三类的最小向听，向听越小 (8-shanten)*4 越高
  - 役种潜质（细分浮点权重，使分数自然精确到 1 位小数）：
      • 断幺九（无字牌时按数牌 2–8 张数档）/ 七对子 / 一气通贯 / 三色同顺 / 三色同刻
      • 三暗刻 / 对々和 / 清一色 / 混一色 / 一杯口 / 大三元
      • 纯全带幺九 / 混全带幺九 / 混老头
"""

from __future__ import annotations

from functools import lru_cache
from typing import Any


# ------------------------------------------------------------
# 牌字符串 <-> 标准索引（0..33；0m/0p/0s 映射到 5m/5p/5s 并单独计赤宝牌）
# ------------------------------------------------------------

def _tile_index(tile: str) -> int:
    if not isinstance(tile, str) or len(tile) < 2:
        return -1
    rank_ch = tile[0]
    suit = tile[1]
    if not rank_ch.isdigit():
        return -1
    r = int(rank_ch)
    if suit == 'm':
        base = 0
    elif suit == 'p':
        base = 9
    elif suit == 's':
        base = 18
    elif suit == 'z':
        if r < 1 or r > 7:
            return -1
        return 27 + (r - 1)
    else:
        return -1
    if r == 0:
        r = 5
    if r < 1 or r > 9:
        return -1
    return base + (r - 1)


def _is_red_five(tile: str) -> bool:
    return isinstance(tile, str) and len(tile) == 2 and tile[0] == '0' and tile[1] in ('m', 'p', 's')


def _dora_from_indicator(indicator: str) -> str | None:
    if not isinstance(indicator, str) or len(indicator) < 2:
        return None
    rank_ch = indicator[0]
    suit = indicator[1]
    if not rank_ch.isdigit():
        return None
    r = int(rank_ch)
    if suit in ('m', 'p', 's'):
        if r == 0:
            r = 5
        if r < 1 or r > 9:
            return None
        next_r = 1 if r == 9 else r + 1
        return f'{next_r}{suit}'
    if suit == 'z':
        if 1 <= r <= 4:
            next_r = 1 if r == 4 else r + 1
            return f'{next_r}z'
        if 5 <= r <= 7:
            next_r = 5 if r == 7 else r + 1
            return f'{next_r}z'
    return None


def _dora_equiv_ladder_total(n: int) -> float:
    """宝牌当量 n 枚：第 k 枚贡献 4+3×(k−1)（即 4、7、10、13…），累计。"""
    if n <= 0:
        return 0.0
    return n * (3 * n + 5) / 2.0


def _field_wind_tile(chang: int) -> str:
    """场风：0=东(1z) / 1=南(2z) / 2=西(3z)。"""
    if chang < 0 or chang > 2:
        return ''
    return f'{chang + 1}z'


def _seat_wind_tile(seat: int, dealer_seat: int, player_count: int) -> str:
    """自风：相对亲家位移 mod 人数；四麻 0/1/2/3 → 东/南/西/北；三麻 0/1/2 → 东/南/西。"""
    if player_count <= 0:
        return ''
    rel = (seat - dealer_seat) % player_count
    if rel < 0 or rel > 3:
        return ''
    return f'{rel + 1}z'


# ------------------------------------------------------------
# 形状评分 DP（数值牌按 suit 独立分解；字牌按格率独立计）
# ------------------------------------------------------------

@lru_cache(maxsize=200_000)
def _suit_shape_dp(counts: tuple[int, ...]) -> int:
    """返回一个数值花色（9 个格）的最大形状评分（不含字牌、不含宝牌加成）。"""
    if not counts or sum(counts) == 0:
        return 0
    i = 0
    while i < 9 and counts[i] == 0:
        i += 1
    if i == 9:
        return 0

    cc = list(counts)
    best = 0

    # 跳过当前张（视为孤张，0 分）
    cc[i] -= 1
    s = _suit_shape_dp(tuple(cc))
    if s > best:
        best = s
    cc[i] += 1

    # 刻子
    if counts[i] >= 3:
        cc[i] -= 3
        s = 12 + _suit_shape_dp(tuple(cc))
        if s > best:
            best = s
        cc[i] += 3

    # 顺子 i,i+1,i+2（边张 123/789 低于中张顺子）
    if i <= 6 and counts[i + 1] > 0 and counts[i + 2] > 0:
        seq_pts = 9 if (i == 0 or i == 6) else 12
        cc[i] -= 1
        cc[i + 1] -= 1
        cc[i + 2] -= 1
        s = seq_pts + _suit_shape_dp(tuple(cc))
        if s > best:
            best = s
        cc[i] += 1
        cc[i + 1] += 1
        cc[i + 2] += 1

    # 对子
    if counts[i] >= 2:
        cc[i] -= 2
        s = 4 + _suit_shape_dp(tuple(cc))
        if s > best:
            best = s
        cc[i] += 2

    # 两面 / 边张搭子 i,i+1（若可与邻张组成完整顺子，则不作为「另一顺的搭子」计分）
    if i <= 7 and counts[i + 1] > 0:
        can_left_run = i >= 1 and counts[i - 1] > 0
        can_right_run = i <= 6 and counts[i + 2] > 0
        if not can_left_run and not can_right_run:
            cc[i] -= 1
            cc[i + 1] -= 1
            if i == 0 or i == 7:
                bonus = 2  # 12 / 89 边张
            elif i in (3, 4):
                bonus = 5  # 45 / 56 良型两面
            else:
                bonus = 4  # 23 / 34 / 67 / 78 普通两面
            s = bonus + _suit_shape_dp(tuple(cc))
            if s > best:
                best = s
            cc[i] += 1
            cc[i + 1] += 1

    # 嵌张 i,i+2（当中间张可成顺时，不计嵌张搭子分）
    if i <= 6 and counts[i + 2] > 0 and counts[i + 1] == 0:
        cc[i] -= 1
        cc[i + 2] -= 1
        s = 2 + _suit_shape_dp(tuple(cc))
        if s > best:
            best = s
        cc[i] += 1
        cc[i + 2] += 1

    return best


def _honor_shape_score(c34: tuple[int, ...], yakuhai_set: frozenset[int]) -> tuple[int, dict]:
    """字牌按格率统计：刻子（役牌+4）/对子（役牌+5）/单张 0。"""
    score = 0
    triplets = 0
    pairs = 0
    yk_pairs = 0
    yk_triplets = 0
    for r in range(27, 34):
        c = c34[r]
        is_yk = r in yakuhai_set
        if c >= 3:
            score += 14 if is_yk else 10
            triplets += 1
            if is_yk:
                yk_triplets += 1
        elif c == 2:
            score += 8 if is_yk else 3
            pairs += 1
            if is_yk:
                yk_pairs += 1
    return score, {
        'triplets': triplets,
        'pairs': pairs,
        'yakuhai_pairs': yk_pairs,
        'yakuhai_triplets': yk_triplets,
    }


# ------------------------------------------------------------
# 向听数（向听越小代表起手越接近听牌）
# ------------------------------------------------------------

@lru_cache(maxsize=200_000)
def _suit_options_numbered(counts: tuple[int, ...]) -> frozenset[tuple[int, int]]:
    """返回数值花色的所有 (完成面子数 M, 搭子/对子数 P) 可达组合。"""
    if not counts or sum(counts) == 0:
        return frozenset({(0, 0)})
    i = 0
    while i < 9 and counts[i] == 0:
        i += 1
    if i == 9:
        return frozenset({(0, 0)})

    cc = list(counts)
    results: set[tuple[int, int]] = set()

    cc[i] -= 1
    for m, p in _suit_options_numbered(tuple(cc)):
        results.add((m, p))
    cc[i] += 1

    if counts[i] >= 3:
        cc[i] -= 3
        for m, p in _suit_options_numbered(tuple(cc)):
            results.add((m + 1, p))
        cc[i] += 3

    if i <= 6 and counts[i + 1] > 0 and counts[i + 2] > 0:
        cc[i] -= 1
        cc[i + 1] -= 1
        cc[i + 2] -= 1
        for m, p in _suit_options_numbered(tuple(cc)):
            results.add((m + 1, p))
        cc[i] += 1
        cc[i + 1] += 1
        cc[i + 2] += 1

    if counts[i] >= 2:
        cc[i] -= 2
        for m, p in _suit_options_numbered(tuple(cc)):
            results.add((m, p + 1))
        cc[i] += 2

    if i <= 7 and counts[i + 1] > 0:
        cc[i] -= 1
        cc[i + 1] -= 1
        for m, p in _suit_options_numbered(tuple(cc)):
            results.add((m, p + 1))
        cc[i] += 1
        cc[i + 1] += 1

    if i <= 6 and counts[i + 2] > 0:
        cc[i] -= 1
        cc[i + 2] -= 1
        for m, p in _suit_options_numbered(tuple(cc)):
            results.add((m, p + 1))
        cc[i] += 1
        cc[i + 2] += 1

    return frozenset(results)


def _honor_options(counts: tuple[int, ...]) -> tuple[int, int]:
    """字牌每格独立：≥3 计 1 面子，==2 计 1 搭子。"""
    melds = 0
    partials = 0
    for c in counts:
        if c >= 3:
            melds += 1
        elif c == 2:
            partials += 1
    return melds, partials


def _shanten_general(c34: tuple[int, ...]) -> int:
    best = 8
    head_candidates: list[tuple[bool, tuple[int, ...]]] = [(False, c34)]
    for i in range(34):
        if c34[i] >= 2:
            cc = list(c34)
            cc[i] -= 2
            head_candidates.append((True, tuple(cc)))

    for has_pair, hand in head_candidates:
        m_opts = _suit_options_numbered(hand[0:9])
        p_opts = _suit_options_numbered(hand[9:18])
        s_opts = _suit_options_numbered(hand[18:27])
        zm, zp = _honor_options(hand[27:34])

        max_score = 0
        for (mm, mp) in m_opts:
            for (pm, pp) in p_opts:
                for (sm, sp) in s_opts:
                    M = mm + pm + sm + zm
                    P = mp + pp + sp + zp
                    if M > 4:
                        M = 4
                    cap = max(0, 4 - M)
                    used_p = min(P, cap)
                    score = 2 * M + used_p
                    if score > max_score:
                        max_score = score
        sh = 8 - max_score - (1 if has_pair else 0)
        if sh < best:
            best = sh
    return best


def _shanten_7pairs(c34: tuple[int, ...]) -> int:
    pairs = sum(1 for x in c34 if x >= 2)
    kinds = sum(1 for x in c34 if x >= 1)
    if pairs > 7:
        pairs = 7
    return 6 - pairs + max(0, 7 - kinds)


YAOCHU_INDICES: tuple[int, ...] = (0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33)


def _shanten_kokushi(c34: tuple[int, ...]) -> int:
    kinds = sum(1 for i in YAOCHU_INDICES if c34[i] >= 1)
    has_pair = any(c34[i] >= 2 for i in YAOCHU_INDICES)
    return 13 - kinds - (1 if has_pair else 0)


def compute_shanten(c34: tuple[int, ...]) -> int:
    return min(_shanten_general(c34), _shanten_7pairs(c34), _shanten_kokushi(c34))


# ------------------------------------------------------------
# 役种潜质（细分浮点权重，自然形成 1 位小数精度）
# ------------------------------------------------------------

def _iipeikou_potential_one_suit(counts9: tuple[int, ...]) -> float:
    """一杯口潜质：同一花色内取最高档（3344 孤立 / 33445 系 / 334455）。"""
    c = list(counts9)
    best = 0.0
    # 334455：连续三档各 ≥2
    for k in range(7):
        if c[k] >= 2 and c[k + 1] >= 2 and c[k + 2] >= 2:
            best = max(best, 8.0)
    # 33445 或对称 44556：连续三档 (2,2,1) 或 (1,2,2)
    for k in range(7):
        a, b, cc = c[k], c[k + 1], c[k + 2]
        if (a >= 2 and b >= 2 and cc >= 1) or (a >= 1 and b >= 2 and cc >= 2):
            best = max(best, 4.0)
    # 3344 且外侧无同花色靠张（无 n-1 与 n+2）
    for r in range(8):
        if c[r] >= 2 and c[r + 1] >= 2:
            left_ok = r == 0 or c[r - 1] == 0
            right_ok = r + 1 == 8 or c[r + 2] == 0
            if left_ok and right_ok:
                best = max(best, 1.5)
    return best


def _daisangen_potential(c34: tuple[int, ...]) -> float:
    """大三元潜质：三元皆在手；两对子 →8.0，且至少一刻子 →15.0（取高）。"""
    d = [c34[31], c34[32], c34[33]]
    if any(x < 1 for x in d):
        return 0.0
    pairs = sum(1 for x in d if x >= 2)
    trips = sum(1 for x in d if x >= 3)
    if pairs >= 2 and trips >= 1:
        return 15.0
    if pairs >= 2:
        return 8.0
    return 0.0


def _yaku_potential_bonus(c34: tuple[int, ...]) -> tuple[float, dict[str, float]]:
    """检测起手牌的役种潜质，返回（总加分, 明细 dict）。"""
    details: dict[str, float] = {}

    # 各 suit 与字牌的张数
    suit_counts = (sum(c34[0:9]), sum(c34[9:18]), sum(c34[18:27]))
    honor_count = sum(c34[27:34])
    sorted_suit = sorted(suit_counts, reverse=True)
    max_suit = sorted_suit[0]
    second_suit = sorted_suit[1]

    # 终端/字牌张数
    terminal_count = c34[0] + c34[8] + c34[9] + c34[17] + c34[18] + c34[26]
    edge_count = 0  # 各 suit 的 {1,2,3, 7,8,9} 共多少张
    for sb in (0, 9, 18):
        for r in (0, 1, 2, 6, 7, 8):
            edge_count += c34[sb + r]
    yaochu_count = terminal_count + honor_count  # 1, 9, 字
    # 断幺：仅数牌 2–8（中张）；与幺九类张数互补（不含字时 中张 + 幺九数牌 = 13）
    tanyao_numbered_middle = sum(c34[1:8]) + sum(c34[10:17]) + sum(c34[19:26])

    # 1) 断幺九潜质：无字牌时，按中张数牌（2–8）合计 10–13 张分档（此前误用幺九张数，与断幺含义相反）
    if honor_count == 0 and tanyao_numbered_middle >= 10:
        tanyao_table = {10: 1.5, 11: 3.5, 12: 7.5, 13: 10.0}
        details['tanyao'] = tanyao_table.get(min(tanyao_numbered_middle, 13), 10.0)

    # 2) 七对子（chiitoitsu）：明显的对子越多越好
    pairs = sum(1 for x in c34 if x >= 2)
    chiitoitsu_table = {3: 1.5, 4: 3.5, 5: 6.5, 6: 10.0}
    if pairs >= 3:
        details['chiitoitsu'] = chiitoitsu_table.get(pairs, 10.0)

    # 3) 一气通贯：某花色「不同数牌」种数 ≥6 时起算，按 6/7/8/9 种 → 1.0/3.0/5.0/10.0
    ittsuu_best = 0.0
    for sb in (0, 9, 18):
        kinds = sum(1 for r in range(9) if c34[sb + r] >= 1)
        if kinds >= 6:
            ittsuu_best = max(ittsuu_best, {6: 1.0, 7: 3.0, 8: 5.0, 9: 10.0}.get(kinds, 10.0))
    if ittsuu_best > 0:
        details['ittsuu'] = ittsuu_best

    # 4) 三色同顺（sanshoku doujun）：n, n+1, n+2 在三 suit 都有
    sanshoku_best = 0.0
    for n in range(7):
        suits_with_2 = 0
        suits_with_1 = 0
        for sb in (0, 9, 18):
            in_run = sum(c34[sb + n + k] for k in range(3))
            if in_run >= 2:
                suits_with_2 += 1
                suits_with_1 += 1
            elif in_run >= 1:
                suits_with_1 += 1
        if suits_with_2 == 3:
            sanshoku_best = max(sanshoku_best, 6.5)
        elif suits_with_2 >= 2 and suits_with_1 == 3:
            sanshoku_best = max(sanshoku_best, 3.5)
        elif suits_with_1 == 3:
            sanshoku_best = max(sanshoku_best, 1.5)
    if sanshoku_best > 0:
        details['sanshoku_doujun'] = sanshoku_best

    # 5) 三色同刻：分档更明显，最高 10.0
    sanshoku_doukou_best = 0.0
    for rank in range(9):
        suits_with_3 = sum(1 for sb in (0, 9, 18) if c34[sb + rank] >= 3)
        suits_with_2 = sum(1 for sb in (0, 9, 18) if c34[sb + rank] >= 2)
        suits_with_1 = sum(1 for sb in (0, 9, 18) if c34[sb + rank] >= 1)
        if suits_with_3 == 3:
            sanshoku_doukou_best = max(sanshoku_doukou_best, 10.0)
        elif suits_with_2 == 3:
            sanshoku_doukou_best = max(sanshoku_doukou_best, 7.0)
        elif suits_with_2 >= 2 and suits_with_1 == 3:
            sanshoku_doukou_best = max(sanshoku_doukou_best, 4.0)
        elif suits_with_1 == 3:
            sanshoku_doukou_best = max(sanshoku_doukou_best, 1.5)
    if sanshoku_doukou_best > 0:
        details['sanshoku_doukou'] = sanshoku_doukou_best

    # 6) 三暗刻（sanankou）：明刻 / 对子 数量
    triplets = sum(1 for x in c34 if x >= 3)
    if triplets >= 2:
        details['sanankou'] = 4.5
    elif triplets == 1 and pairs >= 3:
        details['sanankou'] = 2.5
    elif pairs >= 4:
        details['sanankou'] = 1.5

    # 7) 对々和（toitoi）：对子+刻子集中
    if pairs + triplets >= 5:
        details['toitoi'] = 3.5
    elif pairs + triplets >= 4 and triplets >= 1:
        details['toitoi'] = 2.5

    # 8) 清一色 / 混一色（清一最高 20.0，混一最高 10.0）
    if second_suit == 0 and honor_count == 0 and max_suit >= 11:
        details['chinitsu'] = 20.0
    elif second_suit == 0 and honor_count == 0 and max_suit >= 10:
        details['chinitsu'] = 16.0
    elif second_suit == 0 and honor_count == 0 and max_suit >= 9:
        details['chinitsu'] = 12.0
    elif second_suit == 0 and max_suit >= 9 and 1 <= honor_count <= 4:
        details['honitsu'] = 10.0
    elif second_suit == 0 and max_suit >= 8 and 1 <= honor_count <= 5:
        details['honitsu'] = 7.5
    elif second_suit <= 1 and max_suit + honor_count >= 9:
        details['honitsu'] = 5.0
    elif second_suit <= 2 and max_suit + honor_count >= 8:
        details['honitsu'] = 2.0

    # 9) 纯全带幺九（junchan）/ 混全带幺九（chanta）
    junchan = 0.0
    chanta = 0.0
    if honor_count == 0 and edge_count >= 11:
        junchan = 6.5
    elif honor_count == 0 and edge_count >= 9:
        junchan = 3.0
    elif edge_count + honor_count >= 11:
        chanta = 4.5
    elif edge_count + honor_count >= 9:
        chanta = 2.0
    if junchan > 0:
        details['junchan'] = junchan
    if chanta > 0:
        details['chanta'] = chanta

    # 10) 混老头（honroutou）：只有 1/9/字
    if yaochu_count >= 11:
        details['honroutou'] = 6.5
    elif yaochu_count >= 9:
        details['honroutou'] = 3.0

    # 11) 一杯口潜质（同花色取最高）
    ip_best = max(
        _iipeikou_potential_one_suit(c34[0:9]),
        _iipeikou_potential_one_suit(c34[9:18]),
        _iipeikou_potential_one_suit(c34[18:27]),
    )
    if ip_best > 0:
        details['iipeikou'] = ip_best

    # 12) 大三元潜质
    dg = _daisangen_potential(c34)
    if dg > 0:
        details['daisangen'] = dg

    total = sum(details.values())
    return total, details


# ------------------------------------------------------------
# 整体评分
# ------------------------------------------------------------

def evaluate_starting_hand(
    tiles: list[str],
    *,
    chang: int,
    dealer_seat: int,
    seat: int,
    dora_indicators: list[str],
    player_count: int = 4,
) -> dict[str, Any]:
    """对 13 张起手牌打分。返回包含 score / breakdown / invalid 等字段的字典。"""
    if not isinstance(tiles, list) or len(tiles) < 13:
        return {'score': 0, 'breakdown': {}, 'invalid': True}

    tiles_13 = list(tiles[:13])

    c34 = [0] * 34
    red_dora_count = 0
    for t in tiles_13:
        idx = _tile_index(t)
        if idx < 0:
            return {'score': 0, 'breakdown': {}, 'invalid': True}
        c34[idx] += 1
        if _is_red_five(t):
            red_dora_count += 1
    c34_t = tuple(c34)

    field_wind = _tile_index(_field_wind_tile(chang))
    seat_wind = _tile_index(_seat_wind_tile(seat, dealer_seat, player_count))
    yakuhai_set: frozenset[int] = frozenset(
        i for i in (field_wind, seat_wind, 31, 32, 33) if i >= 0
    )

    m_score = _suit_shape_dp(c34_t[0:9])
    p_score = _suit_shape_dp(c34_t[9:18])
    s_score = _suit_shape_dp(c34_t[18:27])
    honor_score, honor_detail = _honor_shape_score(c34_t, yakuhai_set)
    shape_score = m_score + p_score + s_score + honor_score

    sh_g = _shanten_general(c34_t)
    sh_p = _shanten_7pairs(c34_t)
    sh_k = _shanten_kokushi(c34_t)
    shanten = min(sh_g, sh_p, sh_k)
    # 向听加分：8-shanten 越大、越接近听牌；权重 4.0 + 起手就听牌的额外 1.5
    shanten_bonus = max(0.0, (8 - shanten) * 4.0)
    if shanten <= 0:
        shanten_bonus += 1.5

    dora_tile_indices: list[int] = []
    dora_tile_names: list[str] = []
    for d in (dora_indicators or []):
        dt = _dora_from_indicator(d)
        if not dt:
            continue
        di = _tile_index(dt)
        if di >= 0:
            dora_tile_indices.append(di)
            dora_tile_names.append(dt)

    dora_index_set = frozenset(dora_tile_indices)
    # 宝牌当量：赤 5 与指示牌推出的宝牌合计枚数（同枚不重复计）
    n_dora_equiv = 0
    for t in tiles_13:
        if _is_red_five(t):
            n_dora_equiv += 1
        else:
            ti = _tile_index(t)
            if ti in dora_index_set:
                n_dora_equiv += 1

    dora_count = sum(c34_t[di] for di in dora_tile_indices)
    adjacent_dora = 0
    for di in dora_tile_indices:
        if di < 27:
            suit_base = (di // 9) * 9
            rank = di % 9
            for nb in (rank - 1, rank + 1):
                if 0 <= nb <= 8:
                    adjacent_dora += c34_t[suit_base + nb]

    yaku_bonus_total, yaku_details = _yaku_potential_bonus(c34_t)

    # 宝牌：当量按枚累计阶梯（第 1 枚 +4，第 2 枚 +7，第 3 枚 +10…）+ 三张同宝牌 +8；邻张不变
    dora_equiv_ladder = _dora_equiv_ladder_total(n_dora_equiv)
    triplet_same_dora = 0.0
    for di in set(dora_tile_indices):
        if c34_t[di] >= 3:
            triplet_same_dora = 8.0
            break
    dora_bonus = dora_equiv_ladder + adjacent_dora * 1.5 + triplet_same_dora
    red_bonus = 0.0

    total = (
        shape_score
        + shanten_bonus
        + red_bonus
        + dora_bonus
        + yaku_bonus_total
    )

    return {
        'score': round(float(total), 1),
        'breakdown': {
            'shape_score': shape_score,
            'shape_detail': {
                'm_score': m_score, 'p_score': p_score, 's_score': s_score,
                'honor_score': honor_score, 'honor': honor_detail,
            },
            'yaku_potential_bonus': round(float(yaku_bonus_total), 1),
            'yaku_potential': {k: round(float(v), 1) for k, v in yaku_details.items()},
            'tanyao': 'tanyao' in yaku_details,
            'tanyao_bonus': yaku_details.get('tanyao', 0.0),
            'honitsu_bonus': yaku_details.get('honitsu', 0.0) + yaku_details.get('chinitsu', 0.0),
            'shanten': shanten,
            'shanten_breakdown': {
                'general': sh_g, 'pairs7': sh_p, 'kokushi': sh_k,
            },
            'shanten_bonus': round(float(shanten_bonus), 1),
            'red_dora': red_dora_count,
            'red_dora_bonus': red_bonus,
            'dora_equiv_count': n_dora_equiv,
            'dora_count': dora_count,
            'dora_tiles': dora_tile_names,
            'adjacent_dora': adjacent_dora,
            'dora_equiv_ladder_bonus': round(float(dora_equiv_ladder), 1),
            'dora_triplet_same_bonus': triplet_same_dora,
            'dora_bonus': round(float(dora_bonus), 1),
            'yakuhai_tiles': sorted({field_wind, seat_wind} | {31, 32, 33}),
        },
        'invalid': False,
    }


# ------------------------------------------------------------
# 从牌谱抽取起手牌
# ------------------------------------------------------------

def extract_starting_hands_from_game(game) -> list[dict[str, Any]]:
    """对一个对局的 paipu_data，按每局每座位返回起手 13 张及评分。"""
    from .services import _paipu_actions_from_game_data, _paipu_players_list, _seat_uid_map

    pd = game.paipu_data if isinstance(getattr(game, 'paipu_data', None), dict) else {}
    actions = _paipu_actions_from_game_data(pd)
    if not actions:
        return []

    players_list = _paipu_players_list(pd)
    seat_uid = _seat_uid_map(players_list)

    player_count = getattr(game, 'player_count', None) or 4

    out: list[dict[str, Any]] = []
    for act in actions:
        name = str(act.get('name') or '')
        if not name.endswith('RecordNewRound'):
            continue
        data = act.get('data')
        if not isinstance(data, dict):
            continue
        try:
            chang = int(data.get('chang') or 0)
        except (TypeError, ValueError):
            chang = 0
        try:
            ju = int(data.get('ju') or 0)
        except (TypeError, ValueError):
            ju = 0
        try:
            ben = int(data.get('ben') or 0)
        except (TypeError, ValueError):
            ben = 0
        dora_indicators = data.get('doras')
        if not isinstance(dora_indicators, list):
            dora_indicators = []

        dealer_seat = ju
        op = data.get('operation')
        if isinstance(op, dict):
            try:
                v = int(op.get('seat'))
                if 0 <= v < player_count:
                    dealer_seat = v
            except (TypeError, ValueError):
                pass

        for seat in range(player_count):
            tiles = data.get(f'tiles{seat}')
            if not isinstance(tiles, list) or len(tiles) < 13:
                continue
            uid = seat_uid.get(seat)
            result = evaluate_starting_hand(
                tiles, chang=chang, dealer_seat=dealer_seat,
                seat=seat, dora_indicators=list(dora_indicators),
                player_count=player_count,
            )
            if result.get('invalid'):
                continue
            out.append({
                'tiles': list(tiles[:13]),
                'chang': chang,
                'ju': ju,
                'ben': ben,
                'dealer_seat': dealer_seat,
                'seat': seat,
                'uid': uid,
                'dora_indicators': list(dora_indicators),
                'score': result['score'],
                'breakdown': result.get('breakdown', {}),
                'is_dealer': seat == dealer_seat,
            })

    return out
