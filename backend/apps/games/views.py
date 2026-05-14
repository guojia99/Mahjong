import random
import logging
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from django.db.models import Min, Max, DateTimeField
from django.db.models.functions import Coalesce
from django.shortcuts import get_object_or_404
from common.permissions import IsAdminUserOrReadOnly
from .models import Room, Game, GamePlayer, HandRecord
from .serializers import (
    RoomListSerializer, RoomDetailSerializer, RoomCreateSerializer,
    RoomPlayerSerializer, GameListSerializer, GameDetailSerializer,
    GameCreateSerializer, GameUpdateSerializer, ScoreSubmitSerializer,
    HandRecordCreateSerializer, HandRecordListSerializer,
    OnlineGameImportSerializer,
    paipu_data_flags,
)
from .services import (
    RoomService,
    GameService,
    HandRecordService,
    calculate_pt,
    annotate_serialized_games_with_pt,
    game_detail_with_pt,
    fun_ranking_paipu_aggregates,
    _paipu_dedupe_key,
    paipu_stats_build_rank_items,
    PAIPU_STATS_RANK_TYPES,
)
from .starting_hands import extract_starting_hands_from_game
from common.exceptions import BusinessException
from django.utils.translation import gettext_lazy as _
from apps.players.models import Player, MahjongSoulAccount

logger = logging.getLogger(__name__)


class RoomListView(APIView):
    permission_classes = [IsAdminUserOrReadOnly]

    def get(self, request):
        status_filter = request.query_params.get('status')
        room_type = request.query_params.get('room_type')
        rooms = Room.objects.all()
        if status_filter:
            rooms = rooms.filter(status=status_filter)
        if room_type in ('offline', 'online'):
            rooms = rooms.filter(room_type=room_type)
        # 有场次时间按场次，否则按创建时间；与列表时间含义一致
        rooms = (
            rooms.prefetch_related('room_players__player')
            .annotate(
                sort_time=Coalesce('session_time', 'created_at', output_field=DateTimeField()),
                earliest_game_time=Min('games__start_time'),
                latest_game_time=Max('games__start_time'),
            )
            .order_by('-sort_time', '-created_at')
        )
        serializer = RoomListSerializer(rooms, many=True)
        return Response(serializer.data)

    def post(self, request):
        serializer = RoomCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        room = RoomService.create_room(request.user, **serializer.validated_data)
        return Response(RoomDetailSerializer(room).data, status=status.HTTP_201_CREATED)


