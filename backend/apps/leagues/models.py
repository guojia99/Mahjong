from django.db import models
from django.conf import settings
from apps.players.models import Player
import uuid


LEAGUE_SEASON_STATUS_CHOICES = [
    ('registration', '报名中'),
    ('ongoing', '进行中'),
    ('finished', '已结束'),
]

# 标准赛段类型与文档规范保持一致
STAGE_TYPE_CHOICES = [
    ('swiss', '积分赛'),
    ('elimination_1', '淘汰赛第一阶段'),
    ('elimination_2', '淘汰赛第二阶段'),
    ('elimination_3', '淘汰赛第三阶段'),
    ('revival', '复活赛'),
    ('semifinal', '半决赛'),
    ('final', '决赛'),
]

STAGE_STATUS_CHOICES = [
    ('pending', '未开始'),
    ('ongoing', '进行中'),
    ('finished', '已结束'),
]

GROUP_TYPE_CHOICES = [
    ('winners', '胜者组'),
    ('losers', '败者组'),
    ('none', '无分组'),
]


class LeagueImageAsset(models.Model):
    """联赛 Logo 等资源：二进制存 SQLite，通过 UUID URL 对外暴露便于缓存。"""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    mime_type = models.CharField(max_length=100, verbose_name='MIME 类型')
    data = models.BinaryField(verbose_name='图片数据')
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='创建时间')

    class Meta:
        db_table = 'league_image_assets'

    def __str__(self) -> str:
        return str(self.id)


class LeagueSeries(models.Model):
    """联赛系列：例如「嘉の雀桩联赛」是一个长期 IP，下面有多届赛季。"""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=100, verbose_name='联赛系列名称')
    cover = models.ImageField(upload_to='league_covers/', blank=True, null=True, verbose_name='封面图')
    logo_asset = models.ForeignKey(
        LeagueImageAsset, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='+', verbose_name='联赛 Logo',
    )
    description = models.TextField(blank=True, default='', verbose_name='描述')
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
        related_name='created_league_series', verbose_name='创建者',
    )
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='创建时间')
    updated_at = models.DateTimeField(auto_now=True, verbose_name='更新时间')

    class Meta:
        db_table = 'league_series'
        ordering = ['-created_at']

    def __str__(self) -> str:
        return self.name


class LeagueSeason(models.Model):
    """一届赛季。开赛前可任意修改；开赛后只能改部分字段（描述等元数据）。"""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    series = models.ForeignKey(
        LeagueSeries, on_delete=models.CASCADE,
        related_name='seasons', verbose_name='联赛系列',
    )
    season_number = models.PositiveIntegerField(verbose_name='届号/期号')
    name = models.CharField(max_length=150, verbose_name='赛季名称')
    cover = models.ImageField(upload_to='league_covers/', blank=True, null=True, verbose_name='封面图')
    description = models.TextField(blank=True, default='', verbose_name='描述(Markdown+Base64图片)')
    start_time = models.DateTimeField(null=True, blank=True, verbose_name='预计开始时间')
    end_time = models.DateTimeField(null=True, blank=True, verbose_name='预计结束时间')
    status = models.CharField(
        max_length=20, choices=LEAGUE_SEASON_STATUS_CHOICES,
        default='registration', verbose_name='状态',
    )
    is_current = models.BooleanField(default=False, verbose_name='是否当前期')
    allow_online = models.BooleanField(default=True, verbose_name='允许线上对局')
    allow_offline = models.BooleanField(default=True, verbose_name='允许线下录入')
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
        related_name='created_league_seasons', verbose_name='创建者',
    )
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='创建时间')
    updated_at = models.DateTimeField(auto_now=True, verbose_name='更新时间')

    class Meta:
        db_table = 'league_seasons'
        ordering = ['-season_number']
        unique_together = ['series', 'season_number']

    def __str__(self) -> str:
        return f'{self.series.name} - {self.name}'

    @property
    def is_locked(self) -> bool:
        """开赛后视为锁定（核心结构不可改），结束后亦锁定。"""
        return self.status != 'registration'


