from django.db import models
import uuid


class UmaConfig(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=50, verbose_name='场次名称', unique=True)
    player_count = models.SmallIntegerField(verbose_name='人数(3三麻/4四麻)', default=4)
    game_mode = models.CharField(max_length=20, verbose_name='对局模式', default='half_match')
    uma_1st = models.FloatField(verbose_name='一位马点', default=30)
    uma_2nd = models.FloatField(verbose_name='二位马点', default=10)
    uma_3rd = models.FloatField(verbose_name='三位马点', default=-10)
    uma_4th = models.FloatField(verbose_name='四位马点', default=-30)
    base_score = models.FloatField(verbose_name='基础分(返点)', default=250)
    is_active = models.BooleanField(verbose_name='是否启用', default=True)
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='创建时间')
    updated_at = models.DateTimeField(auto_now=True, verbose_name='更新时间')

    class Meta:
        db_table = 'uma_configs'
        ordering = ['player_count', 'game_mode']

    def __str__(self):
        return self.name

    def get_uma_list(self):
        if self.player_count == 3:
            return [self.uma_1st, self.uma_2nd, self.uma_3rd]
        return [self.uma_1st, self.uma_2nd, self.uma_3rd, self.uma_4th]


class RankTier(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=50, verbose_name='等级名称', unique=True)
    level_order = models.IntegerField(verbose_name='等级顺序', unique=True)
    initial_score = models.FloatField(verbose_name='初始分', default=0)
    promotion_score = models.FloatField(verbose_name='升级所需pt', default=0)
    dajiang_score = models.FloatField(verbose_name='打点分', default=10)
    fourth_penalty = models.FloatField(verbose_name='第四额外扣点', default=0)
    is_protected = models.BooleanField(verbose_name='是否保护段(不掉段)', default=False)
    bg_color = models.CharField(max_length=20, verbose_name='背景颜色', default='#8e8e8e')
    bg_gradient = models.CharField(max_length=100, verbose_name='渐变色', blank=True, default='')
    description = models.CharField(max_length=200, verbose_name='段位描述', blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='创建时间')
    updated_at = models.DateTimeField(auto_now=True, verbose_name='更新时间')

    class Meta:
        db_table = 'rank_tiers'
        ordering = ['level_order']

    def __str__(self):
        return f'{self.name} (Lv.{self.level_order})'


class PlayerRankingScore(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    player = models.ForeignKey(
        'players.Player', on_delete=models.CASCADE,
        related_name='ranking_scores', verbose_name='雀士'
    )
    tier = models.ForeignKey(RankTier, on_delete=models.SET_NULL, null=True, related_name='player_scores', verbose_name='当前段位')
    score = models.FloatField(verbose_name='当前排位分', default=0)
    game_count = models.IntegerField(verbose_name='对局数', default=0)
    updated_at = models.DateTimeField(auto_now=True, verbose_name='更新时间')

    class Meta:
        db_table = 'player_ranking_scores'
        unique_together = ['player']

    def __str__(self):
        tier_name = self.tier.name if self.tier else '无'
        return f'{self.player.nickname} - {tier_name} ({self.score})'


class GameRankingResult(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    game = models.ForeignKey(
        'games.Game', on_delete=models.CASCADE,
        related_name='ranking_results', verbose_name='对局'
    )
    player = models.ForeignKey(
        'players.Player', on_delete=models.CASCADE,
        related_name='game_ranking_results', verbose_name='雀士'
    )
    rank = models.IntegerField(verbose_name='顺位')
    delta = models.FloatField(verbose_name='排位分变化')
    old_tier_name = models.CharField(max_length=50, verbose_name='旧段位')
    new_tier_name = models.CharField(max_length=50, verbose_name='新段位')
    old_score = models.FloatField(verbose_name='旧排位分')
    new_score = models.FloatField(verbose_name='新排位分')
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='创建时间')

    class Meta:
        db_table = 'game_ranking_results'
        unique_together = ['game', 'player']

    def __str__(self):
        return f'{self.game.id} - {self.player.nickname} ({self.delta:+.1f})'