class RoomDetailView(APIView):
    permission_classes = [IsAdminUserOrReadOnly]

    def get(self, request, pk):
        room = get_object_or_404(Room, pk=pk)
        serializer = RoomDetailSerializer(room)
        return Response(serializer.data)

    def put(self, request, pk):
        room = get_object_or_404(Room, pk=pk)
        serializer = RoomCreateSerializer(room, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        for key, value in serializer.validated_data.items():
            setattr(room, key, value)
        room.save()
        return Response(RoomDetailSerializer(room).data)

    def delete(self, request, pk):
        room = get_object_or_404(Room, pk=pk)
        if room.games.exists():
            raise BusinessException(_('该房间存在对局记录，无法删除'))
        room.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class RoomCloseView(APIView):
    permission_classes = [IsAdminUserOrReadOnly]

    def post(self, request, pk):
        room = get_object_or_404(Room, pk=pk)
        room = RoomService.close_room(room)
        return Response(RoomDetailSerializer(room).data)


class RoomPlayerListView(APIView):
    permission_classes = [IsAdminUserOrReadOnly]

    def get(self, request, pk):
        room = get_object_or_404(Room, pk=pk)
        players = room.room_players.select_related('player').all()
        serializer = RoomPlayerSerializer(players, many=True)
        return Response(serializer.data)

    def post(self, request, pk):
        room = get_object_or_404(Room, pk=pk)
        player_id = request.data.get('player_id')
        player = get_object_or_404(Player, pk=player_id)
        rp = RoomService.add_player(room, player)
        return Response(RoomPlayerSerializer(rp).data, status=status.HTTP_201_CREATED)


class RoomPlayerDetailView(APIView):
    permission_classes = [IsAdminUserOrReadOnly]

    def delete(self, request, pk, player_pk):
        room = get_object_or_404(Room, pk=pk)
        player = get_object_or_404(Player, pk=player_pk)
        RoomService.remove_player(room, player)
        return Response(status=status.HTTP_204_NO_CONTENT)


class RoomGameListView(APIView):
    permission_classes = [IsAdminUserOrReadOnly]

    def get(self, request, pk):
        room = get_object_or_404(Room, pk=pk)
        games = room.games.prefetch_related('game_players__player').select_related(
            'league_match__stage__season__series__logo_asset',
        ).annotate(
            sort_time=Coalesce('end_time', 'start_time', output_field=DateTimeField()),
        ).order_by('-sort_time', '-created_at')
        serializer = GameListSerializer(games, many=True, context={'request': request})
        data = serializer.data
        annotate_serialized_games_with_pt(games, data)
        return Response(data)

    def post(self, request, pk):
        room = get_object_or_404(Room, pk=pk)
        if room.status == 'closed':
            return Response({'error': _('房间已关闭，无法新增对局')}, status=400)
        copy_from = request.data.get('copy_from')
        if copy_from:
            from_game = get_object_or_404(Game, pk=copy_from)
            player_ids = [str(gp.player_id) for gp in from_game.game_players.all()]
            game = GameService.create_game_from_room(
                room, request.user, player_ids,
                game_mode=from_game.game_mode,
                start_time=str(from_game.start_time)[:16],
            )
        else:
            serializer = GameCreateSerializer(data=request.data)
            serializer.is_valid(raise_exception=True)
            game = GameService.create_game_from_room(
                room, request.user, serializer.validated_data.pop('player_ids'),
                **serializer.validated_data
            )
        return Response(game_detail_with_pt(game, request), status=status.HTTP_201_CREATED)


class GameListView(APIView):
    permission_classes = [IsAdminUserOrReadOnly]

    def get(self, request):
        games = Game.objects.filter(
            game_players__score__isnull=False
        ).distinct().prefetch_related(
            'game_players__player', 'hand_records__player'
        ).select_related('room', 'league_match__stage__season__series__logo_asset')

        player_count = request.query_params.get('player_count')
        if player_count:
            games = games.filter(player_count=int(player_count))

        game_mode = request.query_params.get('game_mode')
        if game_mode:
            games = games.filter(game_mode=game_mode)

        game_type = request.query_params.get('game_type')
        if game_type:
            games = games.filter(game_type=game_type)

        league = (request.query_params.get('league') or '').strip().lower()
        if league in ('1', 'true', 'yes'):
            games = games.filter(league_match__isnull=False)
        elif league in ('0', 'false', 'no'):
            games = games.filter(league_match__isnull=True)

        games = games.annotate(
            sort_time=Coalesce('end_time', 'start_time', 'room__session_time', 'created_at', output_field=DateTimeField()),
        ).order_by('-sort_time', '-created_at')

        try:
            page = int(request.query_params.get('page', '1'))
        except (TypeError, ValueError):
            page = 1
        try:
            page_size = int(request.query_params.get('page_size', '20'))
        except (TypeError, ValueError):
            page_size = 20
        page = max(1, page)
        page_size = min(max(1, page_size), 100)

        total = games.count()
        start = (page - 1) * page_size
        page_qs = games[start : start + page_size]

        serializer = GameListSerializer(page_qs, many=True, context={'request': request})
        data = serializer.data
        annotate_serialized_games_with_pt(page_qs, data)
        return Response({
            'count': total,
            'page': page,
            'page_size': page_size,
            'results': data,
        })


class GameDetailView(APIView):
    permission_classes = [IsAdminUserOrReadOnly]

    def get(self, request, pk):
        game = get_object_or_404(Game, pk=pk)
        return Response(game_detail_with_pt(game, request))

    def put(self, request, pk):
        game = get_object_or_404(Game, pk=pk)
        serializer = GameUpdateSerializer(game, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        game = GameService.update_game(game, **serializer.validated_data)
        return Response(game_detail_with_pt(game, request))

    def delete(self, request, pk):
        game = get_object_or_404(Game, pk=pk)
        game.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class GameScoreView(APIView):
    permission_classes = [IsAdminUserOrReadOnly]

    def put(self, request, pk):
        game = get_object_or_404(Game, pk=pk)
        serializer = ScoreSubmitSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        game = GameService.submit_scores(game, serializer.validated_data['scores'])
        return Response(game_detail_with_pt(game, request))


class GamePlayerUpdateView(APIView):
    permission_classes = [IsAdminUserOrReadOnly]

    def put(self, request, pk):
        game = get_object_or_404(Game, pk=pk)
        player_ids = request.data.get('player_ids', [])
        game = GameService.update_game_players(game, player_ids)
        return Response(game_detail_with_pt(game, request))


class GameShuffleSeatsView(APIView):
    permission_classes = [IsAdminUserOrReadOnly]

    def post(self, request, pk):
        game = get_object_or_404(Game, pk=pk)
        if game.is_scored:
            return Response({'error': _('对局已录分，无法调整席次')}, status=400)
        gps = list(game.game_players.all())
        seats = list(range(len(gps)))
        random.shuffle(seats)
        for i, gp in enumerate(gps):
            gp.seat_number = -(i + 1)
            gp.save()
        for gp, seat in zip(gps, seats):
            gp.seat_number = seat
            gp.save()
        return Response(game_detail_with_pt(game, request))


class OnlineGameParseView(APIView):
    permission_classes = [IsAdminUserOrReadOnly]

    def get(self, request):
        from services.majsoul import analyze_paipu_url, normalize_paipu_input_url

        raw = request.query_params.get('url', '')
        source_url = normalize_paipu_input_url(raw)
        if not source_url:
            return Response({'error': _('请提供牌谱链接（需包含 https:// 或 http://）')}, status=400)

        try:
            result = analyze_paipu_url(source_url)
        except Exception as e:
            logger.error(f"解析牌谱失败: {e}", exc_info=True)
            return Response({'error': str(_('解析牌谱失败: %(e)s') % {'e': str(e)})}, status=500)

        if not result:
            return Response({'error': _('未找到牌谱数据，请检查链接是否有效')}, status=404)

        uid_list = [p['uid'] for p in result['players']]
        bound_accounts = MahjongSoulAccount.objects.filter(uid__in=uid_list).select_related('player')
        uid_to_account = {acc.uid: acc for acc in bound_accounts}

        players_info = []
        for p in result['players']:
            account = uid_to_account.get(p['uid'])
            players_info.append({
                'seat': p['seat'],
                'uid': p['uid'],
                'nickname': p['nickname'],
                'score': p['score'],
                'player_id': str(account.player_id) if account and account.player_id else None,
                'account_id': str(account.id) if account else None,
                'is_bound': bool(account and account.player_id),
            })

        duplicate_in_db = Game.objects.filter(game_type='online', source_url=source_url).exists()

        return Response({
            'uuid': result['uuid'],
            'start_time': result['start_time'],
            'end_time': result.get('end_time', ''),
            'game_mode': result['game_mode'],
            'player_count': result['player_count'],
            'players': players_info,
            'source_url': source_url,
            'duplicate_in_db': duplicate_in_db,
            'raw_data': result.get('raw_data', {}),
        })


class OnlineGameParseBatchView(APIView):
    """批量解析牌谱（每行一链接，顺序与请求一致）。"""
    permission_classes = [IsAdminUserOrReadOnly]

    def post(self, request):
        urls = request.data.get('urls')
        if not isinstance(urls, list) or not urls:
            return Response({'error': str(_('请提供 urls 数组'))}, status=400)
        from services.majsoul import analyze_paipu_url, normalize_paipu_input_url

        results = []
        for u in urls:
            line = (u or '').strip() if isinstance(u, str) else ''
            if not line:
                results.append({'source_url': '', 'ok': False, 'error': str(_('空行'))})
                continue
            normalized = normalize_paipu_input_url(line)
            if not normalized:
                results.append({'source_url': line, 'ok': False, 'error': str(_('未识别到有效的 http(s) 牌谱链接'))})
                continue
            try:
                result = analyze_paipu_url(normalized)
                uid_list = [p['uid'] for p in result['players']]
                bound_accounts = MahjongSoulAccount.objects.filter(uid__in=uid_list).select_related('player')
                uid_to_account = {acc.uid: acc for acc in bound_accounts}
                players_info = []
                for p in result['players']:
                    account = uid_to_account.get(p['uid'])
                    players_info.append({
                        'seat': p['seat'],
                        'uid': p['uid'],
                        'nickname': p['nickname'],
                        'score': p['score'],
                        'player_id': str(account.player_id) if account and account.player_id else None,
                        'account_id': str(account.id) if account else None,
                        'is_bound': bool(account and account.player_id),
                    })
                duplicate_in_db = Game.objects.filter(game_type='online', source_url=normalized).exists()
                results.append({
                    'source_url': normalized,
                    'ok': True,
                    'duplicate_in_db': duplicate_in_db,
                    'data': {
                        'uuid': result['uuid'],
                        'start_time': result['start_time'],
                        'end_time': result.get('end_time', ''),
                        'game_mode': result['game_mode'],
                        'player_count': result['player_count'],
                        'players': players_info,
                        'source_url': normalized,
                        'raw_data': result.get('raw_data', {}),
                    },
                })
            except Exception as e:
                logger.warning('批量解析行失败: %s %s', normalized, e)
                results.append({'source_url': normalized, 'ok': False, 'error': str(e)})

        return Response({'results': results})


class OnlineGameImportView(APIView):
    permission_classes = [IsAdminUserOrReadOnly]

    def post(self, request):
        serializer = OnlineGameImportSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        room_id = data['room_id']
        room = get_object_or_404(Room, pk=room_id)
        if room.room_type != 'online':
            return Response({'error': str(_('请选择「线上场」房间'))}, status=400)
        if room.status != 'open':
            return Response({'error': str(_('房间已关闭，无法导入'))}, status=400)

        from services.majsoul import normalize_paipu_input_url

        source_url = normalize_paipu_input_url(data.get('source_url', '') or '')
        allow_duplicate_url = bool(data.get('allow_duplicate_url', False))
        player_data = data.get('player_data', [])
        game_mode = data.get('game_mode', 'half_match')
        player_count = data.get('player_count', len(player_data))
        paipu_data = data.get('paipu_data', {}) or {}
        start_time = data.get('start_time')
        end_time = data.get('end_time')

        if source_url:
            exists = Game.objects.filter(game_type='online', source_url=source_url).exists()
            if exists and not allow_duplicate_url:
                return Response(
                    {
                        'error': str(_('该牌谱链接已在系统中存在对局。若仍要再导入一条记录，请在导入页勾选「仍导入本条」后重试。')),
                    },
                    status=400,
                )

        try:
            game = GameService.create_online_game(
                request.user, source_url, player_data, room, game_mode=game_mode, player_count=player_count,
                paipu_data=paipu_data, start_time=start_time, end_time=end_time,
            )
        except Exception as e:
            return Response({'error': str(e)}, status=400)

        return Response(game_detail_with_pt(game, request), status=status.HTTP_201_CREATED)


class BindMajsoulAccountView(APIView):
    permission_classes = [IsAdminUserOrReadOnly]

    def post(self, request):
        from apps.players.services import PlayerService
        from apps.players.serializers import MahjongSoulAccountSerializer

        account_id = request.data.get('account_id')
        player_id = request.data.get('player_id')
        if not account_id or not player_id:
            return Response({'error': str(_('请提供account_id和player_id'))}, status=400)

        try:
            player = Player.objects.get(pk=player_id)
        except Player.DoesNotExist:
            return Response({'error': str(_('雀士不存在'))}, status=404)

        try:
            account = PlayerService.bind_majsoul_account(account_id, player)
        except Exception as e:
            return Response({'error': str(e)}, status=400)

        return Response(MahjongSoulAccountSerializer(account).data)


class UnboundMajsoulAccountsView(APIView):
    permission_classes = [IsAdminUserOrReadOnly]

    def get(self, request):
        from apps.players.serializers import MahjongSoulAccountSerializer
        uid_list = request.query_params.getlist('uid')
        if not uid_list:
            return Response([])

        accounts = MahjongSoulAccount.objects.filter(
            uid__in=[int(u) for u in uid_list],
            player__isnull=True,
        )
        serializer = MahjongSoulAccountSerializer(accounts, many=True)
        return Response(serializer.data)


class HandRecordListView(APIView):
    permission_classes = [IsAdminUserOrReadOnly]

    def get(self, request, pk):
        game = get_object_or_404(Game, pk=pk)
        records = HandRecordService.get_game_hand_records(game)
        serializer = HandRecordListSerializer(records, many=True)
        return Response(serializer.data)

    def post(self, request, pk):
        game = get_object_or_404(Game, pk=pk)
        serializer = HandRecordCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        record = HandRecordService.create_hand_record(game, **serializer.validated_data)
        return Response(HandRecordListSerializer(record).data, status=status.HTTP_201_CREATED)


class HandRecordDetailView(APIView):
    permission_classes = [IsAdminUserOrReadOnly]

    def delete(self, request, pk, record_pk):
        record = get_object_or_404(HandRecord, pk=record_pk, game_id=pk)
        HandRecordService.delete_hand_record(record)
        return Response(status=status.HTTP_204_NO_CONTENT)


class PlayerStatsView(APIView):
    permission_classes = [IsAdminUserOrReadOnly]

    def get(self, request, pk):
        player = get_object_or_404(Player, pk=pk)
        player_count = request.query_params.get('player_count')
        game_mode = request.query_params.get('game_mode')
        game_type = request.query_params.get('game_type')
        try:
            recent_limit = int(request.query_params.get('recent_limit', '50'))
        except (TypeError, ValueError):
            recent_limit = 50
        if recent_limit not in (10, 20, 50, 100):
            recent_limit = 50

        gps = GamePlayer.objects.filter(
            player=player, score__isnull=False
        ).select_related('game__room').order_by(
            '-game__end_time', '-game__start_time', '-game__room__session_time', '-game__created_at'
        )

        if player_count:
            gps = gps.filter(game__player_count=int(player_count))
        if game_mode:
            gps = gps.filter(game__game_mode=game_mode)
        if game_type in ('offline', 'online'):
            gps = gps.filter(game__game_type=game_type)

        total_games = gps.count()
        if total_games == 0:
            return Response({
                'total_games': 0,
                'total_pt': 0,
                'rank_distribution': {},
                'recent_ranking': [],
                'recent_series': [],
            })

        rank_distribution = {1: 0, 2: 0, 3: 0, 4: 0}
        total_pt = 0
        rows = []

        for gp in gps:
            game = gp.game
            all_gps = list(game.game_players.filter(score__isnull=False).order_by('-score'))
            ranked = sorted(all_gps, key=lambda x: x.score, reverse=True)
            rank = next((i + 1 for i, g in enumerate(ranked) if g.player_id == player.id), len(ranked))

            if rank in rank_distribution:
                rank_distribution[rank] += 1

            pt = calculate_pt(game)
            player_pt = pt.get(str(player.id), 0)
            total_pt += player_pt

            rows.append({
                'game_id': str(game.id),
                'start_time': game.start_time.strftime('%Y-%m-%d %H:%M') if game.start_time else '',
                'rank': rank,
                'pt': player_pt,
                'score': gp.score,
                'player_count': game.player_count,
                'game_mode': game.game_mode,
                'game_type': game.game_type,
            })

        rank_rates = {}
        for rank, count in rank_distribution.items():
            rank_rates[f'{rank}'] = round(count / total_games * 100, 1) if total_games > 0 else 0

        recent_slice = rows[:recent_limit]
        recent_ranking = recent_slice

        chronological = list(reversed(recent_slice))
        recent_series = []
        cum = 0.0
        for idx, r in enumerate(chronological):
            cum += float(r['pt'])
            recent_series.append({
                **r,
                'game_index': idx,
                'cumulative_pt': round(cum, 2),
            })

        return Response({
            'total_games': total_games,
            'total_pt': total_pt,
            'rank_distribution': rank_rates,
            'recent_ranking': recent_ranking,
            'recent_series': recent_series,
        })


class PtRankingView(APIView):
    permission_classes = [IsAdminUserOrReadOnly]

    def get(self, request):
        player_count = request.query_params.get('player_count')
        game_mode = request.query_params.get('game_mode')

        games = Game.objects.filter(
            game_players__score__isnull=False
        ).distinct().prefetch_related('game_players__player').select_related('room')

        if player_count:
            games = games.filter(player_count=int(player_count))
        if game_mode:
            games = games.filter(game_mode=game_mode)
        game_type = request.query_params.get('game_type')
        if game_type in ('offline', 'online'):
            games = games.filter(game_type=game_type)

        games = games.annotate(
            sort_time=Coalesce('end_time', 'start_time', 'room__session_time', 'created_at', output_field=DateTimeField()),
        ).order_by('-sort_time', '-created_at')

        pt_totals = {}

        for game in games:
            pt = calculate_pt(game)
            for player_id, pt_value in pt.items():
                if player_id not in pt_totals:
                    pt_totals[player_id] = 0
                pt_totals[player_id] += pt_value

        from apps.players.serializers import PlayerListSerializer
        rankings = []
        for player_id, total_pt in sorted(pt_totals.items(), key=lambda x: x[1], reverse=True):
            try:
                player = Player.objects.get(pk=player_id)
                rankings.append({
                    'player': PlayerListSerializer(player).data,
                    'total_pt': total_pt,
                    'game_count': GamePlayer.objects.filter(
                        player_id=player_id, score__isnull=False, game__in=games,
                    ).count(),
                })
            except Player.DoesNotExist:
                continue

        return Response(rankings)


class PaipuStatsRankingView(APIView):
    """线上牌谱（含 actions）衍生统计排行；同牌谱去重、UID 绑定与趣味页原逻辑一致。"""
    permission_classes = [IsAdminUserOrReadOnly]

    def get(self, request):
        if request.query_params.get('game_type') == 'offline':
            return Response([])

        rank_type = request.query_params.get('rank_type', 'win_rate')
        if rank_type not in PAIPU_STATS_RANK_TYPES:
            rank_type = 'win_rate'

        min_games = int(request.query_params.get('min_games', '1'))
        player_count = request.query_params.get('player_count')
        game_mode = request.query_params.get('game_mode')

        games = Game.objects.filter(game_type='online').order_by('start_time')
        if player_count:
            games = games.filter(player_count=int(player_count))
        if game_mode:
            games = games.filter(game_mode=game_mode)

        uid_rows = MahjongSoulAccount.objects.filter(player__isnull=False).values_list('uid', 'player_id')
        uid_to_player_id = {int(uid): str(pid) for uid, pid in uid_rows}

        seen_keys: set[tuple[str, str]] = set()
        unique_games: list[Game] = []
        for g in games:
            _, has_actions = paipu_data_flags(g.paipu_data)
            if not has_actions:
                continue
            dk = _paipu_dedupe_key(g)
            if dk in seen_keys:
                continue
            seen_keys.add(dk)
            unique_games.append(g)

        buckets = fun_ranking_paipu_aggregates(unique_games, uid_to_player_id)
        items, _ = paipu_stats_build_rank_items(buckets, rank_type, min_games)

        from apps.players.serializers import PlayerListSerializer

        id_set = {x['player_id'] for x in items}
        players_map = {str(p.id): p for p in Player.objects.filter(pk__in=id_set)}
        result = []
        for item in items:
            player = players_map.get(item['player_id'])
            if not player:
                continue
            result.append({
                'player': PlayerListSerializer(player).data,
                'rate': item['rate'],
                'count': item['count'],
                'total': item['total'],
                'rounds': item.get('rounds', 0),
            })
        return Response(result)


class StartingHandsView(APIView):
    """线上牌谱起手 13 张评分列表（v2.2.0）。

    Query：
      tab=overall|personal （默认 overall；personal 时需 player_id）
      player_id=UUID
      player_count=3|4
      game_mode=east_wind|half_match
      page / page_size

    Overall 返回 { count, page, page_size, results }
    Personal 在此基础上额外返回 summary（平均分、张数等）。
    """
    permission_classes = [IsAdminUserOrReadOnly]

    def get(self, request):
        from django.core.cache import cache

        tab = (request.query_params.get('tab') or 'overall').strip().lower()
        if tab not in ('overall', 'personal'):
            tab = 'overall'
        player_id = (request.query_params.get('player_id') or '').strip()
        player_count_q = (request.query_params.get('player_count') or '').strip()
        game_mode_q = (request.query_params.get('game_mode') or '').strip()
        try:
            page = max(1, int(request.query_params.get('page', '1')))
        except (TypeError, ValueError):
            page = 1
        try:
            page_size = int(request.query_params.get('page_size', '20'))
        except (TypeError, ValueError):
            page_size = 20
        page_size = max(1, min(page_size, 100))

        if tab == 'personal' and not player_id:
            return Response({'error': str(_('个人榜需要 player_id'))}, status=400)
        if tab == 'personal':
            import uuid as _uuid
            try:
                _uuid.UUID(player_id)
            except (TypeError, ValueError, AttributeError):
                return Response({
                    'count': 0, 'page': page, 'page_size': page_size, 'results': [],
                    'summary': {'player': None, 'total_hands': 0, 'average_score': 0, 'max_score': 0, 'min_score': 0},
                })

        latest_id = (
            Game.objects.filter(game_type='online').order_by('-pk').values_list('pk', flat=True).first()
        ) or 0
        cache_key = f'starting_hands:v1:{latest_id}:{player_count_q}:{game_mode_q}'
        cached = cache.get(cache_key)
        if cached is None:
            cached = self._compute_all_hands(player_count_q, game_mode_q)
            cache.set(cache_key, cached, timeout=900)

        filtered = cached
        if tab == 'personal':
            filtered = [h for h in cached if h['player_id'] == player_id]

        total = len(filtered)
        start = (page - 1) * page_size
        page_hands = filtered[start:start + page_size]

        from apps.players.serializers import PlayerListSerializer
        pid_set = {h['player_id'] for h in page_hands}
        if tab == 'personal':
            pid_set.add(player_id)
        players_map = {str(p.id): p for p in Player.objects.filter(pk__in=pid_set)}

        results = []
        for h in page_hands:
            player = players_map.get(h['player_id'])
            if not player:
                continue
            results.append({
                'score': h['score'],
                'tiles': h['tiles'],
                'chang': h['chang'],
                'ju': h['ju'],
                'ben': h['ben'],
                'dealer_seat': h['dealer_seat'],
                'seat': h['seat'],
                'is_dealer': h['is_dealer'],
                'dora_indicators': h['dora_indicators'],
                'breakdown': h.get('breakdown', {}),
                'game_id': h['game_id'],
                'game_mode': h['game_mode'],
                'player_count': h['player_count'],
                'start_time': h['start_time'],
                'player': PlayerListSerializer(player).data,
            })

        response_data: dict = {
            'count': total,
            'page': page,
            'page_size': page_size,
            'results': results,
        }

        if tab == 'personal':
            scores = [h['score'] for h in filtered]
            avg = round(sum(scores) / len(scores), 2) if scores else 0
            target = players_map.get(player_id)
            response_data['summary'] = {
                'player': PlayerListSerializer(target).data if target else None,
                'total_hands': total,
                'average_score': avg,
                'max_score': max(scores, default=0),
                'min_score': min(scores, default=0),
            }

        return Response(response_data)

    @staticmethod
    def _compute_all_hands(player_count_q: str, game_mode_q: str) -> list[dict]:
        games = Game.objects.filter(game_type='online')
        if player_count_q:
            try:
                games = games.filter(player_count=int(player_count_q))
            except (TypeError, ValueError):
                pass
        if game_mode_q in ('east_wind', 'half_match'):
            games = games.filter(game_mode=game_mode_q)
        games = games.order_by('-start_time', '-created_at')

        uid_rows = MahjongSoulAccount.objects.filter(player__isnull=False).values_list('uid', 'player_id')
        uid_to_player_id = {int(uid): str(pid) for uid, pid in uid_rows}

        seen_keys: set[tuple[str, str]] = set()
        out: list[dict] = []
        for g in games:
            _, has_actions = paipu_data_flags(g.paipu_data)
            if not has_actions:
                continue
            dk = _paipu_dedupe_key(g)
            if dk in seen_keys:
                continue
            seen_keys.add(dk)

            hands = extract_starting_hands_from_game(g)
            start_time_str = g.start_time.strftime('%Y-%m-%d %H:%M') if g.start_time else ''
            for h in hands:
                uid = h.get('uid')
                pid = uid_to_player_id.get(int(uid)) if uid is not None else None
                if not pid:
                    continue
                out.append({
                    **h,
                    'player_id': pid,
                    'game_id': str(g.id),
                    'game_mode': g.game_mode,
                    'player_count': g.player_count,
                    'start_time': start_time_str,
                })

        out.sort(key=lambda x: x['score'], reverse=True)
        return out


class StartingHandsPlayerAveragesView(APIView):
    """个人榜起手牌平均分排行（全部选手按平均分排序）。"""
    permission_classes = [IsAdminUserOrReadOnly]

    def get(self, request):
        from django.core.cache import cache

        player_count_q = (request.query_params.get('player_count') or '').strip()
        game_mode_q = (request.query_params.get('game_mode') or '').strip()
        try:
            min_hands = max(1, int(request.query_params.get('min_hands', '8')))
        except (TypeError, ValueError):
            min_hands = 8

        latest_id = (
            Game.objects.filter(game_type='online').order_by('-pk').values_list('pk', flat=True).first()
        ) or 0
        cache_key = f'starting_hands:v1:{latest_id}:{player_count_q}:{game_mode_q}'
        cached = cache.get(cache_key)
        if cached is None:
            cached = StartingHandsView._compute_all_hands(player_count_q, game_mode_q)
            cache.set(cache_key, cached, timeout=900)

        agg: dict[str, dict[str, float]] = {}
        for h in cached:
            pid = h['player_id']
            row = agg.setdefault(pid, {'sum': 0.0, 'count': 0, 'best': float('-inf'), 'worst': float('inf')})
            row['sum'] += h['score']
            row['count'] += 1
            if h['score'] > row['best']:
                row['best'] = h['score']
            if h['score'] < row['worst']:
                row['worst'] = h['score']

        from apps.players.serializers import PlayerListSerializer
        items = []
        for pid, row in agg.items():
            if row['count'] < min_hands:
                continue
            avg = row['sum'] / row['count']
            items.append({
                'player_id': pid,
                'total_hands': int(row['count']),
                'average_score': round(avg, 2),
                'best_score': row['best'],
                'worst_score': row['worst'],
            })
        items.sort(key=lambda x: x['average_score'], reverse=True)

        pid_set = {x['player_id'] for x in items}
        players_map = {str(p.id): p for p in Player.objects.filter(pk__in=pid_set)}
        results = []
        for it in items:
            player = players_map.get(it['player_id'])
            if not player:
                continue
            results.append({
                'player': PlayerListSerializer(player).data,
                'total_hands': it['total_hands'],
                'average_score': it['average_score'],
                'best_score': it['best_score'],
                'worst_score': it['worst_score'],
            })
        return Response(results)


class FunRankingView(APIView):
    permission_classes = [IsAdminUserOrReadOnly]

    def get(self, request):
        from django.core.cache import cache

        rank_type = request.query_params.get('rank_type', '1st')
        player_count = request.query_params.get('player_count', '')
        game_mode = request.query_params.get('game_mode', '')
        game_type = request.query_params.get('game_type', '')
        min_games = request.query_params.get('min_games', '1')

        cache_key = f'fun_ranking:{rank_type}:{player_count}:{game_mode}:{game_type}:{min_games}'

        latest_gp = GamePlayer.objects.filter(score__isnull=False).order_by('-pk').values_list('pk', flat=True).first()
        latest_id = latest_gp or 0
        version_key = f'{cache_key}:vid:{latest_id}'
        cached = cache.get(version_key)
        if cached is not None:
            return Response(cached)

        result = self._compute(rank_type, player_count, game_mode, game_type, int(min_games))
        cache.set(version_key, result, timeout=300)
        return Response(result)

    @staticmethod
    def _compute(rank_type, player_count, game_mode, game_type, min_games):
        gps = GamePlayer.objects.filter(score__isnull=False).select_related('game', 'player')

        if player_count:
            gps = gps.filter(game__player_count=int(player_count))
        if game_mode:
            gps = gps.filter(game__game_mode=game_mode)
        if game_type in ('offline', 'online'):
            gps = gps.filter(game__game_type=game_type)

        game_ranks: dict[int, list[tuple[int, int]]] = {}
        for gp in gps:
            gid = gp.game_id
            if gid not in game_ranks:
                game_gps = list(gps.filter(game_id=gid))
                ranked = sorted(game_gps, key=lambda x: x.score, reverse=True)
                game_ranks[gid] = [(g.player_id, i + 1) for i, g in enumerate(ranked)]

        player_stats: dict[str, dict] = {}
        for gp in gps:
            pid = str(gp.player_id)
            if pid not in player_stats:
                player_stats[pid] = {
                    'total': 0, 'ranks': {1: 0, 2: 0, 3: 0, 4: 0},
                    'score_sum': 0, 'high_score': None, 'low_score': None,
                    'rank_sum': 0, 'player_obj': gp.player,
                }
            s = player_stats[pid]
            s['total'] += 1
            s['score_sum'] += gp.score

            if s['high_score'] is None or gp.score > s['high_score']:
                s['high_score'] = gp.score
            if s['low_score'] is None or gp.score < s['low_score']:
                s['low_score'] = gp.score

            gr = game_ranks.get(gp.game_id, [])
            rank = next((r for p, r in gr if p == gp.player_id), len(gr))
            if 1 <= rank <= 4:
                s['ranks'][rank] += 1
                s['rank_sum'] += rank

        rank_key_map = {'1st': 1, '2nd': 2, '3rd': 3, '4th': 4}
        valid_types = list(rank_key_map.keys()) + ['avg_rank', 'avg_score', 'high_score', 'low_score']
        if rank_type not in valid_types:
            rank_type = '1st'

        items = []
        for pid, s in player_stats.items():
            total = s['total']
            if total < min_games:
                continue

            item = {'player_id': pid, 'total': total}

            if rank_type in rank_key_map:
                target = rank_key_map[rank_type]
                count = s['ranks'].get(target, 0)
                item['rate'] = round(count / total * 100, 2)
                item['count'] = count
            elif rank_type == 'avg_rank':
                item['rate'] = round(s['rank_sum'] / total, 2)
                item['count'] = total
            elif rank_type == 'avg_score':
                item['rate'] = round(s['score_sum'] / total, 1)
                item['count'] = total
            elif rank_type == 'high_score':
                item['rate'] = s['high_score']
                item['count'] = total
            elif rank_type == 'low_score':
                item['rate'] = s['low_score']
                item['count'] = total

            items.append(item)

        reverse = rank_type not in ('avg_rank', 'low_score')
        items.sort(key=lambda x: x['rate'], reverse=reverse)

        from apps.players.serializers import PlayerListSerializer
        result = []
        for item in items:
            player = player_stats[item['player_id']]['player_obj']
            result.append({
                'player': PlayerListSerializer(player).data,
                'rate': item['rate'],
                'count': item['count'],
                'total': item['total'],
            })

        return result


class YakumanListView(APIView):
    permission_classes = [IsAdminUserOrReadOnly]

    def get(self, request):
        record_type = request.query_params.get('record_type')
        records = HandRecordService.get_all_yakumans(record_type=record_type)
        serializer = HandRecordListSerializer(records, many=True)
        return Response(serializer.data)


class RecentYakumanView(APIView):
    permission_classes = [IsAdminUserOrReadOnly]

    def get(self, request):
        limit = int(request.query_params.get('limit', 10))
        record_type = request.query_params.get('record_type')
        records = HandRecordService.get_recent_yakumans(limit, record_type=record_type)
        serializer = HandRecordListSerializer(records, many=True)
        return Response(serializer.data)


class PlayerYakumanListView(APIView):
    permission_classes = [IsAdminUserOrReadOnly]

    def get(self, request, pk):
        player = get_object_or_404(Player, pk=pk)
        record_type = request.query_params.get('record_type')
        records = HandRecordService.get_player_yakumans(player, record_type=record_type)
        serializer = HandRecordListSerializer(records, many=True)
        return Response(serializer.data)


class OnlineGameRetryView(APIView):
    """重新获取单个线上对局的牌谱（含 --detail 完整 actions），更新时间与 paipu_data，并返回校验结果。"""
    permission_classes = [IsAdminUserOrReadOnly]

    def post(self, request, pk):
        game = get_object_or_404(Game, pk=pk)
        if game.game_type != 'online':
            return Response({'error': str(_('仅线上对局可重新获取'))}, status=400)
        if not game.source_url:
            return Response({'error': str(_('该对局无牌谱链接，无法重新获取'))}, status=400)

        from services.majsoul import (
            fetch_paipu_records,
            normalize_paipu_input_url,
            extract_paipu_uuid,
            validate_paipu_detail_record,
            build_majsoul_record_detail_blob,
            _timestamp_to_naive_dt,
        )

        url = normalize_paipu_input_url(game.source_url)
        if not url:
            return Response({'error': str(_('牌谱链接无效'))}, status=400)

        try:
            records = fetch_paipu_records([url], detail=True)
        except Exception as e:
            logger.error('重新获取牌谱失败 game=%s: %s', pk, e, exc_info=True)
            return Response({'error': str(_('牌谱获取失败: %(e)s') % {'e': e})}, status=500)

        if not records or len(records) == 0:
            return Response({'error': str(_('未获取到牌谱数据'))}, status=404)

        rec = records[0]
        uuid_val = rec.get('uuid', '')
        game_uuid = extract_paipu_uuid(game.source_url)
        if game_uuid and uuid_val and game_uuid != uuid_val:
            logger.warning('retry uuid mismatch: db=%s api=%s', game_uuid, uuid_val)

        detail_ok, detail_errors = validate_paipu_detail_record(rec, game_uuid)
        detail_blob = build_majsoul_record_detail_blob(
            rec, validation_ok=detail_ok, validation_errors=detail_errors,
        )

        raw_start = rec.get('start_time')
        raw_end = rec.get('end_time')
        start_time = _timestamp_to_naive_dt(raw_start)
        end_time = _timestamp_to_naive_dt(raw_end)

        updated_fields = []
        if start_time:
            game.start_time = start_time
            updated_fields.append('start_time')
        if end_time:
            game.end_time = end_time
            updated_fields.append('end_time')

        game.paipu_data = {
            **(game.paipu_data or {}),
            'retry_source': 'majsoul_local_node',
            'retry_uuid': uuid_val,
            'retry_start_time': raw_start,
            'retry_end_time': raw_end,
            'retry_players': rec.get('players', []),
            'majsoul_record_detail': detail_blob,
        }
        updated_fields.append('paipu_data')

        if updated_fields:
            game.save(update_fields=updated_fields)

        payload = game_detail_with_pt(game, request)
        payload['paipu_detail_validation'] = {'ok': detail_ok, 'errors': detail_errors}
        return Response(payload)
