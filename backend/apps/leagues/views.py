from __future__ import annotations

import logging

from django.http import Http404, HttpResponse
from django.views import View
from django.shortcuts import get_object_or_404
from django.utils.translation import gettext_lazy as _
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAdminUser
from rest_framework.response import Response
from rest_framework.views import APIView

from common.permissions import IsAdminUserOrReadOnly
from .models import (
    LeagueSeason, LeagueSeries, LeagueStage, LeagueStagePlayer, LeagueMatch,
    LeagueImageAsset,
)
from .serializers import (
    LeagueSeriesSerializer, LeagueSeriesWriteSerializer,
    LeagueSeasonListSerializer, LeagueSeasonDetailSerializer,
    LeagueSeasonWriteSerializer,
    LeagueStageSerializer, LeagueStageWriteSerializer,
    LeagueStagePartialUpdateSerializer,
    LeagueSeasonPlayerSerializer, LeagueStagePlayerSerializer,
    LeagueMatchSerializer,
)
from .services import (
    get_all_series, get_current_seasons,
    get_series_detail, get_season_detail, get_stage_detail,
    create_series, update_series, delete_series,
    create_season, update_season, delete_season,
    register_player, unregister_player, batch_register_players,
    start_season, finish_season, reopen_season,
    create_standard_stages, create_stage, update_stage, delete_stage,
    reorder_stages, start_stage, finish_stage,
    sync_stage_players_from_season,
    add_stage_players, update_stage_player, remove_stage_player,
    get_stage_ranking, recalculate_stage_pt,
    create_league_match, update_league_match, delete_league_match,
    generate_semifinal_matches, apply_stage_promotion,
    create_offline_league_match, import_online_league_match,
    set_series_logo,
)

logger = logging.getLogger(__name__)


def _err(msg: str, code=status.HTTP_400_BAD_REQUEST) -> Response:
    return Response({'error': str(msg)}, status=code)


class LeagueMediaView(View):
    """GET /api/v1/leagues/media/<uuid>/ — 二进制 Logo，文件名即 UUID，便于长期缓存。"""

    def get(self, request, pk):
        asset = LeagueImageAsset.objects.filter(pk=pk).first()
        if not asset:
            raise Http404()
        ct = asset.mime_type or 'application/octet-stream'
        resp = HttpResponse(bytes(asset.data), content_type=ct)
        resp['Cache-Control'] = 'public, max-age=31536000, immutable'
        return resp


class LeagueSeriesLogoUploadView(APIView):
    permission_classes = [IsAdminUser]

    def post(self, request, pk):
        series = get_object_or_404(LeagueSeries, pk=pk)
        f = request.FILES.get('logo') or request.FILES.get('image')
        if not f:
            return Response({'error': str(_('请选择图片文件'))}, status=status.HTTP_400_BAD_REQUEST)
        raw = f.read()
        mime = (getattr(f, 'content_type', None) or '').strip() or 'application/octet-stream'
        try:
            series = set_series_logo(series, raw, mime)
        except ValueError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(LeagueSeriesSerializer(series, context={'request': request}).data)


# ---------------------------------------------------------------------------
# Series
# ---------------------------------------------------------------------------

class LeagueSeriesListView(APIView):
    permission_classes = [IsAdminUserOrReadOnly]

    def get(self, request):
        return Response(
            LeagueSeriesSerializer(get_all_series(), many=True, context={'request': request}).data,
        )

    def post(self, request):
        serializer = LeagueSeriesWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            series = create_series(request.user, serializer.validated_data)
            return Response(
                LeagueSeriesSerializer(series, context={'request': request}).data,
                status=status.HTTP_201_CREATED,
            )
        except Exception as e:
            logger.exception('create series failed')
            return _err(e)


class LeagueSeriesDetailView(APIView):
    permission_classes = [IsAdminUserOrReadOnly]

    def get(self, request, pk):
        return Response(
            LeagueSeriesSerializer(get_series_detail(pk), context={'request': request}).data,
        )

    def put(self, request, pk):
        serializer = LeagueSeriesWriteSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        try:
            series = update_series(pk, serializer.validated_data)
            return Response(
                LeagueSeriesSerializer(series, context={'request': request}).data,
            )
        except ValueError as e:
            return _err(e)

    def delete(self, request, pk):
        try:
            delete_series(pk)
            return Response(status=status.HTTP_204_NO_CONTENT)
        except ValueError as e:
            return _err(e)


