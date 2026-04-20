from django.db import models
from django.conf import settings
import uuid


class Player(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    nickname = models.CharField(max_length=50, verbose_name='昵称')
    real_name = models.CharField(max_length=50, blank=True, default='', verbose_name='真实姓名')
    avatar = models.TextField(blank=True, default='', verbose_name='头像(base64)')
    extra_info = models.JSONField(default=dict, blank=True, verbose_name='扩展信息')
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
        related_name='created_players', verbose_name='创建者'
    )
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='创建时间')
    updated_at = models.DateTimeField(auto_now=True, verbose_name='更新时间')

    class Meta:
        db_table = 'players'
        ordering = ['-created_at']

    def __str__(self):
        return self.nickname


class MahjongSoulAccount(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    player = models.ForeignKey(
        Player, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='majsoul_accounts', verbose_name='关联雀士'
    )
    uid = models.BigIntegerField(unique=True, verbose_name='雀魂UID')
    nickname = models.CharField(max_length=50, default='', verbose_name='雀魂昵称')
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='创建时间')

    class Meta:
        db_table = 'mahjong_soul_accounts'
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.nickname}({self.uid})'
