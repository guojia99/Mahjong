from django.db import models
from django.conf import settings
from apps.players.models import Player
import uuid


GAME_TYPE_CHOICES = [
    ('offline', '线下对局'),
    ('online', '线上对局'),
]

GAME_MODE_CHOICES = [
    ('east_wind', '东风'),
    ('half_match', '半庄'),
]

PLAYER_COUNT_CHOICES = [
    (3, '三麻'),
    (4, '四麻'),
]

ROOM_STATUS_CHOICES = [
    ('open', '进行中'),
    ('closed', '已关闭'),
]

ROOM_TYPE_CHOICES = [
    ('offline', '线下场'),
    ('online', '线上场'),
]


class Room(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=100, verbose_name='房间名称')
    location = models.CharField(max_length=100, blank=True, default='', verbose_name='地点/雀庄')
    room_type = models.CharField(
        max_length=20, choices=ROOM_TYPE_CHOICES, default='offline', verbose_name='房间类型',
    )
    session_time = models.DateTimeField(null=True, blank=True, verbose_name='场次时间')
    status = models.CharField(max_length=20, choices=ROOM_STATUS_CHOICES, default='open', verbose_name='状态')
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
        related_name='created_rooms', verbose_name='创建者'
    )
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='创建时间')
    closed_at = models.DateTimeField(null=True, blank=True, verbose_name='关闭时间')

    class Meta:
        db_table = 'rooms'
        ordering = ['-created_at']

    def __str__(self):
        return self.name


class RoomPlayer(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    room = models.ForeignKey(Room, on_delete=models.CASCADE, related_name='room_players', verbose_name='房间')
    player = models.ForeignKey(Player, on_delete=models.CASCADE, related_name='room_memberships', verbose_name='雀士')
    joined_at = models.DateTimeField(auto_now_add=True, verbose_name='加入时间')

    class Meta:
        db_table = 'room_players'
        unique_together = ['room', 'player']

    def __str__(self):
        return f'{self.room.name} - {self.player.nickname}'


class Game(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    room = models.ForeignKey(Room, on_delete=models.CASCADE, null=True, blank=True, related_name='games', verbose_name='所属房间')
    game_type = models.CharField(max_length=20, choices=GAME_TYPE_CHOICES, default='offline', verbose_name='对局类型')
    game_mode = models.CharField(max_length=20, choices=GAME_MODE_CHOICES, default='half_match', verbose_name='对局模式')
    player_count = models.SmallIntegerField(choices=PLAYER_COUNT_CHOICES, default=4, verbose_name='人数(3三麻/4四麻)')
    start_time = models.DateTimeField(verbose_name='对局时间')
    end_time = models.DateTimeField(null=True, blank=True, verbose_name='结束时间')
    source_url = models.URLField(blank=True, default='', verbose_name='牌谱链接')
    paipu_data = models.JSONField(default=dict, blank=True, verbose_name='雀魂牌谱详细数据')
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
        related_name='created_games', verbose_name='创建者'
    )
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='创建时间')

    class Meta:
        db_table = 'games'
        ordering = ['-start_time']

    def __str__(self):
        return f'Game {self.id}'

    @property
    def is_scored(self):
        return self.game_players.filter(score__isnull=False).exists()

    @property
    def actual_player_count(self):
        return self.game_players.count()


class GamePlayer(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    game = models.ForeignKey(Game, on_delete=models.CASCADE, related_name='game_players', verbose_name='对局')
    player = models.ForeignKey(Player, on_delete=models.CASCADE, related_name='game_participations', verbose_name='雀士')
    seat_number = models.SmallIntegerField(verbose_name='座位号')
    score = models.IntegerField(null=True, blank=True, verbose_name='分数')
    is_dealer_start = models.BooleanField(default=False, verbose_name='是否东起')

    class Meta:
        db_table = 'game_players'
        unique_together = ['game', 'player']
        unique_together = ['game', 'seat_number']

    def __str__(self):
        return f'{self.game} - {self.player.nickname} (Seat {self.seat_number})'


HAND_RECORD_TYPE_CHOICES = [
    ('yakuman', '役满'),
    ('yakuman_confirmed', '役满确定'),
    ('yakuman_chance', '役满机会'),
]

WIN_TYPE_CHOICES = [
    ('tsumo', '自摸'),
    ('ron', '荣胡'),
]


class HandRecord(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    game = models.ForeignKey(Game, on_delete=models.CASCADE, related_name='hand_records', verbose_name='对局')
    player = models.ForeignKey(Player, on_delete=models.CASCADE, related_name='hand_records', verbose_name='雀士')
    record_type = models.CharField(max_length=30, choices=HAND_RECORD_TYPE_CHOICES, verbose_name='类型')
    yakuman_names = models.JSONField(default=list, verbose_name='役种列表')
    hand_tiles = models.JSONField(default=list, blank=True, verbose_name='手牌')
    melds = models.JSONField(default=list, blank=True, verbose_name='吃碰杠牌')
    winning_tile = models.CharField(max_length=10, blank=True, default='', verbose_name='胡牌张')
    win_type = models.CharField(max_length=10, choices=WIN_TYPE_CHOICES, default='tsumo', verbose_name='胡牌方式')
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='创建时间')

    class Meta:
        db_table = 'hand_records'
        ordering = ['-created_at']

    def __str__(self):
        names = '、'.join(self.yakuman_names) if self.yakuman_names else '未知役种'
        return f'{self.game} - {self.player.nickname} - {names}'
