from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.http import QueryDict
from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient

from apps.players.models import Player

from .starting_hands import evaluate_starting_hand
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


class EvaluateStartingHandTests(TestCase):
    def test_tanyao_potential_when_many_middle_tiles(self):
        tiles = ['2m', '3m', '4m', '5m', '6m', '7m', '2p', '3p', '4p', '5p', '6p', '2s', '3s']
        r = evaluate_starting_hand(tiles, chang=0, dealer_seat=0, seat=0, dora_indicators=[])
        self.assertFalse(r.get('invalid'))
        self.assertIn('tanyao', r['breakdown']['yaku_potential'])
        self.assertEqual(r['breakdown']['yaku_potential']['tanyao'], 10.0)

    def test_no_tanyao_potential_when_many_terminals(self):
        r = evaluate_starting_hand(['1m'] * 13, chang=0, dealer_seat=0, seat=0, dora_indicators=[])
        self.assertNotIn('tanyao', r['breakdown']['yaku_potential'])

    def test_no_tanyao_potential_with_honors(self):
        tiles = ['2m', '3m', '4m', '5m', '6m', '7m', '2p', '3p', '4p', '5p', '1z', '1z', '1z', '2s']
        r = evaluate_starting_hand(tiles, chang=0, dealer_seat=0, seat=0, dora_indicators=[])
        self.assertNotIn('tanyao', r['breakdown']['yaku_potential'])

    def test_tanyao_potential_tier_10_middle_with_terminals(self):
        tiles = ['2m', '3m', '4m', '5m', '6m', '7m', '2p', '3p', '4p', '5p', '1m', '1m', '1m']
        r = evaluate_starting_hand(tiles, chang=0, dealer_seat=0, seat=0, dora_indicators=[])
        self.assertEqual(r['breakdown']['yaku_potential'].get('tanyao'), 1.5)

    def test_dora_triplet_same_bonus(self):
        tiles = ['5m', '5m', '5m', '2p', '3p', '4p', '5p', '6p', '7p', '8p', '9p', '1s', '2s']
        r = evaluate_starting_hand(tiles, chang=0, dealer_seat=0, seat=0, dora_indicators=['4m'])
        self.assertEqual(r['breakdown']['dora_equiv_ladder_bonus'], 21.0)
        self.assertEqual(r['breakdown']['dora_triplet_same_bonus'], 8.0)
        self.assertGreaterEqual(r['breakdown']['dora_bonus'], 29.0)

    def test_daisangen_potential(self):
        tiles = ['5z', '5z', '6z', '6z', '7z', '7z', '7z', '2m', '3m', '4m', '5m', '6m', '7m']
        r = evaluate_starting_hand(tiles, chang=0, dealer_seat=0, seat=0, dora_indicators=[])
        self.assertEqual(r['breakdown']['yaku_potential'].get('daisangen'), 15.0)


class ParseQueryIntTests(TestCase):
    def test_strips_and_parses_page(self):
        q = QueryDict(mutable=True)
        q['page'] = ' 2 '
        self.assertEqual(_parse_query_int(q, 'page', 1, minimum=1), 2)

    def test_invalid_falls_back(self):
        q = QueryDict(mutable=True)
        q['page'] = 'x'
        self.assertEqual(_parse_query_int(q, 'page', 1, minimum=1), 1)
