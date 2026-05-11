"""
联赛业务层。

设计原则：
- 报名期(season.status == 'registration') 内一切都可改，包括赛段顺序、参数、分组等。
- 赛季开赛后核心结构锁定（赛段不可增删，赛段核心字段如 games_per_player/uma 不可改），
  仅可更新描述、阶段状态以及对局录入数据。
- 双败淘汰赛严格按照 docs/v2.0.0.md 规则推进。
"""
from __future__ import annotations

import random
from typing import Any, Iterable

from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils.translation import gettext_lazy as _

from apps.players.models import Player
from .models import (
    LeagueImageAsset,
    LeagueSeries, LeagueSeason, LeagueStage,
    LeagueSeasonPlayer, LeagueStagePlayer, LeagueMatch,
)


# ---------------------------------------------------------------------------
# 序列与赛季基础查询
# ---------------------------------------------------------------------------

def get_all_series():
    return LeagueSeries.objects.prefetch_related('seasons').select_related('logo_asset').all()


def get_series_detail(series_id):
    return get_object_or_404(
        LeagueSeries.objects.select_related('logo_asset'),
        pk=series_id,
    )


def _validate_league_image_bytes(file_bytes: bytes, mime_type: str) -> None:
    if len(file_bytes) > 2 * 1024 * 1024:
        raise ValueError(_('图片不能超过 2MB'))
    allowed = {'image/png', 'image/jpeg', 'image/webp', 'image/gif'}
    if mime_type not in allowed:
        raise ValueError(_('仅支持 PNG / JPEG / WebP / GIF'))


def create_league_inline_image_asset(file_bytes: bytes, mime_type: str) -> LeagueImageAsset:
    """创建联赛正文 Markdown 用内联图片（仅存二进制表，通过 /leagues/media/<uuid>/ 访问）。"""
    _validate_league_image_bytes(file_bytes, mime_type)
    return LeagueImageAsset.objects.create(mime_type=mime_type, data=file_bytes)


def set_series_logo(series: LeagueSeries, file_bytes: bytes, mime_type: str) -> LeagueSeries:
    """将联赛 Logo 写入 SQLite 二进制表；旧资源删除。"""
    _validate_league_image_bytes(file_bytes, mime_type)
    with transaction.atomic():
        old_id = series.logo_asset_id
        asset = LeagueImageAsset.objects.create(mime_type=mime_type, data=file_bytes)
        series.logo_asset = asset
        series.save(update_fields=['logo_asset', 'updated_at'])
        if old_id:
            LeagueImageAsset.objects.filter(pk=old_id).delete()
    return series


def get_current_seasons():
    return LeagueSeason.objects.filter(is_current=True).select_related('series')


def get_season_detail(season_id):
    return get_object_or_404(
        LeagueSeason.objects.select_related('series').prefetch_related(
            'stages', 'season_players__player',
        ),
        pk=season_id,
    )


def get_stage_detail(stage_id):
    return get_object_or_404(
        LeagueStage.objects.select_related('season__series'),
        pk=stage_id,
    )


# ---------------------------------------------------------------------------
# 联赛系列 CRUD
# ---------------------------------------------------------------------------

@transaction.atomic
def create_series(user, data):
    return LeagueSeries.objects.create(created_by=user, **data)


@transaction.atomic
def update_series(series_id, data):
    series = get_object_or_404(LeagueSeries, pk=series_id)
    for key, value in data.items():
        setattr(series, key, value)
    series.save()
    return series


@transaction.atomic
def delete_series(series_id):
    get_object_or_404(LeagueSeries, pk=series_id).delete()


# ---------------------------------------------------------------------------
# 赛季 CRUD / 生命周期
# ---------------------------------------------------------------------------

@transaction.atomic
def create_season(user, series_id, data):
    series = get_object_or_404(LeagueSeries, pk=series_id)
    last_season = series.seasons.order_by('-season_number').first()
    season_number = (last_season.season_number + 1) if last_season else 1

    if data.get('is_current'):
        LeagueSeason.objects.filter(series=series, is_current=True).update(is_current=False)

    payload = {k: v for k, v in data.items() if k != 'series'}
    return LeagueSeason.objects.create(
        series=series,
        season_number=season_number,
        created_by=user,
        **payload,
    )


@transaction.atomic
def update_season(season_id, data):
    season = get_object_or_404(LeagueSeason, pk=season_id)

    # 唯一“当前期”维护
    if data.get('is_current') and not season.is_current:
        LeagueSeason.objects.filter(series=season.series, is_current=True).update(is_current=False)

    for key, value in data.items():
        setattr(season, key, value)
    season.save()
    return season


@transaction.atomic
def delete_season(season_id):
    season = get_object_or_404(LeagueSeason, pk=season_id)
    if season.status != 'registration':
        raise ValueError(str(_('联赛已开始，无法删除')))
    season.delete()


