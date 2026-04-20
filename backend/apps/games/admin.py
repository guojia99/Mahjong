from django.contrib import admin
from .models import Room, RoomPlayer, Game, GamePlayer


@admin.register(Room)
class RoomAdmin(admin.ModelAdmin):
    list_display = ['name', 'location', 'status', 'created_by', 'created_at']
    list_filter = ['status']


@admin.register(RoomPlayer)
class RoomPlayerAdmin(admin.ModelAdmin):
    list_display = ['room', 'player', 'joined_at']


@admin.register(Game)
class GameAdmin(admin.ModelAdmin):
    list_display = ['id', 'room', 'game_type', 'game_mode', 'start_time', 'created_at']
    list_filter = ['game_type', 'game_mode']


@admin.register(GamePlayer)
class GamePlayerAdmin(admin.ModelAdmin):
    list_display = ['game', 'player', 'seat_number', 'score', 'is_dealer_start']
