from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.http import QueryDict
from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient

from apps.players.models import Player

from .views import StartingHandsView, _parse_query_int

User = get_user_model()


class StartingHandsPaginationTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(username='sh_test', email='sh@test.local', password='x')
        self.player = Player.objects.create(nickname='SH', created_by=self.user)

    @patch.object(StartingHandsView, 'get_or_build_cached_hands')
    def test_starting_hands_distinct_pages(self, mock_hands):
        pid = str(self.player.id)
        mock_hands.return_value = [
            {
                'player_id': pid,
                'score': float(100 - i),
                'tiles': ['1m'] * 13,
                'chang': 0,
                'ju': 0,
                'ben': 0,
                'dealer_seat': 0,
                'seat': 0,
                'is_dealer': True,
                'dora_indicators': [],
                'breakdown': {},
                'game_id': str(i),
                'game_mode': 'half_match',
                'player_count': 4,
                'start_time': '',
            }
            for i in range(50)
        ]
        url = reverse('game-starting-hands')
        r1 = self.client.get(url, {'tab': 'overall', 'page': 1, 'page_size': 20})
        r2 = self.client.get(url, {'tab': 'overall', 'page': 2, 'page_size': 20})
        self.assertEqual(r1.status_code, 200)
        self.assertEqual(r2.status_code, 200)
        self.assertEqual(r1.data['count'], 50)
        self.assertEqual(len(r1.data['results']), 20)
        self.assertEqual(len(r2.data['results']), 20)
        self.assertEqual(r1.data['results'][0]['game_id'], '0')
        self.assertEqual(r2.data['results'][0]['game_id'], '20')


class ParseQueryIntTests(TestCase):
    def test_strips_and_parses_page(self):
        q = QueryDict(mutable=True)
        q['page'] = ' 2 '
        self.assertEqual(_parse_query_int(q, 'page', 1, minimum=1), 2)

    def test_invalid_falls_back(self):
        q = QueryDict(mutable=True)
        q['page'] = 'x'
        self.assertEqual(_parse_query_int(q, 'page', 1, minimum=1), 1)