class LeagueSeriesSeasonsView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, pk):
        series = get_series_detail(pk)
        return Response(LeagueSeasonListSerializer(series.seasons.all(), many=True).data)


# ---------------------------------------------------------------------------
# Season
# ---------------------------------------------------------------------------

class CurrentSeasonListView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        return Response(LeagueSeasonListSerializer(get_current_seasons(), many=True).data)


class LeagueSeasonListView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        series_id = request.query_params.get('series_id')
        status_filter = request.query_params.get('status')
        qs = LeagueSeason.objects.select_related('series').all()
        if series_id:
            qs = qs.filter(series_id=series_id)
        if status_filter:
            qs = qs.filter(status=status_filter)
        return Response(LeagueSeasonListSerializer(qs, many=True).data)


class LeagueSeasonCreateView(APIView):
    permission_classes = [IsAdminUser]

    def post(self, request, series_id):
        serializer = LeagueSeasonWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            season = create_season(request.user, series_id, serializer.validated_data)
            return Response(LeagueSeasonDetailSerializer(season, context={'request': request}).data, status=status.HTTP_201_CREATED)
        except Exception as e:
            logger.exception('create season failed')
            return _err(e)


class LeagueSeasonDetailView(APIView):
    permission_classes = [IsAdminUserOrReadOnly]

    def get(self, request, pk):
        return Response(LeagueSeasonDetailSerializer(get_season_detail(pk), context={'request': request}).data)

    def put(self, request, pk):
        serializer = LeagueSeasonWriteSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        try:
            season = update_season(pk, serializer.validated_data)
            return Response(LeagueSeasonDetailSerializer(season, context={'request': request}).data)
        except ValueError as e:
            return _err(e)

    def delete(self, request, pk):
        try:
            delete_season(pk)
            return Response(status=status.HTTP_204_NO_CONTENT)
        except ValueError as e:
            return _err(e)


class SeasonStartView(APIView):
    permission_classes = [IsAdminUser]

    def post(self, request, pk):
        try:
            season = start_season(pk)
            return Response(LeagueSeasonDetailSerializer(season, context={'request': request}).data)
        except ValueError as e:
            return _err(e)


class SeasonFinishView(APIView):
    permission_classes = [IsAdminUser]

    def post(self, request, pk):
        try:
            season = finish_season(pk)
            return Response(LeagueSeasonDetailSerializer(season, context={'request': request}).data)
        except ValueError as e:
            return _err(e)


class SeasonReopenView(APIView):
    permission_classes = [IsAdminUser]

    def post(self, request, pk):
        try:
            season = reopen_season(pk)
            return Response(LeagueSeasonDetailSerializer(season, context={'request': request}).data)
        except Exception as e:
            return _err(e)


# ---------------------------------------------------------------------------
# Season players (registration)
# ---------------------------------------------------------------------------

class SeasonPlayersView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, pk):
        season = get_object_or_404(LeagueSeason, pk=pk)
        qs = season.season_players.select_related('player').order_by('joined_at')
        return Response(LeagueSeasonPlayerSerializer(qs, many=True).data)


class SeasonRegisterPlayerView(APIView):
    permission_classes = [IsAdminUser]

    def post(self, request, pk):
        player_id = request.data.get('player_id')
        if not player_id:
            return _err(_('请提供 player_id'))
        try:
            sp = register_player(pk, player_id)
            return Response(LeagueSeasonPlayerSerializer(sp).data, status=status.HTTP_201_CREATED)
        except ValueError as e:
            return _err(e)

    def delete(self, request, pk):
        player_id = request.data.get('player_id')
        if not player_id:
            return _err(_('请提供 player_id'))
        try:
            unregister_player(pk, player_id)
            return Response(status=status.HTTP_204_NO_CONTENT)
        except ValueError as e:
            return _err(e)


class SeasonBatchRegisterView(APIView):
    permission_classes = [IsAdminUser]

    def post(self, request, pk):
        player_ids = request.data.get('player_ids', [])
        try:
            results = batch_register_players(pk, player_ids)
            return Response(LeagueSeasonPlayerSerializer(results, many=True).data,
                            status=status.HTTP_201_CREATED)
        except ValueError as e:
            return _err(e)


# ---------------------------------------------------------------------------
# Stages
# ---------------------------------------------------------------------------

class LeagueStageListView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, season_id):
        season = get_object_or_404(LeagueSeason, pk=season_id)
        return Response(LeagueStageSerializer(season.stages.order_by('order'), many=True, context={'request': request}).data)