@transaction.atomic
def start_season(season_id):
    season = get_object_or_404(LeagueSeason, pk=season_id)
    if season.status != 'registration':
        raise ValueError(str(_('仅报名中的赛季可以开赛')))
    if season.season_players.count() < 4:
        raise ValueError(str(_('至少需要 4 名报名选手才能开赛')))
    if not season.stages.exists():
        raise ValueError(str(_('请先添加赛段后再开赛')))

    season.status = 'ongoing'
    season.save(update_fields=['status', 'updated_at'])

    # 给所有选手发种子签 A~H...（按报名顺序，超过 26 用双字母）
    for idx, sp in enumerate(season.season_players.order_by('joined_at')):
        sp.seed_label = _seed_label_for(idx)
        sp.save(update_fields=['seed_label'])

    # 把第一个赛段（按 order）的选手同步为全部报名选手
    first_stage = season.stages.order_by('order').first()
    if first_stage is not None:
        sync_stage_players_from_season(first_stage.id)

    return season


@transaction.atomic
def finish_season(season_id):
    season = get_object_or_404(LeagueSeason, pk=season_id)
    if season.status != 'ongoing':
        raise ValueError(str(_('仅进行中的赛季可以结束')))
    season.status = 'finished'
    season.save(update_fields=['status', 'updated_at'])
    return season


@transaction.atomic
def reopen_season(season_id):
    """管理员临时回退到报名状态以便修复（强制操作，慎用）。"""
    season = get_object_or_404(LeagueSeason, pk=season_id)
    season.status = 'registration'
    season.save(update_fields=['status', 'updated_at'])
    # 同步重置所有 stage 状态
    season.stages.update(status='pending')
    return season


def _seed_label_for(index: int) -> str:
    if index < 26:
        return chr(ord('A') + index)
    a, b = divmod(index, 26)
    return chr(ord('A') + a - 1) + chr(ord('A') + b)


# ---------------------------------------------------------------------------
# 报名管理
# ---------------------------------------------------------------------------

def _ensure_registration_open(season: LeagueSeason) -> None:
    if season.status != 'registration':
        raise ValueError(str(_('赛季已开赛，无法变更报名名单')))


def _player_has_majsoul(player: Player) -> bool:
    return player.majsoul_accounts.exists()


@transaction.atomic
def register_player(season_id, player_id):
    season = get_object_or_404(LeagueSeason, pk=season_id)
    _ensure_registration_open(season)

    player = get_object_or_404(Player, pk=player_id)
    if not _player_has_majsoul(player):
        raise ValueError(str(_('参赛选手必须绑定雀魂 UID')))

    sp, created = LeagueSeasonPlayer.objects.get_or_create(season=season, player=player)
    if not created:
        raise ValueError(str(_('该选手已报名')))
    return sp


@transaction.atomic
def unregister_player(season_id, player_id):
    season = get_object_or_404(LeagueSeason, pk=season_id)
    _ensure_registration_open(season)
    sp = get_object_or_404(LeagueSeasonPlayer, season=season, player_id=player_id)
    sp.delete()


@transaction.atomic
def batch_register_players(season_id, player_ids: Iterable[str]):
    season = get_object_or_404(LeagueSeason, pk=season_id)
    _ensure_registration_open(season)

    results: list[LeagueSeasonPlayer] = []
    for pid in player_ids:
        player = Player.objects.filter(pk=pid).first()
        if not player or not _player_has_majsoul(player):
            continue
        sp, created = LeagueSeasonPlayer.objects.get_or_create(season=season, player=player)
        if created:
            results.append(sp)
    return results


# ---------------------------------------------------------------------------
# 赛段管理
# ---------------------------------------------------------------------------

# 文档里的“标准赛段配置”
STANDARD_STAGES_TEMPLATE = [
    {
        'name': '积分赛',
        'stage_type': 'swiss',
        'games_per_player': 8,
        'uma_1st': 20, 'uma_2nd': 10, 'uma_3rd': -10, 'uma_4th': -20,
        'allow_companion': True,
        'allow_free_table': True,
        'record_ranking': True,
    },
    {
        'name': '淘汰赛第一阶段',
        'stage_type': 'elimination_1',
        'games_per_player': 4,
        'uma_1st': 20, 'uma_2nd': 10, 'uma_3rd': -10, 'uma_4th': -20,
        'allow_companion': True,
        'allow_free_table': True,
        'record_ranking': True,
    },
    {
        'name': '淘汰赛第二阶段',
        'stage_type': 'elimination_2',
        'games_per_player': 4,
        'uma_1st': 20, 'uma_2nd': 10, 'uma_3rd': -10, 'uma_4th': -20,
        'allow_companion': True,
        'allow_free_table': True,
        'record_ranking': True,
    },
    {
        'name': '淘汰赛第三阶段',
        'stage_type': 'elimination_3',
        'games_per_player': 4,
        'uma_1st': 20, 'uma_2nd': 10, 'uma_3rd': -10, 'uma_4th': -20,
        'allow_companion': True,
        'allow_free_table': True,
        'record_ranking': True,
    },
    {
        'name': '复活赛',
        'stage_type': 'revival',
        'games_per_player': 4,
        'uma_1st': 20, 'uma_2nd': 10, 'uma_3rd': -10, 'uma_4th': -20,
        'allow_companion': False,
        'allow_free_table': True,
        'record_ranking': True,
    },
    {
        'name': '半决赛',
        'stage_type': 'semifinal',
        'games_per_player': 6,
        'uma_1st': 50, 'uma_2nd': 10, 'uma_3rd': -15, 'uma_4th': -40,
        'allow_companion': False,
        'allow_free_table': False,
        'record_ranking': True,
    },
    {
        'name': '决赛',
        'stage_type': 'final',
        'games_per_player': 4,
        'uma_1st': 50, 'uma_2nd': 10, 'uma_3rd': -15, 'uma_4th': -40,
        'allow_companion': False,
        'allow_free_table': False,
        'record_ranking': True,
    },
]