class LeagueStage(models.Model):
    """赛段。报名期可任意改/增/删；开赛后可改非锁定字段（描述类）。"""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    season = models.ForeignKey(
        LeagueSeason, on_delete=models.CASCADE,
        related_name='stages', verbose_name='赛季',
    )
    name = models.CharField(max_length=100, verbose_name='阶段名称')
    stage_type = models.CharField(
        max_length=30, choices=STAGE_TYPE_CHOICES,
        verbose_name='阶段类型',
    )
    status = models.CharField(
        max_length=20, choices=STAGE_STATUS_CHOICES,
        default='pending', verbose_name='阶段状态',
    )
    order = models.PositiveIntegerField(default=0, verbose_name='排序')
    games_per_player = models.PositiveIntegerField(default=8, verbose_name='每人半庄数')
    uma_1st = models.FloatField(default=20, verbose_name='一位马点')
    uma_2nd = models.FloatField(default=10, verbose_name='二位马点')
    uma_3rd = models.FloatField(default=-10, verbose_name='三位马点')
    uma_4th = models.FloatField(default=-20, verbose_name='四位马点')
    base_score = models.FloatField(default=25000, verbose_name='基础分(返点)')
    allow_companion = models.BooleanField(default=False, verbose_name='允许陪打')
    allow_free_table = models.BooleanField(default=True, verbose_name='允许自由约桌')
    record_ranking = models.BooleanField(default=False, verbose_name='记录段位分')
    notes = models.TextField(blank=True, default='', verbose_name='备注')
    promotion_rules = models.JSONField(default=dict, blank=True, verbose_name='晋级规则配置')
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='创建时间')
    updated_at = models.DateTimeField(auto_now=True, verbose_name='更新时间')

    class Meta:
        db_table = 'league_stages'
        ordering = ['order']
        unique_together = ['season', 'order']

    def __str__(self) -> str:
        return f'{self.season.name} - {self.name}'

    def get_uma_list(self) -> list[float]:
        return [self.uma_1st, self.uma_2nd, self.uma_3rd, self.uma_4th]

    @property
    def has_groups(self) -> bool:
        return self.stage_type in ('elimination_1', 'elimination_2', 'elimination_3')


class LeagueSeasonPlayer(models.Model):
    """赛季级别的报名（不区分赛段）。"""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    season = models.ForeignKey(
        LeagueSeason, on_delete=models.CASCADE,
        related_name='season_players', verbose_name='赛季',
    )
    player = models.ForeignKey(
        Player, on_delete=models.CASCADE,
        related_name='league_season_entries', verbose_name='雀士',
    )
    seed_label = models.CharField(
        max_length=10, blank=True, default='', verbose_name='种子签号(半决赛 A~H)',
    )
    joined_at = models.DateTimeField(auto_now_add=True, verbose_name='报名时间')

    class Meta:
        db_table = 'league_season_players'
        unique_together = ['season', 'player']

    def __str__(self) -> str:
        return f'{self.season.name} - {self.player.nickname}'


class LeagueStagePlayer(models.Model):
    """赛段内选手；用于展示分组、累计 PT、晋级状态。"""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    stage = models.ForeignKey(
        LeagueStage, on_delete=models.CASCADE,
        related_name='stage_players', verbose_name='阶段',
    )
    player = models.ForeignKey(
        Player, on_delete=models.CASCADE,
        related_name='league_stage_entries', verbose_name='雀士',
    )
    group_type = models.CharField(
        max_length=20, choices=GROUP_TYPE_CHOICES,
        default='none', verbose_name='分组',
    )
    is_eliminated = models.BooleanField(default=False, verbose_name='是否淘汰')
    is_promoted = models.BooleanField(default=False, verbose_name='是否晋级')
    games_played = models.PositiveIntegerField(default=0, verbose_name='已打半庄数')
    total_pt = models.FloatField(default=0, verbose_name='累计PT')
    rank_in_stage = models.PositiveIntegerField(default=0, verbose_name='当前排名')
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='创建时间')
    updated_at = models.DateTimeField(auto_now=True, verbose_name='更新时间')

    class Meta:
        db_table = 'league_stage_players'
        unique_together = ['stage', 'player']
        ordering = ['-total_pt']

    def __str__(self) -> str:
        return f'{self.stage.name} - {self.player.nickname}'

    @property
    def is_full(self) -> bool:
        return self.games_played >= self.stage.games_per_player


class LeagueMatch(models.Model):
    """联赛对局（一个半庄=一个 LeagueMatch）。"""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    stage = models.ForeignKey(
        LeagueStage, on_delete=models.CASCADE,
        related_name='matches', verbose_name='阶段',
    )
    game = models.OneToOneField(
        'games.Game', on_delete=models.SET_NULL,
        related_name='league_match', null=True, blank=True,
        verbose_name='关联对局',
    )
    match_label = models.CharField(max_length=50, blank=True, default='', verbose_name='对局标签')
    round_index = models.PositiveIntegerField(default=0, verbose_name='半决赛轮次/批次')
    table_index = models.PositiveIntegerField(default=0, verbose_name='桌号')
    scheduled_players = models.JSONField(default=list, blank=True, verbose_name='预设选手ID列表')
    companion_players = models.JSONField(default=list, blank=True, verbose_name='陪打选手ID列表')
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='创建时间')

    class Meta:
        db_table = 'league_matches'
        ordering = ['round_index', 'table_index', 'created_at']

    def __str__(self) -> str:
        return f'{self.stage.name} - Match {self.match_label or self.id}'
