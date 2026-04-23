from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAdminUser
from common.permissions import IsAdminUserOrReadOnly
from .models import UmaConfig, RankTier, PlayerRankingScore
from .serializers import (
    UmaConfigSerializer, RankTierSerializer,
    PlayerRankingScoreSerializer, GameRankingResultSerializer,
)
from .services import (
    settle_game_ranking,
    recalculate_all_rankings,
    get_ranking_leaderboard,
    get_player_ranking,
    calculate_game_ranking_points,
    get_next_tier_info_with_score,
)
from django.db import transaction
from django.shortcuts import get_object_or_404
from apps.players.models import Player
import logging

logger = logging.getLogger(__name__)


class UmaConfigListView(APIView):
    permission_classes = [IsAdminUserOrReadOnly]

    def get(self, request):
        configs = UmaConfig.objects.all()
        serializer = UmaConfigSerializer(configs, many=True)
        return Response(serializer.data)

    def post(self, request):
        serializer = UmaConfigSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class UmaConfigDetailView(APIView):
    permission_classes = [IsAdminUserOrReadOnly]

    def get(self, request, pk):
        config = get_object_or_404(UmaConfig, pk=pk)
        serializer = UmaConfigSerializer(config)
        return Response(serializer.data)

    def put(self, request, pk):
        config = get_object_or_404(UmaConfig, pk=pk)
        serializer = UmaConfigSerializer(config, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def delete(self, request, pk):
        config = get_object_or_404(UmaConfig, pk=pk)
        config.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class RankTierListView(APIView):
    permission_classes = [IsAdminUserOrReadOnly]

    def get(self, request):
        tiers = RankTier.objects.all()
        serializer = RankTierSerializer(tiers, many=True)
        return Response(serializer.data)

    def post(self, request):
        serializer = RankTierSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class RankTierDetailView(APIView):
    permission_classes = [IsAdminUser | AllowAny]

    def get(self, request, pk):
        tier = get_object_or_404(RankTier, pk=pk)
        serializer = RankTierSerializer(tier)
        return Response(serializer.data)

    def put(self, request, pk):
        tier = get_object_or_404(RankTier, pk=pk)
        serializer = RankTierSerializer(tier, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def delete(self, request, pk):
        tier = get_object_or_404(RankTier, pk=pk)
        tier.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class RecalculateRankingView(APIView):
    permission_classes = [IsAdminUser]

    def post(self, request):
        try:
            with transaction.atomic():
                recalculate_all_rankings()
            return Response({'message': '排位分重新结算完成'})
        except Exception as e:
            logger.error(f'重算排位分失败: {e}', exc_info=True)
            return Response({'error': f'重算失败: {str(e)}'}, status=500)


class RankingLeaderboardView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        leaderboard = get_ranking_leaderboard()
        serializer = PlayerRankingScoreSerializer(leaderboard, many=True)
        return Response(serializer.data)


class PlayerRankingView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, pk):
        player = get_object_or_404(Player, pk=pk)
        ranking = get_player_ranking(player)
        if not ranking:
            return Response({
                'player': player.id,
                'tier': None,
                'score': 0,
                'game_count': 0,
                'next_tier': None,
            })
        serializer = PlayerRankingScoreSerializer(ranking)
        data = serializer.data
        data['next_tier'] = get_next_tier_info_with_score(ranking.tier, ranking.score)
        return Response(data)


class GameRankingSettleView(APIView):
    def get(self, request, pk):
        from apps.games.models import Game
        game = get_object_or_404(Game, pk=pk)
        if game.player_count != 4 or game.game_mode != 'half_match':
            return Response({'error': '仅四麻半庄计算排位分'}, status=400)
        points = calculate_game_ranking_points(game)
        return Response(points)


class PlayerGameRankingResultsView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, pk):
        from .models import GameRankingResult
        player = get_object_or_404(Player, pk=pk)
        results = GameRankingResult.objects.filter(player=player).order_by('game__start_time')
        data = {str(r.game_id): GameRankingResultSerializer(r).data for r in results}
        return Response(data)