@transaction.atomic
def create_standard_stages(season_id):
    """一键导入文档中的标准赛制。"""
    season = get_object_or_404(LeagueSeason, pk=season_id)
    if season.status != 'registration':
        raise ValueError(str(_('赛季已开赛，无法重置赛段')))

    # 重置：清空旧赛段
    season.stages.all().delete()
    created: list[LeagueStage] = []
    for idx, tpl in enumerate(STANDARD_STAGES_TEMPLATE, start=1):
        stage = LeagueStage.objects.create(season=season, order=idx, **tpl)
        created.append(stage)
    return created


@transaction.atomic
def create_stage(season_id, data):
    season = get_object_or_404(LeagueSeason, pk=season_id)
    if season.status != 'registration':
        raise ValueError(str(_('赛季已开赛，无法新增赛段')))

    last_stage = season.stages.order_by('-order').first()
    order = (last_stage.order + 1) if last_stage else 1
    return LeagueStage.objects.create(season=season, order=order, **data)


# 开赛后允许修改的“非锁定”字段
_UNLOCKED_FIELDS_AFTER_START = {
    'name', 'notes', 'allow_companion', 'allow_free_table',
    'record_ranking', 'promotion_rules',
}


@transaction.atomic
def update_stage(stage_id, data):
    stage = get_stage_detail(stage_id)

    # 报名期：任意修改
    if stage.season.status == 'registration':
        for key, value in data.items():
            setattr(stage, key, value)
        stage.save()
        return stage

    # 进行中或结束：仅可改非锁定字段
    illegal = set(data.keys()) - _UNLOCKED_FIELDS_AFTER_START
    if illegal:
        raise ValueError(
            str(_('赛季已开赛，以下字段不可修改：%s')) % ', '.join(sorted(illegal))
        )
    for key in _UNLOCKED_FIELDS_AFTER_START:
        if key in data:
            setattr(stage, key, data[key])
    stage.save()
    return stage


@transaction.atomic
def delete_stage(stage_id):
    stage = get_stage_detail(stage_id)
    if stage.season.status != 'registration':
        raise ValueError(str(_('赛季已开赛，无法删除赛段')))
    stage.delete()


@transaction.atomic
def reorder_stages(season_id, ordered_ids):
    """报名期内重新排序赛段。"""
    season = get_object_or_404(LeagueSeason, pk=season_id)
    if season.status != 'registration':
        raise ValueError(str(_('赛季已开赛，无法调整赛段顺序')))

    stage_map = {str(s.id): s for s in season.stages.all()}
    # 校验
    if set(stage_map.keys()) != set(str(i) for i in ordered_ids):
        raise ValueError(str(_('排序列表必须包含全部赛段')))

    # 先把所有 order 设为负值避免 unique 冲突
    for s in stage_map.values():
        LeagueStage.objects.filter(pk=s.pk).update(order=-int(s.order or 0) - 100)
    for idx, sid in enumerate(ordered_ids, start=1):
        LeagueStage.objects.filter(pk=sid).update(order=idx)
    return list(season.stages.order_by('order'))


@transaction.atomic
def start_stage(stage_id):
    stage = get_stage_detail(stage_id)
    if stage.season.status != 'ongoing':
        raise ValueError(str(_('赛季尚未开赛，无法启动赛段')))
    if stage.status != 'pending':
        raise ValueError(str(_('仅未开始的阶段可以开启')))

    # 校验：之前的赛段必须已结束（严格顺序）
    earlier = stage.season.stages.filter(order__lt=stage.order).exclude(status='finished')
    if earlier.exists():
        raise ValueError(str(_('请先结束前置赛段，才能启动当前赛段')))

    stage.status = 'ongoing'
    stage.save(update_fields=['status', 'updated_at'])

    # 如果还没同步选手，自动从前置阶段晋级 / 全员同步
    if not stage.stage_players.exists():
        if stage.order == 1:
            sync_stage_players_from_season(stage.id)
        # 后续阶段必须由 promotion 流程在前置赛段结束时填入

    return stage


@transaction.atomic
def finish_stage(stage_id):
    stage = get_stage_detail(stage_id)
    if stage.status != 'ongoing':
        raise ValueError(str(_('仅进行中的阶段可以结束')))

    # 重新结算 PT 与排名
    recalculate_stage_pt(stage.id)

    stage.status = 'finished'
    stage.save(update_fields=['status', 'updated_at'])

    # 自动尝试晋级
    apply_stage_promotion(stage.id)
    return stage


# ---------------------------------------------------------------------------
# 阶段选手管理
# ---------------------------------------------------------------------------

