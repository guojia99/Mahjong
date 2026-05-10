#!/usr/bin/env python
"""联赛测试数据脚本。

用法：
    cd backend && source .venv/bin/activate
    python manage.py shell < scripts/populate_league.py

    # 或直接执行（推荐与线下模拟联用时）：
    cd backend && PYTHONPATH=. python scripts/populate_league.py

会做的事：
- 默认创建（或复用）系列「嘉の雀桩联赛」及届号 1 的赛季「第一届」（报名中）。
- 新建一整套联赛（不复用旧系列）示例：
    MAHJONG_POPULATE_NEW_LEAGUE=1 PYTHONPATH=. python scripts/populate_league.py
  也可手动指定系列名 / 届号：
    MAHJONG_POPULATE_SERIES_NAME='我的测试联赛' MAHJONG_POPULATE_SEASON_NUMBER=1 PYTHONPATH=. python scripts/populate_league.py
- 把数据库里的前 24 名雀士（缺则自动 mock）批量报名进去。
- 调用 services.create_standard_stages 一次性写入文档定义的 7 个标准赛段。

可选：与 simulate_full_league_offline.py 相同的全赛程线下录入（各允许陪打的赛段会先写入陪打测试半庄）：
    MAHJONG_POPULATE_OFFLINE_SIM=1 PYTHONPATH=. python scripts/populate_league.py
    MAHJONG_POPULATE_OFFLINE_SIM=1 MAHJONG_POPULATE_OFFLINE_CAP=5 PYTHONPATH=. python scripts/populate_league.py

单独跑全赛程（不含本脚本的系列/赛季初始化逻辑）见：scripts/simulate_full_league_offline.py
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from datetime import datetime  # noqa: E402

from django.contrib.auth import get_user_model  # noqa: E402

from apps.leagues.models import LeagueSeason, LeagueSeries  # noqa: E402
from apps.leagues.services import (  # noqa: E402
    batch_register_players, create_standard_stages,
)
from apps.players.models import MahjongSoulAccount, Player  # noqa: E402

User = get_user_model()

DEFAULT_SERIES_NAME = '嘉の雀桩联赛'


def _env_truthy(key: str) -> bool:
    v = os.environ.get(key, '').strip().lower()
    return v in ('1', 'true', 'yes', 'on')


def _resolve_series_name() -> str:
    explicit = os.environ.get('MAHJONG_POPULATE_SERIES_NAME', '').strip()
    if explicit:
        return explicit
    if _env_truthy('MAHJONG_POPULATE_NEW_LEAGUE'):
        return f'{DEFAULT_SERIES_NAME}-{datetime.now().strftime("%Y%m%d-%H%M%S")}'
    return DEFAULT_SERIES_NAME


def _resolve_season_number() -> int:
    raw = os.environ.get('MAHJONG_POPULATE_SEASON_NUMBER', '1').strip() or '1'
    return max(1, int(raw))


def _resolve_season_display_name() -> str:
    return (os.environ.get('MAHJONG_POPULATE_SEASON_NAME', '').strip() or '第一届')


def _ensure_admin():
    admin = User.objects.filter(is_staff=True).first()
    if admin:
        return admin
    admin = User.objects.create_user(
        username='admin', password='admin123', is_staff=True, is_superuser=True,
    )
    print(f'Created admin user: {admin.username} (password: admin123)')
    return admin


def _ensure_players(admin, count=24):
    players = list(Player.objects.all()[:count])
    if len(players) >= count:
        return players[:count]
    needed = count - len(players)
    base_uid = 99000000
    for i in range(needed):
        idx = len(players) + i + 1
        p = Player.objects.create(nickname=f'TestPlayer{idx:02d}', created_by=admin)
        MahjongSoulAccount.objects.create(player=p, uid=base_uid + idx, nickname=p.nickname)
        players.append(p)
    return players[:count]


def _scripts_dir() -> Path:
    try:
        return Path(__file__).resolve().parent
    except NameError:
        return Path.cwd() / 'scripts'


def _offline_sim_requested() -> bool:
    v = os.environ.get('MAHJONG_POPULATE_OFFLINE_SIM', '').strip().lower()
    return v in ('1', 'true', 'yes', 'on')


def _run_offline_simulation(
    admin,
    season_id: str,
    *,
    player_count: int,
    series_name: str,
    season_name: str,
) -> None:
    """复用 simulate_full_league_offline：开赛 → 各赛段陪打测试 + 线下半庄循环。"""
    scripts = _scripts_dir()
    if str(scripts) not in sys.path:
        sys.path.insert(0, str(scripts))
    import simulate_full_league_offline as sim  # noqa: E402

    cap = int(os.environ.get('MAHJONG_POPULATE_OFFLINE_CAP', '8'))
    sim.run_simulation(
        admin=admin,
        season_id=season_id,
        series_name=series_name,
        season_name=season_name,
        fresh=False,
        player_count=player_count,
        offline_cap=cap,
    )


def populate():
    admin = _ensure_admin()
    players = _ensure_players(admin, count=24)
    print(f'Players ready: {len(players)} (with 雀魂 UID)')

    series_name = _resolve_series_name()
    season_number = _resolve_season_number()
    season_label = _resolve_season_display_name()

    series, series_created = LeagueSeries.objects.get_or_create(
        name=series_name,
        defaults={'created_by': admin, 'description': '## 测试联赛\n\n用于演示「联赛系统」的样例数据。'},
    )
    print(f'Series: {series.name} {"(created)" if series_created else "(exists)"}')

    season, created = LeagueSeason.objects.get_or_create(
        series=series, season_number=season_number,
        defaults={
            'name': season_label,
            'status': 'registration',
            'is_current': True,
            'allow_online': True,
            'allow_offline': True,
            'created_by': admin,
            'start_time': datetime(2026, 5, 15, 19, 0),
            'end_time': datetime(2026, 6, 30, 22, 0),
            'description': f'### {season_label} {series.name}\n\n- 24 人参与\n- 全程半庄战\n- 文档定义的 7 个标准赛段',
        },
    )
    print(f'Season: {season.name} (number={season.season_number}, status={season.status}) '
          f'{"created" if created else "exists"}')

    # 批量报名（services 内部会跳过没有 majsoul UID 的）
    registered = batch_register_players(season.id, [str(p.id) for p in players])
    total = season.season_players.count()
    print(f'Registered this run: {len(registered)}, total in season: {total}')

    # 一键写入标准赛段
    stages = create_standard_stages(season.id)
    print(f'Stages reset to standard template: {len(stages)} 个')
    for s in stages:
        print(f'  - order={s.order} {s.name} ({s.stage_type}) games={s.games_per_player} '
              f'uma={s.uma_1st}/{s.uma_2nd}/{s.uma_3rd}/{s.uma_4th}')

    print('\n=== 联赛测试数据已写入 ===')
    print('打开前端 /leagues 查看选手 / 赛段，登录管理员后可访问 /league-admin 管理。')

    if _offline_sim_requested():
        print('\n=== MAHJONG_POPULATE_OFFLINE_SIM：执行全赛程线下模拟（含陪打测试局）===\n')
        _run_offline_simulation(
            admin,
            str(season.id),
            player_count=len(players),
            series_name=series_name,
            season_name=season_label,
        )


if __name__ == '__main__':
    populate()
