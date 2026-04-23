import math
from django.db import transaction
from django.utils import timezone


def get_active_uma_config(player_count=4, game_mode='half_match'):
    from .models import UmaConfig
    config = UmaConfig.objects.filter(
        player_count=player_count, game_mode=game_mode, is_active=True
    ).first()
    if config:
        return config
    default_uma = {4: [30, 10, -10, -30], 3: [30, 0, -30]}
    uma_list = default_uma.get(player_count, default_uma[4])
    base_score = 350 if player_count == 3 else 250
    return type('Obj', (), {
        'uma_1st': uma_list[0] if len(uma_list) > 0 else 30,
        'uma_2nd': uma_list[1] if len(uma_list) > 1 else 10,
        'uma_3rd': uma_list[2] if len(uma_list) > 2 else -10,
        'uma_4th': uma_list[3] if len(uma_list) > 3 else -30,
        'base_score': base_score,
        'get_uma_list': lambda: uma_list,
    })()


def get_all_tiers_ordered():
    from .models import RankTier
    return list(RankTier.objects.select_for_update().order_by('level_order'))


def calculate_game_ranking_points(game):
    from .models import RankTier, PlayerRankingScore
    from apps.games.models import GamePlayer

    if game.player_count != 4 or game.game_mode != 'half_match':
        return {}

    gps = list(GamePlayer.objects.filter(game=game, score__isnull=False).order_by('-score'))
    if not gps:
        return {}

    ranked = sorted(gps, key=lambda x: x.score, reverse=True)
    uma_config = get_active_uma_config(game.player_count, game.game_mode)
    uma_list = uma_config.get_uma_list()
    base_score = uma_config.base_score
    tiers = get_all_tiers_ordered()

    if not tiers:
        return {}

    result = {}
    for i, gp in enumerate(ranked):
        if i >= len(uma_list):
            break

        player_id = gp.player_id
        try:
            score_record = PlayerRankingScore.objects.select_for_update().get(player_id=player_id)
        except PlayerRankingScore.DoesNotExist:
            score_record = None

        current_tier = None
        current_score = 0.0

        if score_record and score_record.tier:
            current_tier = score_record.tier
            current_score = score_record.score
        else:
            current_tier = tiers[0]
            current_score = current_tier.initial_score

        uma = uma_list[i]
        basic_pt = (gp.score - base_score) / 10
        dajiang = current_tier.dajiang_score if i == 0 else 0
        fourth_penalty = current_tier.fourth_penalty if i == len(ranked) - 1 and len(ranked) == 4 else 0
        extra_dajiang = current_tier.dajiang_score if i == 0 and gp.score >= 450 else 0

        delta = round(basic_pt + uma + dajiang - fourth_penalty + extra_dajiang, 2)
        new_score = current_score + delta

        final_tier, final_score = _resolve_tier(new_score, current_tier, tiers, score_record)

        result[str(player_id)] = {
            'rank': i + 1,
            'delta': delta,
            'basic_pt': round(basic_pt, 2),
            'uma': uma,
            'dajiang': dajiang,
            'fourth_penalty': fourth_penalty,
            'extra_dajiang': extra_dajiang,
            'old_tier': current_tier.name if current_tier else tiers[0].name,
            'new_tier': final_tier.name if final_tier else tiers[0].name,
            'old_score': current_score,
            'new_score': final_score,
        }

    return result


def _resolve_tier(new_score, current_tier, tiers, score_record):
    from .models import RankTier, PlayerRankingScore

    if new_score < 0:
        new_score = 0

    is_huntian = False
    huntian_tier = None
    for t in tiers:
        if t.level_order >= 15:
            huntian_tier = t
            is_huntian = True
            break

    if is_huntian and huntian_tier:
        tier_before_huntian = None
        for t in tiers:
            if t.level_order == 14:
                tier_before_huntian = t
                break

        if huntian_tier == current_tier:
            if new_score < 6000:
                new_score = 5000
                return tier_before_huntian, new_score
            return current_tier, new_score

        if tier_before_huntian and current_tier == tier_before_huntian:
            if new_score >= 7000:
                return huntian_tier, new_score
            return current_tier, new_score

    for idx, tier in enumerate(tiers):
        next_tier = tiers[idx + 1] if idx + 1 < len(tiers) else None

        if tier.level_order == 14 and idx + 1 < len(tiers) and tiers[idx + 1].level_order >= 15:
            threshold = tier.initial_score + tier.promotion_score
            if current_tier and current_tier.level_order == tier.level_order:
                if new_score >= threshold:
                    if next_tier:
                        new_score = next_tier.initial_score + (new_score - threshold)
                    else:
                        new_score = threshold
                    return next_tier, new_score
                else:
                    return current_tier, new_score
            continue

        if tier == current_tier or (not current_tier and idx == 0):
            threshold = tier.initial_score + tier.promotion_score
            if next_tier and new_score >= threshold:
                overflow = new_score - threshold
                new_score = next_tier.initial_score + overflow
                return next_tier, new_score

            prev_tier = tiers[idx - 1] if idx > 0 else None
            if prev_tier and not tier.is_protected:
                prev_threshold = prev_tier.initial_score
                if new_score < prev_threshold:
                    new_score = prev_threshold
                    return prev_tier, new_score

            return current_tier or tier, new_score

    return current_tier, new_score


