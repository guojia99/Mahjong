from django.contrib import admin
from .models import Player, MahjongSoulAccount


@admin.register(Player)
class PlayerAdmin(admin.ModelAdmin):
    list_display = ['nickname', 'real_name', 'created_by', 'created_at']
    search_fields = ['nickname', 'real_name']


@admin.register(MahjongSoulAccount)
class MahjongSoulAccountAdmin(admin.ModelAdmin):
    list_display = ['uid', 'nickname', 'player', 'created_at']
    search_fields = ['uid', 'nickname']
