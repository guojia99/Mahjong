import random
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from django.db.models import Min, Max
from django.shortcuts import get_object_or_404
from common.permissions import IsAdminUserOrReadOnly
from .models import Room, Game, GamePlayer, HandRecord
from .serializers import (
    RoomListSerializer, RoomDetailSerializer, RoomCreateSerializer,
    RoomPlayerSerializer, GameListSerializer, GameDetailSerializer,
    GameCreateSerializer, GameUpdateSerializer, ScoreSubmitSerializer,
    HandRecordCreateSerializer, HandRecordListSerializer,
)
from .services import RoomService, GameService, HandRecordService, calculate_pt
from apps.players.models import Player


class RoomListView(APIView):
    permission_classes = [IsAdminUserOrReadOnly]

    def get(self, request):
        status_filter = request.query_params.get('status')
        rooms = Room.objects.all()
        if status_filter:
            rooms = rooms.filter(status=status_filter)
        rooms = rooms.prefetch_related('room_players__player').annotate(
            earliest_game_time=Min('games__start_time'),
            latest_game_time=Max('games__start_time'),
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
        games = room.games.prefetch_related('game_players__player').all()
        serializer = GameListSerializer(games, many=True)
        return Response(serializer.data)

    def post(self, request, pk):
        room = get_object_or_404(Room, pk=pk)
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
        return Response(GameDetailSerializer(game).data, status=status.HTTP_201_CREATED)


class GameListView(APIView):
    permission_classes = [IsAdminUserOrReadOnly]

    def get(self, request):
        games = Game.objects.filter(
            game_players__score__isnull=False
        ).distinct().prefetch_related(
            'game_players__player', 'hand_records__player'
        ).order_by('-start_time')

        player_count = request.query_params.get('player_count')
        if player_count:
            games = games.filter(player_count=int(player_count))

        game_mode = request.query_params.get('game_mode')
        if game_mode:
            games = games.filter(game_mode=game_mode)

        game_type = request.query_params.get('game_type')
        if game_type:
            games = games.filter(game_type=game_type)

        serializer = GameListSerializer(games, many=True)
        data = serializer.data
        for item in data:
            game_obj = next((g for g in games if str(g.id) == item['id']), None)
            if game_obj:
                item['pt'] = calculate_pt(game_obj)
        return Response(data)


class GameDetailView(APIView):
    permission_classes = [IsAdminUserOrReadOnly]

    def get(self, request, pk):
        game = get_object_or_404(Game, pk=pk)
        serializer = GameDetailSerializer(game)
        return Response(serializer.data)

    def put(self, request, pk):
        game = get_object_or_404(Game, pk=pk)
        serializer = GameUpdateSerializer(game, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        game = GameService.update_game(game, **serializer.validated_data)
        return Response(GameDetailSerializer(game).data)


class GameScoreView(APIView):
    permission_classes = [IsAdminUserOrReadOnly]

    def put(self, request, pk):
        game = get_object_or_404(Game, pk=pk)
        serializer = ScoreSubmitSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        game = GameService.submit_scores(game, serializer.validated_data['scores'])
        return Response(GameDetailSerializer(game).data)


class GamePlayerUpdateView(APIView):
    permission_classes = [IsAdminUserOrReadOnly]

    def put(self, request, pk):
        game = get_object_or_404(Game, pk=pk)
        player_ids = request.data.get('player_ids', [])
        game = GameService.update_game_players(game, player_ids)
        return Response(GameDetailSerializer(game).data)


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
        return Response(GameDetailSerializer(game).data)


class OnlineGameImportView(APIView):
    permission_classes = [IsAdminUserOrReadOnly]

    def post(self, request):
        source_url = request.data.get('source_url', '')
        player_data = request.data.get('player_data', [])
        game_mode = request.data.get('game_mode', 'half_match')
        player_count = request.data.get('player_count', len(player_data))

        game = GameService.create_online_game(
            request.user, source_url, player_data, game_mode, player_count
        )
        return Response(GameDetailSerializer(game).data, status=status.HTTP_201_CREATED)


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

        gps = GamePlayer.objects.filter(
            player=player, score__isnull=False
        ).select_related('game').order_by('-game__start_time')

        if player_count:
            gps = gps.filter(game__player_count=int(player_count))
        if game_mode:
            gps = gps.filter(game__game_mode=game_mode)

        total_games = gps.count()
        if total_games == 0:
            return Response({
                'total_games': 0,
                'total_pt': 0,
                'rank_distribution': {},
                'recent_ranking': [],
            })

        rank_distribution = {1: 0, 2: 0, 3: 0}
        total_pt = 0
        recent_ranking = []

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

            recent_ranking.append({
                'game_id': str(game.id),
                'start_time': game.start_time.strftime('%Y-%m-%d %H:%M') if game.start_time else '',
                'rank': rank,
                'pt': player_pt,
                'score': gp.score,
            })

        rank_rates = {}
        for rank, count in rank_distribution.items():
            rank_rates[f'{rank}位率'] = round(count / total_games * 100, 1) if total_games > 0 else 0

        return Response({
            'total_games': total_games,
            'total_pt': total_pt,
            'rank_distribution': rank_rates,
            'recent_ranking': recent_ranking[:50],
        })


class PtRankingView(APIView):
    permission_classes = [IsAdminUserOrReadOnly]

    def get(self, request):
        player_count = request.query_params.get('player_count')
        game_mode = request.query_params.get('game_mode')

        games = Game.objects.filter(
            game_players__score__isnull=False
        ).distinct().prefetch_related('game_players__player')

        if player_count:
            games = games.filter(player_count=int(player_count))
        if game_mode:
            games = games.filter(game_mode=game_mode)

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
                        player_id=player_id, score__isnull=False
                    ).count(),
                })
            except Player.DoesNotExist:
                continue

        return Response(rankings)


class YakumanListView(APIView):
    permission_classes = [IsAdminUserOrReadOnly]

    def get(self, request):
        records = HandRecordService.get_all_yakumans()
        serializer = HandRecordListSerializer(records, many=True)
        return Response(serializer.data)


class RecentYakumanView(APIView):
    permission_classes = [IsAdminUserOrReadOnly]

    def get(self, request):
        limit = int(request.query_params.get('limit', 10))
        records = HandRecordService.get_recent_yakumans(limit)
        serializer = HandRecordListSerializer(records, many=True)
        return Response(serializer.data)


class PlayerYakumanListView(APIView):
    permission_classes = [IsAdminUserOrReadOnly]

    def get(self, request, pk):
        player = get_object_or_404(Player, pk=pk)
        records = HandRecordService.get_player_yakumans(player)
        serializer = HandRecordListSerializer(records, many=True)
        return Response(serializer.data)
