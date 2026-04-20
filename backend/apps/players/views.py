from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from common.permissions import IsAdminUserOrReadOnly
from django.shortcuts import get_object_or_404
from .models import Player, MahjongSoulAccount
from apps.games.models import Game, GamePlayer
from apps.games.serializers import GameListSerializer
from .serializers import (
    PlayerListSerializer, PlayerDetailSerializer,
    PlayerCreateSerializer, PlayerUpdateSerializer,
    MahjongSoulAccountSerializer, MahjongSoulAccountCreateSerializer,
)
from .services import PlayerService


class PlayerListView(APIView):
    permission_classes = [IsAdminUserOrReadOnly]

    def get(self, request):
        query = request.query_params.get('q', '')
        players = PlayerService.search_players(query)
        serializer = PlayerListSerializer(players, many=True)
        return Response(serializer.data)

    def post(self, request):
        serializer = PlayerCreateSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        player = PlayerService.create_player(request.user, **serializer.validated_data)
        return Response(PlayerDetailSerializer(player).data, status=status.HTTP_201_CREATED)


class PlayerDetailView(APIView):
    permission_classes = [IsAdminUserOrReadOnly]

    def get(self, request, pk):
        player = get_object_or_404(Player, pk=pk)
        serializer = PlayerDetailSerializer(player)
        return Response(serializer.data)

    def put(self, request, pk):
        player = get_object_or_404(Player, pk=pk)
        serializer = PlayerUpdateSerializer(player, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        player = PlayerService.update_player(player, **serializer.validated_data)
        return Response(PlayerDetailSerializer(player).data)

    def delete(self, request, pk):
        player = get_object_or_404(Player, pk=pk)
        PlayerService.delete_player(player)
        return Response(status=status.HTTP_204_NO_CONTENT)


class PlayerMajsoulAccountListView(APIView):
    permission_classes = [IsAdminUserOrReadOnly]

    def get(self, request, pk):
        player = get_object_or_404(Player, pk=pk)
        accounts = player.majsoul_accounts.all()
        serializer = MahjongSoulAccountSerializer(accounts, many=True)
        return Response(serializer.data)

    def post(self, request, pk):
        player = get_object_or_404(Player, pk=pk)
        serializer = MahjongSoulAccountCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        account = PlayerService.add_majsoul_account(player, **serializer.validated_data)
        return Response(MahjongSoulAccountSerializer(account).data, status=status.HTTP_201_CREATED)


class MajsoulAccountDetailView(APIView):
    permission_classes = [IsAdminUserOrReadOnly]

    def delete(self, request, account_pk):
        account = get_object_or_404(MahjongSoulAccount, pk=account_pk)
        PlayerService.remove_majsoul_account(account)
        return Response(status=status.HTTP_204_NO_CONTENT)


class PlayerGamesView(APIView):
    permission_classes = [IsAdminUserOrReadOnly]

    def get(self, request, pk):
        player = get_object_or_404(Player, pk=pk)
        game_ids = GamePlayer.objects.filter(
            player=player, score__isnull=False
        ).values_list('game_id', flat=True)
        games = Game.objects.filter(
            id__in=game_ids
        ).prefetch_related('game_players__player').order_by('-start_time')
        serializer = GameListSerializer(games, many=True)
        return Response(serializer.data)