@transaction.atomic
def sync_stage_players_from_season(stage_id):
    """把赛季报名名单全部同步到该赛段（不存在则添加）。"""
    stage = get_stage_detail(stage_id)
    season_player_ids = list(
        stage.season.season_players.values_list('player_id', flat=True),
    )
    for pid in season_player_ids:
        LeagueStagePlayer.objects.get_or_create(
            stage=stage, player_id=pid,
            defaults={'group_type': 'none'},
        )
    return list(stage.stage_players.select_related('player').all())


@transaction.atomic
def add_stage_players(stage_id, player_data_list):
    stage = get_stage_detail(stage_id)
    results = []
    for item in player_data_list:
        sp, created = LeagueStagePlayer.objects.get_or_create(
            stage=stage, player_id=item['player_id'],
            defaults={
                'group_type': item.get('group_type', 'none'),
            },
        )
        if not created and item.get('group_type'):
            sp.group_type = item['group_type']
            sp.save(update_fields=['group_type', 'updated_at'])
        results.append(sp)
    return results


@transaction.atomic
def update_stage_player(stage_player_id, data):
    sp = get_object_or_404(LeagueStagePlayer, pk=stage_player_id)
    allowed = {'group_type', 'is_eliminated', 'is_promoted'}
    for key in allowed:
        if key in data:
            setattr(sp, key, data[key])
    sp.save()
    return sp


@transaction.atomic
def remove_stage_player(stage_player_id):
    sp = get_object_or_404(LeagueStagePlayer, pk=stage_player_id)
    if sp.stage.status != 'pending':
        raise ValueError(str(_('阶段已开赛，无法移除选手')))
    sp.delete()


def _season_seed_label_map(season_id) -> dict[str, str]:
    """赛季报名表上的种子签号 player_id -> seed_label。"""
    return {
        str(row.player_id): (row.seed_label or '')
        for row in LeagueSeasonPlayer.objects.filter(season_id=season_id).only('player_id', 'seed_label')
    }


def get_stage_ranking(stage_id):
    """获取赛段排行榜。

    排序规则：
    1. 按分组（winners / losers / none）；
    2. 已开打过至少一局的选手优先；未上场的统一排到对应分组末尾；
    3. 已开打选手按 total_pt 倒序，未上场按种子号 / 昵称升序，便于查找。
    """
    stage = get_stage_detail(stage_id)
    seed_map = _season_seed_label_map(stage.season_id)
    qs = list(stage.stage_players.select_related('player').all())
    qs.sort(key=lambda sp: (
        sp.group_type or '',
        0 if (sp.games_played or 0) > 0 else 1,
        -float(sp.total_pt or 0),
        seed_map.get(str(sp.player_id), ''),
        (sp.player.nickname or '') if sp.player_id else '',
    ))
    return qs


# ---------------------------------------------------------------------------
# PT 结算
# ---------------------------------------------------------------------------

@transaction.atomic
def recalculate_stage_pt(stage_id):
    """根据当前 stage 下所有 LeagueMatch 关联的 Game 重算 PT 与已打半庄数。

    陪打选手不影响 stage 内 PT，但仍计入 Game 的 GamePlayer，所以这里用
    LeagueStagePlayer 作为白名单：只要是阶段在册选手，且不是陪打名单成员的，
    才把这局成绩计入 PT；陪打名单成员该局 PT=0、不计 games_played。
    """
    stage = get_stage_detail(stage_id)
    seed_map = _season_seed_label_map(stage.season_id)

    # 重置
    stage.stage_players.all().update(total_pt=0, games_played=0, rank_in_stage=0)

    stage_players: dict[str, LeagueStagePlayer] = {
        str(sp.player_id): sp for sp in stage.stage_players.select_related('player')
    }
    # base_score 字段语义为「返点（实分）」，例如标准 25000；
    # 设置 30000 即等同于 +5000 oka 固定反点。
    base = stage.base_score
    uma = stage.get_uma_list()

    for match in stage.matches.select_related('game').all():
        if not match.game:
            continue
        gps = list(match.game.game_players.select_related('player').all())
        # 必须 4 人都已录分才算结束
        if not gps or any(gp.score is None for gp in gps):
            continue

        companion_ids = {str(pid) for pid in (match.companion_players or [])}
        gps_sorted = sorted(gps, key=lambda gp: gp.score or 0, reverse=True)
        for rank_idx, gp in enumerate(gps_sorted):
            pid_str = str(gp.player_id)
            sp = stage_players.get(pid_str)
            if sp is None:
                continue
            if pid_str in companion_ids:
                # 陪打：本阶段 PT+0、不计 games_played
                continue
            # GamePlayer.score 存储为「百点」单位（实分 / 100），
            # 例如终局 51700 分会被存为 517；这里乘 100 还原成实分参与运算。
            real_score = (gp.score or 0) * 100
            pt = (real_score - base) / 1000.0
            if rank_idx < len(uma):
                pt += uma[rank_idx]
            sp.total_pt = round(sp.total_pt + pt, 2)
            sp.games_played += 1

    # 排名 + 保存：未上场（games_played==0）的统一排到对应分组末尾。
    for group in ('winners', 'losers', 'none'):
        ranking = sorted(
            (sp for sp in stage_players.values() if sp.group_type == group),
            key=lambda x: (
                0 if (x.games_played or 0) > 0 else 1,
                -float(x.total_pt or 0),
                seed_map.get(str(x.player_id), ''),
                x.player.nickname if x.player_id else '',
            ),
        )
        for idx, sp in enumerate(ranking, start=1):
            sp.rank_in_stage = idx

    for sp in stage_players.values():
        sp.save(update_fields=['total_pt', 'games_played', 'rank_in_stage', 'updated_at'])

    return list(stage.stage_players.select_related('player').order_by('group_type', 'rank_in_stage'))