class LeagueStageCreateView(APIView):
    permission_classes = [IsAdminUser]

    def post(self, request, season_id):
        serializer = LeagueStageWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            stage = create_stage(season_id, serializer.validated_data)
            return Response(LeagueStageSerializer(stage, context={'request': request}).data, status=status.HTTP_201_CREATED)
        except ValueError as e:
            return _err(e)


class LeagueStageStandardCreateView(APIView):
    """一键创建文档中的标准赛段（只在报名期可用）。"""
    permission_classes = [IsAdminUser]

    def post(self, request, season_id):
        try:
            stages = create_standard_stages(season_id)
            return Response(LeagueStageSerializer(stages, many=True, context={'request': request}).data,
                            status=status.HTTP_201_CREATED)
        except ValueError as e:
            return _err(e)


class LeagueStageReorderView(APIView):
    permission_classes = [IsAdminUser]

    def post(self, request, season_id):
        ordered_ids = request.data.get('ordered_ids') or []
        try:
            stages = reorder_stages(season_id, ordered_ids)
            return Response(LeagueStageSerializer(stages, many=True, context={'request': request}).data)
        except ValueError as e:
            return _err(e)


class LeagueStageDetailView(APIView):
    permission_classes = [IsAdminUserOrReadOnly]

    def get(self, request, pk):
        return Response(LeagueStageSerializer(get_stage_detail(pk), context={'request': request}).data)

    def put(self, request, pk):
        serializer = LeagueStagePartialUpdateSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        try:
            stage = update_stage(pk, serializer.validated_data)
            return Response(LeagueStageSerializer(stage, context={'request': request}).data)
        except ValueError as e:
            return _err(e)

    def delete(self, request, pk):
        try:
            delete_stage(pk)
            return Response(status=status.HTTP_204_NO_CONTENT)
        except ValueError as e:
            return _err(e)


class StageStartView(APIView):
    permission_classes = [IsAdminUser]

    def post(self, request, pk):
        try:
            stage = start_stage(pk)
            return Response(LeagueStageSerializer(stage, context={'request': request}).data)
        except ValueError as e:
            return _err(e)


class StageFinishView(APIView):
    permission_classes = [IsAdminUser]

    def post(self, request, pk):
        try:
            stage = finish_stage(pk)
            return Response(LeagueStageSerializer(stage, context={'request': request}).data)
        except ValueError as e:
            return _err(e)


class StageRankingView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, pk):
        return Response(LeagueStagePlayerSerializer(get_stage_ranking(pk), many=True).data)


class StageRecalculateView(APIView):
    permission_classes = [IsAdminUser]

    def post(self, request, pk):
        try:
            ranking = recalculate_stage_pt(pk)
            return Response(LeagueStagePlayerSerializer(ranking, many=True).data)
        except Exception as e:
            return _err(e)


class StagePromoteView(APIView):
    permission_classes = [IsAdminUser]

    def post(self, request, pk):
        try:
            apply_stage_promotion(pk)
            ranking = get_stage_ranking(pk)
            return Response(LeagueStagePlayerSerializer(ranking, many=True).data)
        except ValueError as e:
            return _err(e)


# ---------------------------------------------------------------------------
# Stage players
# ---------------------------------------------------------------------------

class StagePlayersView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, pk):
        stage = get_object_or_404(LeagueStage, pk=pk)
        qs = stage.stage_players.select_related('player').order_by('group_type', 'rank_in_stage')
        return Response(LeagueStagePlayerSerializer(qs, many=True).data)


class StagePlayersSyncView(APIView):
    permission_classes = [IsAdminUser]

    def post(self, request, pk):
        try:
            results = sync_stage_players_from_season(pk)
            return Response(LeagueStagePlayerSerializer(results, many=True).data,
                            status=status.HTTP_201_CREATED)
        except Exception as e:
            return _err(e)


