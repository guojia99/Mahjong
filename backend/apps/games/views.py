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
)
from .services import (
    RoomService,
    GameService,
    HandRecordService,
    calculate_pt,
    annotate_serialized_games_with_pt,
    game_detail_with_pt,
)
from common.exceptions import BusinessException
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
            raise BusinessException('该房间存在对局记录，无法删除')
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
        games = room.games.prefetch_related('game_players__player').annotate(
            sort_time=Coalesce('end_time', 'start_time', output_field=DateTimeField()),
        ).order_by('-sort_time', '-created_at')
        serializer = GameListSerializer(games, many=True)
        data = serializer.data
        annotate_serialized_games_with_pt(games, data)
        return Response(data)

    def post(self, request, pk):
        room = get_object_or_404(Room, pk=pk)
        if room.status == 'closed':
            return Response({'error': '房间已关闭，无法新增对局'}, status=400)
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
        return Response(game_detail_with_pt(game), status=status.HTTP_201_CREATED)


class GameListView(APIView):
    permission_classes = [IsAdminUserOrReadOnly]

    def get(self, request):
        games = Game.objects.filter(
            game_players__score__isnull=False
        ).distinct().prefetch_related(
            'game_players__player', 'hand_records__player'
        ).select_related('room')

        player_count = request.query_params.get('player_count')
        if player_count:
            games = games.filter(player_count=int(player_count))

        game_mode = request.query_params.get('game_mode')
        if game_mode:
            games = games.filter(game_mode=game_mode)

        game_type = request.query_params.get('game_type')
        if game_type:
            games = games.filter(game_type=game_type)

        games = games.annotate(
            sort_time=Coalesce('end_time', 'start_time', 'room__session_time', 'created_at', output_field=DateTimeField()),
        ).order_by('-sort_time', '-created_at')

        serializer = GameListSerializer(games, many=True)
        data = serializer.data
        annotate_serialized_games_with_pt(games, data)
        return Response(data)


class GameDetailView(APIView):
    permission_classes = [IsAdminUserOrReadOnly]

    def get(self, request, pk):
        game = get_object_or_404(Game, pk=pk)
        return Response(game_detail_with_pt(game))

    def put(self, request, pk):
        game = get_object_or_404(Game, pk=pk)
        serializer = GameUpdateSerializer(game, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        game = GameService.update_game(game, **serializer.validated_data)
        return Response(game_detail_with_pt(game))

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
        return Response(game_detail_with_pt(game))


class GamePlayerUpdateView(APIView):
    permission_classes = [IsAdminUserOrReadOnly]

    def put(self, request, pk):
        game = get_object_or_404(Game, pk=pk)
        player_ids = request.data.get('player_ids', [])
        game = GameService.update_game_players(game, player_ids)
        return Response(game_detail_with_pt(game))


class GameShuffleSeatsView(APIView):
    permission_classes = [IsAdminUserOrReadOnly]

    def post(self, request, pk):
        game = get_object_or_404(Game, pk=pk)
        if game.is_scored:
            return Response({'error': '对局已录分，无法调整席次'}, status=400)
        gps = list(game.game_players.all())
        seats = list(range(len(gps)))
        random.shuffle(seats)
        for i, gp in enumerate(gps):
            gp.seat_number = -(i + 1)
            gp.save()
        for gp, seat in zip(gps, seats):
            gp.seat_number = seat
            gp.save()
        return Response(game_detail_with_pt(game))


class OnlineGameParseView(APIView):
    permission_classes = [IsAdminUserOrReadOnly]

    def get(self, request):
        from services.majsoul import analyze_paipu_url, normalize_paipu_input_url

        raw = request.query_params.get('url', '')
        source_url = normalize_paipu_input_url(raw)
        if not source_url:
            return Response({'error': '请提供牌谱链接（需包含 https:// 或 http://）'}, status=400)

        try:
            result = analyze_paipu_url(source_url)
        except Exception as e:
            logger.error(f"解析牌谱失败: {e}", exc_info=True)
            return Response({'error': f'解析牌谱失败: {str(e)}'}, status=500)

        if not result:
            return Response({'error': '未找到牌谱数据，请检查链接是否有效'}, status=404)

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
            return Response({'error': '请提供 urls 数组'}, status=400)
        from services.majsoul import analyze_paipu_url, normalize_paipu_input_url

        results = []
        for u in urls:
            line = (u or '').strip() if isinstance(u, str) else ''
            if not line:
                results.append({'source_url': '', 'ok': False, 'error': '空行'})
                continue
            normalized = normalize_paipu_input_url(line)
            if not normalized:
                results.append({'source_url': line, 'ok': False, 'error': '未识别到有效的 http(s) 牌谱链接'})
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
            return Response({'error': '请选择「线上场」房间'}, status=400)
        if room.status != 'open':
            return Response({'error': '房间已关闭，无法导入'}, status=400)

        from services.majsoul import normalize_paipu_input_url

        source_url = normalize_paipu_input_url(data.get('source_url', '') or '')
        allow_duplicate_url = bool(data.get('allow_duplicate_url', False))
        player_data = data.get('player_data', [])
        game_mode = data.get('game_mode', 'half_match')
        player_count = data.get('player_count', len(player_data))
        paipu_data = data.get('paipu_data', {}) or {}
        start_time = data.get('start_time')

        if source_url:
            exists = Game.objects.filter(game_type='online', source_url=source_url).exists()
            if exists and not allow_duplicate_url:
                return Response(
                    {
                        'error': '该牌谱链接已在系统中存在对局。若仍要再导入一条记录，请在导入页勾选「仍导入本条」后重试。',
                    },
                    status=400,
                )

        try:
            game = GameService.create_online_game(
                request.user, source_url, player_data, room, game_mode=game_mode, player_count=player_count,
                paipu_data=paipu_data, start_time=start_time,
            )
        except Exception as e:
            return Response({'error': str(e)}, status=400)

        return Response(game_detail_with_pt(game), status=status.HTTP_201_CREATED)


class BindMajsoulAccountView(APIView):
    permission_classes = [IsAdminUserOrReadOnly]

    def post(self, request):
        from apps.players.services import PlayerService
        from apps.players.serializers import MahjongSoulAccountSerializer

        account_id = request.data.get('account_id')
        player_id = request.data.get('player_id')
        if not account_id or not player_id:
            return Response({'error': '请提供account_id和player_id'}, status=400)

        try:
            player = Player.objects.get(pk=player_id)
        except Player.DoesNotExist:
            return Response({'error': '雀士不存在'}, status=404)

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
            rank_rates[f'{rank}位率'] = round(count / total_games * 100, 1) if total_games > 0 else 0

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