# ---------------------------------------------------------------------------
# LeagueMatch CRUD
# ---------------------------------------------------------------------------

@transaction.atomic
def create_league_match(stage_id, data):
    stage = get_stage_detail(stage_id)
    if stage.status != 'ongoing':
        raise ValueError(str(_('仅进行中的阶段可以创建对局')))

    return LeagueMatch.objects.create(
        stage=stage,
        game_id=data.get('game_id') or None,
        match_label=data.get('match_label', ''),
        round_index=int(data.get('round_index') or 0),
        table_index=int(data.get('table_index') or 0),
        scheduled_players=list(data.get('scheduled_players') or []),
        companion_players=list(data.get('companion_players') or []),
    )


@transaction.atomic
def update_league_match(match_id, data):
    match = get_object_or_404(LeagueMatch, pk=match_id)
    for key in ('match_label', 'round_index', 'table_index',
                'scheduled_players', 'companion_players', 'game_id'):
        if key in data:
            setattr(match, key, data[key])
    match.save()
    return match


@transaction.atomic
def delete_league_match(match_id):
    get_object_or_404(LeagueMatch, pk=match_id).delete()


# ---------------------------------------------------------------------------
# 半决赛对阵生成
# ---------------------------------------------------------------------------

# 半决赛 6 个半庄对阵组合（按签号 A~H）
_SEMIFINAL_PAIRINGS: list[tuple[list[str], list[str]]] = [
    (['A', 'B', 'C', 'D'], ['E', 'F', 'G', 'H']),
    (['A', 'B', 'E', 'F'], ['C', 'D', 'G', 'H']),
    (['A', 'B', 'G', 'H'], ['C', 'D', 'E', 'F']),
]


@transaction.atomic
def generate_semifinal_matches(stage_id):
    """半决赛随机派签 A~H，按 _SEMIFINAL_PAIRINGS 生成 6 个半庄。"""
    stage = get_stage_detail(stage_id)
    if stage.stage_type != 'semifinal':
        raise ValueError(str(_('仅半决赛阶段可以生成对阵')))
    if stage.status != 'ongoing':
        raise ValueError(str(_('请先开始半决赛再生成对阵')))

    players = list(
        stage.stage_players.filter(is_eliminated=False).select_related('player'),
    )
    if len(players) != 8:
        raise ValueError(str(_('半决赛需要恰好 8 名选手')))

    # 清空旧对阵
    stage.matches.all().delete()

    random.shuffle(players)
    labels = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']
    label_to_pid = {labels[i]: str(players[i].player_id) for i in range(8)}

    # 把签号写回 SeasonPlayer 用于展示
    for i, sp in enumerate(players):
        season_p = LeagueSeasonPlayer.objects.filter(
            season=stage.season, player=sp.player,
        ).first()
        if season_p is not None:
            season_p.seed_label = labels[i]
            season_p.save(update_fields=['seed_label'])

    matches: list[LeagueMatch] = []
    for round_idx, (g1, g2) in enumerate(_SEMIFINAL_PAIRINGS, start=1):
        for table_idx, group in enumerate((g1, g2), start=1):
            label_str = ''.join(group)
            m = LeagueMatch.objects.create(
                stage=stage,
                match_label=f'R{round_idx}-T{table_idx}({label_str})',
                round_index=round_idx,
                table_index=table_idx,
                scheduled_players=[label_to_pid[l] for l in group],
            )
            matches.append(m)
    return matches


# ---------------------------------------------------------------------------
# 双败淘汰赛 + 复活赛 + 半决赛 自动晋级算法
# ---------------------------------------------------------------------------

def _ranked_in_group(stage: LeagueStage, group: str) -> list[LeagueStagePlayer]:
    return list(
        stage.stage_players.filter(group_type=group)
        .order_by('-total_pt', 'created_at'),
    )


def _ranked_overall(stage: LeagueStage) -> list[LeagueStagePlayer]:
    return list(stage.stage_players.order_by('-total_pt', 'created_at'))


def get_elimination_stage_bypass_players(stage: LeagueStage):
    """淘汰赛第二、三阶段：第一阶段胜者组前四名（规则上保送第三阶段胜者组）。

    用于展示；与是否已在后续阶段完赛无关，始终按 elimination_1 胜者组当前排名取前四。
    """
    from .models import LeagueStage as LS

    if stage.stage_type not in ('elimination_2', 'elimination_3'):
        return []
    elim1 = (
        LS.objects.filter(season_id=stage.season_id, stage_type='elimination_1')
        .order_by('order')
        .prefetch_related('stage_players__player')
        .first()
    )
    if elim1 is None:
        return []
    winners = _ranked_in_group(elim1, 'winners')
    top4 = winners[:4]
    return [sp.player for sp in top4]