class StagePlayersManageView(APIView):
    permission_classes = [IsAdminUser]

    def post(self, request, pk):
        players = request.data.get('players', [])
        try:
            results = add_stage_players(pk, players)
            return Response(LeagueStagePlayerSerializer(results, many=True).data,
                            status=status.HTTP_201_CREATED)
        except Exception as e:
            return _err(e)

    def put(self, request, pk):
        sp_id = request.data.get('stage_player_id')
        if not sp_id:
            return _err(_('请提供 stage_player_id'))
        try:
            sp = update_stage_player(sp_id, request.data)
            return Response(LeagueStagePlayerSerializer(sp).data)
        except Exception as e:
            return _err(e)

    def delete(self, request, pk):
        sp_id = request.data.get('stage_player_id')
        if not sp_id:
            return _err(_('请提供 stage_player_id'))
        try:
            remove_stage_player(sp_id)
            return Response(status=status.HTTP_204_NO_CONTENT)
        except ValueError as e:
            return _err(e)


# ---------------------------------------------------------------------------
# Matches
# ---------------------------------------------------------------------------

class StageMatchListView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, pk):
        stage = get_object_or_404(LeagueStage, pk=pk)
        qs = stage.matches.select_related('game').order_by('round_index', 'table_index', 'created_at')
        return Response(LeagueMatchSerializer(qs, many=True, context={'request': request}).data)


class StageMatchCreateView(APIView):
    permission_classes = [IsAdminUser]

    def post(self, request, pk):
        try:
            match = create_league_match(pk, request.data)
            return Response(LeagueMatchSerializer(match).data, status=status.HTTP_201_CREATED)
        except ValueError as e:
            return _err(e)


class StageMatchDetailView(APIView):
    permission_classes = [IsAdminUserOrReadOnly]

    def get(self, request, match_pk):
        return Response(LeagueMatchSerializer(get_object_or_404(LeagueMatch, pk=match_pk)).data)

    def put(self, request, match_pk):
        try:
            match = update_league_match(match_pk, request.data)
            return Response(LeagueMatchSerializer(match).data)
        except Exception as e:
            return _err(e)

    def delete(self, request, match_pk):
        try:
            delete_league_match(match_pk)
            return Response(status=status.HTTP_204_NO_CONTENT)
        except Exception as e:
            return _err(e)


class StageGenerateSemifinalView(APIView):
    permission_classes = [IsAdminUser]

    def post(self, request, pk):
        try:
            matches = generate_semifinal_matches(pk)
            return Response(LeagueMatchSerializer(matches, many=True).data,
                            status=status.HTTP_201_CREATED)
        except ValueError as e:
            return _err(e)


class StageMatchOfflineCreateView(APIView):
    """联赛线下对局录入：直接创建 Game + LeagueMatch。"""
    permission_classes = [IsAdminUser]

    def post(self, request, pk):
        data = request.data
        scheduled_player_ids = data.get('scheduled_players') or []
        scores = data.get('scores')  # 可选 [{player_id, score, is_dealer_start, seat_number}]
        try:
            match = create_offline_league_match(
                request.user, pk,
                scheduled_player_ids=scheduled_player_ids,
                scores=scores,
                start_time=data.get('start_time') or None,
                end_time=data.get('end_time') or None,
                game_mode=data.get('game_mode', 'half_match'),
                match_label=data.get('match_label', ''),
                round_index=int(data.get('round_index') or 0),
                table_index=int(data.get('table_index') or 0),
                companion_players=data.get('companion_players') or [],
            )
            return Response(LeagueMatchSerializer(match).data, status=status.HTTP_201_CREATED)
        except ValueError as e:
            return _err(e)
        except Exception as e:  # pragma: no cover
            logger.exception('线下录入联赛对局失败')
            return _err(str(e), code=status.HTTP_500_INTERNAL_SERVER_ERROR)


class StageMatchOnlineImportView(APIView):
    """联赛线上对局录入：粘贴牌谱 URL → 自动识别选手 → 创建 Game + LeagueMatch。"""
    permission_classes = [IsAdminUser]

    def post(self, request, pk):
        data = request.data
        source_url = (data.get('source_url') or '').strip()
        if not source_url:
            return _err(_('请提供牌谱链接'))
        try:
            match = import_online_league_match(
                request.user, pk, source_url,
                allow_duplicate_url=bool(data.get('allow_duplicate_url', False)),
                match_label=data.get('match_label', ''),
                round_index=int(data.get('round_index') or 0),
                table_index=int(data.get('table_index') or 0),
                companion_players=data.get('companion_players') or [],
            )
            return Response(LeagueMatchSerializer(match).data, status=status.HTTP_201_CREATED)
        except ValueError as e:
            return _err(e)
        except Exception as e:  # pragma: no cover
            logger.exception('线上录入联赛对局失败')
            return _err(str(e), code=status.HTTP_500_INTERNAL_SERVER_ERROR)
