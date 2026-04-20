from django.urls import path
from .views import (
    RoomListView, RoomDetailView, RoomCloseView,
    RoomPlayerListView, RoomPlayerDetailView,
    RoomGameListView,
)

urlpatterns = [
    path('', RoomListView.as_view(), name='room-list'),
    path('<uuid:pk>/', RoomDetailView.as_view(), name='room-detail'),
    path('<uuid:pk>/close/', RoomCloseView.as_view(), name='room-close'),
    path('<uuid:pk>/players/', RoomPlayerListView.as_view(), name='room-players'),
    path('<uuid:pk>/players/<uuid:player_pk>/', RoomPlayerDetailView.as_view(), name='room-player-detail'),
    path('<uuid:pk>/games/', RoomGameListView.as_view(), name='room-games'),
]