@transaction.atomic
def settle_game_ranking(game):
    from .models import PlayerRankingScore, RankTier, GameRankingResult

    if game.player_count != 4 or game.game_mode != 'half_match':
        return {}

    tiers = list(RankTier.objects.select_for_update().order_by('level_order'))
    if not tiers:
        return {}

    points = calculate_game_ranking_points(game)
    if not points:
        return {}

    results = {}
    for player_id_str, pt_info in points.items():
        player_id_val = player_id_str
        from apps.players.models import Player
        player = Player.objects.get(pk=player_id_val)

        new_tier_name = pt_info['new_tier']
        new_tier = next((t for t in tiers if t.name == new_tier_name), tiers[0])

        score_record, created = PlayerRankingScore.objects.select_for_update().get_or_create(
            player_id=player_id_val,
            defaults={
                'tier': new_tier,
                'score': pt_info['new_score'],
                'game_count': 1,
            }
        )
        if not created:
            score_record.tier = new_tier
            score_record.score = pt_info['new_score']
            score_record.game_count += 1
            score_record.save(update_fields=['tier', 'score', 'game_count', 'updated_at'])

        GameRankingResult.objects.update_or_create(
            game=game,
            player_id=player_id_val,
            defaults={
                'rank': pt_info['rank'],
                'delta': pt_info['delta'],
                'old_tier_name': pt_info['old_tier'],
                'new_tier_name': pt_info['new_tier'],
                'old_score': pt_info['old_score'],
                'new_score': pt_info['new_score'],
            }
        )

        results[player_id_val] = pt_info

    return results


def recalculate_all_rankings():
    from .models import PlayerRankingScore, RankTier, GameRankingResult
    from apps.games.models import Game, GamePlayer

    PlayerRankingScore.objects.all().delete()
    GameRankingResult.objects.all().delete()

    tiers = list(RankTier.objects.select_for_update().order_by('level_order'))
    if not tiers:
        return

    scored_games = Game.objects.filter(
        player_count=4, game_mode='half_match',
        game_players__score__isnull=False,
    ).distinct().order_by('start_time')

    for game in scored_games:
        _settle_game_ranking_silent(game, tiers)


def _settle_game_ranking_silent(game, tiers):
    from .models import PlayerRankingScore, GameRankingResult
    from apps.games.models import GamePlayer

    gps = list(GamePlayer.objects.filter(game=game, score__isnull=False).order_by('-score'))
    if not gps:
        return

    ranked = sorted(gps, key=lambda x: x.score, reverse=True)
    uma_config = get_active_uma_config(game.player_count, game.game_mode)
    uma_list = uma_config.get_uma_list()
    base_score = uma_config.base_score

    for i, gp in enumerate(ranked):
        if i >= len(uma_list):
            break

        try:
            score_record = PlayerRankingScore.objects.select_for_update().get(player_id=gp.player_id)
        except PlayerRankingScore.DoesNotExist:
            score_record = None

        current_tier = None
        current_score = 0.0
        if score_record and score_record.tier:
            current_tier = score_record.tier
            current_score = score_record.score
        else:
            current_tier = tiers[0]
            current_score = current_tier.initial_score

        uma = uma_list[i]
        basic_pt = (gp.score - base_score) / 10
        dajiang = current_tier.dajiang_score if i == 0 else 0
        fourth_penalty = current_tier.fourth_penalty if i == len(ranked) - 1 and len(ranked) == 4 else 0
        extra_dajiang = current_tier.dajiang_score if i == 0 and gp.score >= 450 else 0

        delta = round(basic_pt + uma + dajiang - fourth_penalty + extra_dajiang, 2)
        new_score = current_score + delta

        final_tier, final_score = _resolve_tier(new_score, current_tier, tiers, score_record)

        new_tier = final_tier or tiers[0]
        score_record_obj, created = PlayerRankingScore.objects.get_or_create(
            player_id=gp.player_id,
            defaults={
                'tier': new_tier,
                'score': final_score,
                'game_count': 1,
            }
        )
        if not created:
            score_record_obj.tier = new_tier
            score_record_obj.score = final_score
            score_record_obj.game_count += 1
            score_record_obj.save(update_fields=['tier', 'score', 'game_count', 'updated_at'])

        GameRankingResult.objects.update_or_create(
            game=game,
            player_id=gp.player_id,
            defaults={
                'rank': i + 1,
                'delta': delta,
                'old_tier_name': current_tier.name if current_tier else tiers[0].name,
                'new_tier_name': new_tier.name,
                'old_score': current_score,
                'new_score': final_score,
            }
        )


def get_ranking_leaderboard():
    from .models import PlayerRankingScore
    return list(
        PlayerRankingScore.objects.select_related('player', 'tier')
        .order_by('-tier__level_order', '-score')
    )


def get_next_tier_info(tier):
    from .models import RankTier
    if not tier:
        return None
    next_tier = RankTier.objects.filter(level_order=tier.level_order + 1).first()
    if not next_tier:
        return None
    threshold = tier.initial_score + tier.promotion_score
    return {
        'name': next_tier.name,
        'level_order': next_tier.level_order,
        'threshold': threshold,
        'needed': round(threshold - 0, 2) if threshold > 0 else 0,
        'bg_color': next_tier.bg_color,
        'bg_gradient': next_tier.bg_gradient,
    }


def get_next_tier_info_with_score(tier, current_score):
    info = get_next_tier_info(tier)
    if info:
        needed = round(info['threshold'] - current_score, 2)
        if needed < 0:
            needed = 0
        info['needed'] = needed
    return info


def get_player_ranking(player):
    from .models import PlayerRankingScore
    try:
        return PlayerRankingScore.objects.select_related('tier').get(player=player)
    except PlayerRankingScore.DoesNotExist:
        return None