def _add_to_stage(target_stage: LeagueStage, player_id, group_type: str = 'none'):
    sp, created = LeagueStagePlayer.objects.get_or_create(
        stage=target_stage, player_id=player_id,
        defaults={'group_type': group_type},
    )
    if not created and sp.group_type != group_type:
        sp.group_type = group_type
        sp.save(update_fields=['group_type', 'updated_at'])
    return sp


@transaction.atomic
def apply_stage_promotion(stage_id):
    """根据当前 stage 类型，把符合条件的选手投放到下一个阶段；
    不符合的标记 is_eliminated=True / is_promoted=True。
    幂等：调用多次结果相同。
    """
    stage = get_stage_detail(stage_id)
    if stage.status != 'finished':
        raise ValueError(str(_('赛段尚未结束，无法晋级')))

    season = stage.season
    next_stages = list(season.stages.filter(order__gt=stage.order).order_by('order'))
    next_by_type = {s.stage_type: s for s in next_stages}

    def get_or_skip(typ: str):
        return next_by_type.get(typ)

    promoted_total: list[LeagueStagePlayer] = []

    if stage.stage_type == 'swiss':
        # 积分赛 -> 淘汰赛第一阶段：前 8 进胜者组，9~24 进败者组（实际人数自适应）
        all_ranked = _ranked_overall(stage)
        nxt = get_or_skip('elimination_1')
        if nxt is None:
            return []
        n = len(all_ranked)
        winners_n = min(8, n)
        losers_n = min(16, max(0, n - winners_n))
        promoted = []
        for i, sp in enumerate(all_ranked):
            if i < winners_n:
                target = _add_to_stage(nxt, sp.player_id, 'winners')
                sp.is_promoted = True
                sp.save(update_fields=['is_promoted', 'updated_at'])
                promoted.append(target)
            elif i < winners_n + losers_n:
                target = _add_to_stage(nxt, sp.player_id, 'losers')
                sp.is_promoted = True
                sp.save(update_fields=['is_promoted', 'updated_at'])
                promoted.append(target)
            else:
                sp.is_eliminated = True
                sp.save(update_fields=['is_eliminated', 'updated_at'])
        promoted_total.extend(promoted)
        return promoted_total

    if stage.stage_type == 'elimination_1':
        nxt2 = get_or_skip('elimination_2')
        nxt3 = get_or_skip('elimination_3')
        winners = _ranked_in_group(stage, 'winners')
        losers = _ranked_in_group(stage, 'losers')

        # 胜者组前 4 → 直送第三阶段胜者组
        for i, sp in enumerate(winners):
            if i < 4:
                if nxt3:
                    _add_to_stage(nxt3, sp.player_id, 'winners')
                sp.is_promoted = True
                sp.save(update_fields=['is_promoted', 'updated_at'])
            else:
                # 后 4 留在第二阶段胜者组
                if nxt2:
                    _add_to_stage(nxt2, sp.player_id, 'winners')

        # 败者组前 4 → 第二阶段胜者组
        # 其余按成绩保留 8 人在第二阶段败者组
        for i, sp in enumerate(losers):
            if i < 4:
                if nxt2:
                    _add_to_stage(nxt2, sp.player_id, 'winners')
                sp.is_promoted = True
                sp.save(update_fields=['is_promoted', 'updated_at'])
            elif i < 4 + 8:
                if nxt2:
                    _add_to_stage(nxt2, sp.player_id, 'losers')
            else:
                sp.is_eliminated = True
                sp.save(update_fields=['is_eliminated', 'updated_at'])
        return promoted_total

    if stage.stage_type == 'elimination_2':
        nxt3 = get_or_skip('elimination_3')
        winners = _ranked_in_group(stage, 'winners')
        losers = _ranked_in_group(stage, 'losers')

        # 胜者组前 4 → 第三阶段胜者组
        # 胜者组后 4 → 第三阶段败者组
        for i, sp in enumerate(winners):
            if i < 4:
                if nxt3:
                    _add_to_stage(nxt3, sp.player_id, 'winners')
                sp.is_promoted = True
                sp.save(update_fields=['is_promoted', 'updated_at'])
            else:
                if nxt3:
                    _add_to_stage(nxt3, sp.player_id, 'losers')

        # 败者组前 4 → 第三阶段败者组；其余淘汰
        for i, sp in enumerate(losers):
            if i < 4:
                if nxt3:
                    _add_to_stage(nxt3, sp.player_id, 'losers')
                sp.is_promoted = True
                sp.save(update_fields=['is_promoted', 'updated_at'])
            else:
                sp.is_eliminated = True
                sp.save(update_fields=['is_eliminated', 'updated_at'])
        return promoted_total

    if stage.stage_type == 'elimination_3':
        revival = get_or_skip('revival')
        semifinal = get_or_skip('semifinal')
        winners = _ranked_in_group(stage, 'winners')
        losers = _ranked_in_group(stage, 'losers')

        # 胜者组前 4 → 直接半决赛
        # 胜者组后 4 → 复活赛
        for i, sp in enumerate(winners):
            if i < 4:
                if semifinal:
                    _add_to_stage(semifinal, sp.player_id, 'none')
                sp.is_promoted = True
                sp.save(update_fields=['is_promoted', 'updated_at'])
            else:
                if revival:
                    _add_to_stage(revival, sp.player_id, 'none')

        # 败者组前 4 → 复活赛；后 4 淘汰
        for i, sp in enumerate(losers):
            if i < 4:
                if revival:
                    _add_to_stage(revival, sp.player_id, 'none')
            else:
                sp.is_eliminated = True
                sp.save(update_fields=['is_eliminated', 'updated_at'])
        return promoted_total

    if stage.stage_type == 'revival':
        semifinal = get_or_skip('semifinal')
        all_ranked = _ranked_overall(stage)
        for i, sp in enumerate(all_ranked):
            if i < 4:
                if semifinal:
                    _add_to_stage(semifinal, sp.player_id, 'none')
                sp.is_promoted = True
                sp.save(update_fields=['is_promoted', 'updated_at'])
            else:
                sp.is_eliminated = True
                sp.save(update_fields=['is_eliminated', 'updated_at'])
        return promoted_total

    if stage.stage_type == 'semifinal':
        final = get_or_skip('final')
        all_ranked = _ranked_overall(stage)
        for i, sp in enumerate(all_ranked):
            if i < 4:
                if final:
                    _add_to_stage(final, sp.player_id, 'none')
                sp.is_promoted = True
                sp.save(update_fields=['is_promoted', 'updated_at'])
            else:
                sp.is_eliminated = True
                sp.save(update_fields=['is_eliminated', 'updated_at'])
        return promoted_total

    if stage.stage_type == 'final':
        # 决赛结束 → 整个赛季可结束
        return promoted_total

    return promoted_total


