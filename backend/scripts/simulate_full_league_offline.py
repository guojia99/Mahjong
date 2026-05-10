#!/usr/bin/env python
"""模拟联赛全赛程：所有赛段均使用线下录入（随机测试点棒分），不依赖牌谱 URL / Node paipu。

用法：
  cd backend && source .venv/bin/activate
  PYTHONPATH=. python scripts/simulate_full_league_offline.py --fresh

  PYTHONPATH=. python scripts/simulate_full_league_offline.py \\
      --season-id <uuid> --player-count 24 --offline-cap 8

流程：
  1. （可选 --fresh）reopen 赛季 + 清空对局、赛段选手、报名
  2. 准备 N 名带雀魂 UID 的测试雀士（不足则自动创建）
  3. 标准 7 赛段（若尚无）
  4. 报名 → start_season
  5. 各赛段：start_stage → **若有陪打权限则先写入一局陪打测试半庄** → 线下半庄循环直至每人约达到 games_per_player（受 --offline-cap 限制）→ finish_stage

陪打测试：
  - 仅 allow_companion=True 的赛段（积分赛、淘汰赛前三阶段）；复活赛/半决赛/决赛文档为不允许陪打，脚本跳过。
  - 每段写入 1 局：`scheduled_player_ids` 为 4 人，`companion_players` 为其中 1～2 人（按赛段类型变化），用于覆盖服务端校验与 PT 统计。
"""
from __future__ import annotations

import argparse
import os
import random
import sys

import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from django.contrib.auth import get_user_model  # noqa: E402

from apps.leagues.models import LeagueSeason, LeagueSeries, LeagueStage  # noqa: E402
from apps.leagues.services import (  # noqa: E402
    batch_register_players,
    create_standard_stages,
    finish_stage,
    recalculate_stage_pt,
    reopen_season,
    start_season,
    start_stage,
    create_offline_league_match,
)
from apps.players.models import MahjongSoulAccount, Player  # noqa: E402

User = get_user_model()


def _ensure_admin(username: str | None):
    if username:
        u = User.objects.filter(username=username).first()
        if u:
            return u
    u = User.objects.filter(is_staff=True).first()
    if u:
        return u
    return User.objects.create_user(
        username='admin', password='admin123', is_staff=True, is_superuser=True,
    )


def _ensure_players(admin, count: int = 24):
    players = list(Player.objects.all()[:count])
    if len(players) >= count:
        return players[:count]
    needed = count - len(players)
    base_uid = 99000000
    for i in range(needed):
        idx = len(players) + i + 1
        p = Player.objects.create(nickname=f'SimPlayer{idx:02d}', created_by=admin)
        MahjongSoulAccount.objects.create(player=p, uid=base_uid + idx, nickname=p.nickname)
        players.append(p)
    return players[:count]


def _cleanup_season_simulation(season_id):
    """清空对局数据、赛段选手与赛季报名，便于重复跑脚本。"""
    from apps.games.models import Game

    season = LeagueSeason.objects.get(pk=season_id)
    reopen_season(season.id)
    for stage in season.stages.all():
        for m in stage.matches.all():
            gid = m.game_id
            m.delete()
            if gid:
                Game.objects.filter(pk=gid).delete()
        stage.stage_players.all().delete()
    season.season_players.all().delete()


def _fake_scores_four(player_ids: list[str]) -> list[dict]:
    base = [310, 260, 230, 200]
    return [
        {
            'player_id': player_ids[i],
            'score': base[i],
            'is_dealer_start': i == 0,
            'seat_number': i,
        }
        for i in range(4)
    ]


# 各允许陪打的赛段：本局标记几名「陪打」（须为 scheduled 中的子集，最多 2）
_COMPANION_TEST_COUNT_BY_STAGE_TYPE = {
    'swiss': 1,
    'elimination_1': 2,
    'elimination_2': 1,
    'elimination_3': 2,
}


def inject_companion_test_match(admin, stage: LeagueStage) -> bool:
    """
    写入一局含陪打的线下半庄（仅 allow_companion=True 且场上不少于 4 人）。
    返回是否成功创建。
    """
    if not stage.allow_companion:
        print('  [陪打测试] 本赛段未开放陪打，跳过')
        return False
    recalculate_stage_pt(stage.id)
    sps = list(stage.stage_players.filter(is_eliminated=False).select_related('player'))
    if len(sps) < 4:
        print('  [陪打测试] 有效选手不足 4，跳过')
        return False
    want = _COMPANION_TEST_COUNT_BY_STAGE_TYPE.get(stage.stage_type, 1)
    want = max(1, min(want, 2))
    sps.sort(key=lambda x: (x.games_played, x.player.nickname or ''))
    batch = sps[:4]
    pids = [str(x.player_id) for x in batch]
    random.shuffle(pids)
    companions = pids[-want:]
    create_offline_league_match(
        admin,
        str(stage.id),
        scheduled_player_ids=pids,
        companion_players=companions,
        scores=_fake_scores_four(pids),
        game_mode='half_match',
        match_label='',
    )
    print(f'  [陪打测试] 已写入 1 局（陪打 {len(companions)} 人: stage_type={stage.stage_type}）')
    return True


