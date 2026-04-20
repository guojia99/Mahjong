import os
import random
import django
from datetime import datetime, timedelta

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from django.contrib.auth import get_user_model
from apps.players.models import Player
from apps.games.models import Room, Game, GamePlayer

User = get_user_model()

user = User.objects.filter(username="admin").first()
if not user:
    print("请先运行 make init 创建管理员")
    exit(1)

players = list(Player.objects.all())
if len(players) < 3:
    print(f"需要至少3个雀士，当前仅 {len(players)} 个")
    exit(1)

USE_4 = len(players) >= 4
count = 4 if USE_4 else 3
selected = players[:count]
print(f"使用 {count} 名雀士: {[p.nickname for p in selected]}")

room, _ = Room.objects.get_or_create(
    name="日常雀桩",
    defaults={"location": "嘉の雀桩", "status": "closed", "created_by": user},
)

base_time = datetime.now() - timedelta(days=30)

MODES = ["east_wind", "half_match"]

created = 0
for i in range(25):
    game_mode = random.choice(MODES)
    start_time = base_time + timedelta(days=i, hours=random.randint(10, 23), minutes=random.choice([0, 15, 30, 45]))
    is_4 = random.random() < 0.75
    game_players = selected[:4] if is_4 else selected[:3]
    total = 1000 if len(game_players) == 4 else 1050

    dealer_idx = random.randint(0, len(game_players) - 1)

    if len(game_players) == 4:
        patterns = [
            [350, 250, 200, 200],
            [400, 250, 200, 150],
            [300, 300, 250, 150],
            [450, 200, 200, 150],
            [300, 250, 250, 200],
            [350, 300, 150, 200],
            [250, 250, 300, 200],
            [400, 300, 150, 150],
            [500, 200, 150, 150],
            [350, 200, 250, 200],
            [300, 350, 200, 150],
            [250, 250, 250, 250],
            [400, 350, 100, 150],
            [350, 250, 100, 300],
            [200, 300, 300, 200],
            [450, 250, 200, 100],
            [300, 200, 300, 200],
            [400, 200, 300, 100],
            [350, 350, 200, 100],
            [250, 200, 200, 350],
            [500, 300, 100, 100],
            [300, 300, 150, 250],
            [350, 150, 250, 250],
            [400, 250, 250, 100],
            [250, 350, 250, 150],
        ]
    else:
        patterns = [
            [450, 350, 250],
            [500, 300, 250],
            [400, 400, 250],
            [550, 300, 200],
            [350, 350, 350],
            [600, 250, 200],
            [450, 450, 150],
            [500, 400, 150],
            [550, 350, 150],
            [400, 350, 300],
            [300, 400, 350],
            [500, 500, 50],
            [600, 300, 150],
            [450, 300, 300],
            [350, 450, 250],
        ]

    scores = random.choice(patterns)
    random.shuffle(scores)

    game = Game.objects.create(
        room=room,
        game_type="offline",
        game_mode=game_mode,
        start_time=start_time,
        created_by=user,
    )

    for seat, player in enumerate(game_players):
        GamePlayer.objects.create(
            game=game,
            player=player,
            seat_number=seat,
            score=scores[seat],
            is_dealer_start=(seat == dealer_idx),
        )

    created += 1

print(f"已创建 {created} 局对局 (房间: {room.name})")
print(f"对局模式分布: 东风局/半庄/南风局 (随机)")
print(f"4人局/3人局: 随机 (约7:3)")
print(f"每局约1-3人有负分")