# ---------------------------------------------------------------------------
# 联赛对局录入（线上 / 线下）
# ---------------------------------------------------------------------------

def _ensure_stage_ongoing(stage: LeagueStage):
    if stage.status != 'ongoing':
        raise ValueError(str(_('仅进行中的赛段可以录入对局')))


def _validate_companions(stage_player_ids: set[str], scheduled_player_ids: list[str], companion_ids: list[str]):
    """陪打选手必须出现在该桌选手中。"""
    for cid in companion_ids:
        if str(cid) not in {str(x) for x in scheduled_player_ids}:
            raise ValueError(str(_('陪打选手必须是该桌对局选手之一')))
    if not stage_player_ids:
        return
    # 所有非陪打选手都需要属于赛段
    for sid in scheduled_player_ids:
        if str(sid) in {str(x) for x in companion_ids}:
            continue
        if str(sid) not in stage_player_ids:
            raise ValueError(str(_('选手不在本赛段名单中')))


@transaction.atomic
def create_offline_league_match(
    user, stage_id, *,
    scheduled_player_ids: list[str],
    scores: list[dict] | None = None,
    start_time=None,
    end_time=None,
    game_mode: str = 'half_match',
    match_label: str = '',
    round_index: int = 0,
    table_index: int = 0,
    companion_players: list[str] | None = None,
):
    """
    线下手动录入：创建一个 Game（无 Room） + 关联 LeagueMatch。
    若提供 scores（4 项 player_id+score），则一并录入分数。
    """
    from apps.games.models import Game, GamePlayer
    from datetime import datetime as _dt

    stage = get_stage_detail(stage_id)
    _ensure_stage_ongoing(stage)

    scheduled_player_ids = [str(p) for p in (scheduled_player_ids or [])]
    companion_players = [str(p) for p in (companion_players or [])]

    if len(scheduled_player_ids) not in (3, 4):
        raise ValueError(str(_('对局选手必须为 3 或 4 人')))
    if len(set(scheduled_player_ids)) != len(scheduled_player_ids):
        raise ValueError(str(_('对局选手不能重复')))

    if companion_players and not stage.allow_companion:
        raise ValueError(str(_('当前赛段未开放陪打')))
    if len(companion_players) > 2:
        raise ValueError(str(_('陪打选手最多 2 名')))

    stage_player_ids = set(
        str(pid) for pid in stage.stage_players.values_list('player_id', flat=True)
    )
    _validate_companions(stage_player_ids, scheduled_player_ids, companion_players)

    if start_time is None:
        start_time = _dt.now()

    game = Game.objects.create(
        room=None,
        game_type='offline',
        game_mode=game_mode,
        player_count=len(scheduled_player_ids),
        start_time=start_time,
        end_time=end_time,
        source_url='',
        paipu_data={},
        created_by=user,
    )

    for i, pid in enumerate(scheduled_player_ids):
        GamePlayer.objects.create(
            game=game, player_id=pid, seat_number=i,
        )

    match = LeagueMatch.objects.create(
        stage=stage,
        game=game,
        match_label=match_label or '',
        round_index=int(round_index or 0),
        table_index=int(table_index or 0),
        scheduled_players=scheduled_player_ids,
        companion_players=companion_players,
    )

    if scores:
        _submit_game_scores_for_match(game, scores)

    return match


def _submit_game_scores_for_match(game, scores: list[dict]):
    from apps.games.services import GameService
    GameService.submit_scores(game, scores)