def fill_stage_offline_rounds(admin, stage: LeagueStage, *, target_cap: int = 8, max_rounds: int = 200):
    """为当前赛段创建若干线下半庄，使在场选手尽量达到 games_per_player（不超过 target_cap）。"""
    target = min(stage.games_per_player or 4, target_cap)
    try:
        inject_companion_test_match(admin, stage)
    except Exception as e:
        print(f'  [陪打测试] 失败（忽略并继续普通录入）: {e}')
    recalculate_stage_pt(stage.id)

    for _ in range(max_rounds):
        recalculate_stage_pt(stage.id)
        sps = list(stage.stage_players.filter(is_eliminated=False).select_related('player'))
        if len(sps) < 4:
            break
        min_gp = min(sp.games_played for sp in sps)
        if min_gp >= target:
            break
        sps.sort(key=lambda x: (x.games_played, x.player.nickname or ''))
        batch = sps[:4]
        pids = [str(x.player_id) for x in batch]
        random.shuffle(pids)
        create_offline_league_match(
            admin,
            str(stage.id),
            scheduled_player_ids=pids,
            scores=_fake_scores_four(pids),
            game_mode='half_match',
            match_label='',
        )
    recalculate_stage_pt(stage.id)


def run_simulation(
    *,
    admin,
    season_id: str | None,
    series_name: str,
    season_name: str,
    fresh: bool,
    player_count: int,
    offline_cap: int,
):
    if player_count < 4:
        print('错误：至少需要 4 名选手', file=sys.stderr)
        sys.exit(1)

    players = _ensure_players(admin, count=player_count)
    print(f'雀士就绪：{len(players)} 人（含自动创建的 SimPlayer / 雀魂 UID）')

    if season_id:
        season = LeagueSeason.objects.get(pk=season_id)
    else:
        series, _ = LeagueSeries.objects.get_or_create(
            name=series_name,
            defaults={'created_by': admin, 'description': '模拟脚本生成（线下）'},
        )
        season = LeagueSeason.objects.filter(series=series, name=season_name).first()
        if not season:
            last = LeagueSeason.objects.filter(series=series).order_by('-season_number').first()
            next_num = (last.season_number + 1) if last else 1
            season = LeagueSeason.objects.create(
                series=series,
                season_number=next_num,
                name=season_name,
                status='registration',
                is_current=True,
                allow_online=True,
                allow_offline=True,
                created_by=admin,
            )

    if fresh:
        print('重置赛季模拟状态…')
        _cleanup_season_simulation(str(season.id))

    season.refresh_from_db()
    if season.status != 'registration':
        print('赛季非报名中，尝试 reopen_season …')
        reopen_season(season.id)
        season.refresh_from_db()

    if not season.stages.exists():
        create_standard_stages(season.id)
        print('已创建标准 7 赛段')

    registered = batch_register_players(season.id, [str(p.id) for p in players])
    print(f'报名写入：本批 {len(registered)}，赛季报名总数 {season.season_players.count()}')

    print('开赛…')
    start_season(season.id)

    stages = list(season.stages.order_by('order'))
    for idx, stage in enumerate(stages):
        print(f'\n=== [{idx + 1}/{len(stages)}] {stage.name} ({stage.stage_type}) ===')
        st = LeagueStage.objects.get(pk=stage.id)
        if st.status == 'finished':
            print('  已结束，跳过')
            continue
        start_stage(st.id)

        print(f'  线下录入测试分（每位最多约 {offline_cap} 半庄）…')
        fill_stage_offline_rounds(admin, stage, target_cap=offline_cap, max_rounds=250)

        finish_stage(stage.id)
        print('  赛段已结束，已触发晋级。')

    season.refresh_from_db()
    print('\n=== 完成 ===')
    print(f'赛季状态: {season.status}')
    print('可在前端联赛赛季详情页查看各阶段成绩。')


def main():
    ap = argparse.ArgumentParser(description='模拟联赛全赛程（仅线下录入测试分）')
    ap.add_argument('--fresh', action='store_true', help='重置该赛季下对局、赛段选手与报名后重跑')
    ap.add_argument('--season-id', default=None, help='指定赛季 UUID（否则按系列名/赛季名查找或新建）')
    ap.add_argument('--series-name', default='嘉の雀桩联赛', help='新建赛季时的系列名')
    ap.add_argument('--season-name', default='模拟赛程(线下)', help='新建赛季时的赛季名称')
    ap.add_argument('--admin-username', default=None, help='执行写入的管理员账号')
    ap.add_argument('--player-count', type=int, default=24, help='参赛雀士人数（默认 24，不足则从数据库取并 mock）')
    ap.add_argument('--offline-cap', type=int, default=8, help='每赛段每位选手最多写入半庄数上限（不超过赛段配置）')
    args = ap.parse_args()

    admin = _ensure_admin(args.admin_username)
    run_simulation(
        admin=admin,
        season_id=args.season_id,
        series_name=args.series_name,
        season_name=args.season_name,
        fresh=args.fresh,
        player_count=args.player_count,
        offline_cap=args.offline_cap,
    )


if __name__ == '__main__':
    main()