@transaction.atomic
def import_online_league_match(
    user, stage_id, source_url: str, *,
    allow_duplicate_url: bool = False,
    match_label: str = '',
    round_index: int = 0,
    table_index: int = 0,
    companion_players: list[str] | None = None,
):
    """
    线上录入：解析雀魂牌谱 → 通过 UID 自动匹配 stage 选手 → 创建 Game + LeagueMatch。
    若有 UID 未在系统中找到对应 player（或 player 不在赛段名单），抛 ValueError 提示。
    """
    from apps.games.models import Game, GamePlayer
    from apps.players.models import MahjongSoulAccount
    from apps.players.services import PlayerService
    from services.majsoul import (
        analyze_paipu_url, normalize_paipu_input_url, build_majsoul_record_detail_blob,
    )
    from datetime import datetime as _dt

    stage = get_stage_detail(stage_id)
    _ensure_stage_ongoing(stage)

    normalized = normalize_paipu_input_url(source_url or '')
    if not normalized:
        raise ValueError(str(_('请提供有效的牌谱链接')))

    # 重复校验
    if Game.objects.filter(game_type='online', source_url=normalized).exists():
        if not allow_duplicate_url:
            raise ValueError(str(_('该牌谱链接已在系统中存在对局，如需仍录入请勾选「允许重复」')))

    parsed = analyze_paipu_url(normalized)

    # UID → player_id 自动匹配
    uids = [int(p['uid']) for p in parsed['players']]
    bound = MahjongSoulAccount.objects.filter(uid__in=uids).select_related('player')
    uid_to_player = {acc.uid: acc.player for acc in bound if acc.player_id}

    stage_player_ids = set(
        str(pid) for pid in stage.stage_players.values_list('player_id', flat=True)
    )

    matched_players: list[tuple[int, Any]] = []  # (uid, Player)
    missing_uids: list[int] = []
    not_in_stage_uids: list[int] = []
    for p in parsed['players']:
        uid = int(p['uid'])
        player = uid_to_player.get(uid)
        if not player:
            missing_uids.append(uid)
            continue
        if str(player.id) not in stage_player_ids:
            not_in_stage_uids.append(uid)
            continue
        matched_players.append((uid, player))

    if missing_uids:
        nicks = {int(p['uid']): p['nickname'] for p in parsed['players']}
        details = ', '.join(f"{nicks.get(u, '')}(UID:{u})" for u in missing_uids)
        raise ValueError(str(_('以下 UID 尚未绑定到任何雀士，请先在「线上录入」页面完成绑定：%(d)s')) % {'d': details})
    if not_in_stage_uids:
        nicks = {int(p['uid']): p['nickname'] for p in parsed['players']}
        details = ', '.join(f"{nicks.get(u, '')}(UID:{u})" for u in not_in_stage_uids)
        raise ValueError(str(_('以下 UID 对应的雀士不在本赛段名单中：%(d)s')) % {'d': details})

    # 时间
    start_time = parsed.get('start_time') or _dt.now()
    end_time = parsed.get('end_time') or None

    # 包装 paipu raw_data
    raw = parsed.get('raw_data') or {}
    if raw and 'majsoul_record_detail' not in raw:
        raw = dict(raw)
        raw['majsoul_record_detail'] = build_majsoul_record_detail_blob(
            {
                'uuid': raw.get('uuid'),
                'start_time': raw.get('start_time'),
                'end_time': raw.get('end_time'),
                'players': raw.get('players'),
                'result': raw.get('result'),
                'actions': raw.get('actions'),
            },
            validation_ok=bool(raw.get('validation_ok', True)),
            validation_errors=list(raw.get('validation_errors') or []),
        )

    game = Game.objects.create(
        room=None,
        game_type='online',
        game_mode=parsed.get('game_mode', 'half_match'),
        player_count=parsed.get('player_count', len(parsed['players'])),
        start_time=start_time,
        end_time=end_time,
        source_url=normalized,
        paipu_data=raw,
        created_by=user,
    )

    # 按牌谱座位号顺序创建 GamePlayer
    sorted_parsed = sorted(parsed['players'], key=lambda x: int(x.get('seat', 0)))
    scheduled_player_ids: list[str] = []
    for i, p in enumerate(sorted_parsed):
        uid = int(p['uid'])
        player = uid_to_player[uid]
        # 写入/更新雀魂账号绑定
        try:
            PlayerService.ensure_majsoul_uid_on_player(player, uid, p.get('nickname') or '')
        except Exception:
            pass
        GamePlayer.objects.create(
            game=game, player=player, seat_number=i,
            score=p.get('score'),
            is_dealer_start=(i == 0),
        )
        scheduled_player_ids.append(str(player.id))

    match = LeagueMatch.objects.create(
        stage=stage,
        game=game,
        match_label=match_label or '',
        round_index=int(round_index or 0),
        table_index=int(table_index or 0),
        scheduled_players=scheduled_player_ids,
        companion_players=[str(p) for p in (companion_players or [])],
    )

    # 触发段位结算
    try:
        from apps.ranking.services import settle_game_ranking
        settle_game_ranking(game)
    except Exception:
        pass

    return match

