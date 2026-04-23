from django.db import migrations


def create_default_tiers_and_uma(apps, schema_editor):
    RankTier = apps.get_model('ranking', 'RankTier')
    UmaConfig = apps.get_model('ranking', 'UmaConfig')

    tiers_data = [
        {
            'name': '入门', 'level_order': 1, 'initial_score': 0, 'promotion_score': 50,
            'dajiang_score': 10, 'fourth_penalty': 0, 'is_protected': True,
            'bg_color': '#8e8e8e', 'bg_gradient': '', 'description': '初入雀魂的萌新雀士',
        },
        {
            'name': '初心', 'level_order': 2, 'initial_score': 0, 'promotion_score': 100,
            'dajiang_score': 10, 'fourth_penalty': 0, 'is_protected': True,
            'bg_color': '#6db3f2', 'bg_gradient': '', 'description': '开始学习立直麻将的基础',
        },
        {
            'name': '雀士', 'level_order': 3, 'initial_score': 0, 'promotion_score': 300,
            'dajiang_score': 15, 'fourth_penalty': 0, 'is_protected': True,
            'bg_color': '#7bc67e', 'bg_gradient': '', 'description': '正式踏入雀士之路',
        },
        {
            'name': '雀杰', 'level_order': 4, 'initial_score': 100, 'promotion_score': 500,
            'dajiang_score': 20, 'fourth_penalty': 5, 'is_protected': False,
            'bg_color': '#c9a84c', 'bg_gradient': '', 'description': '实力出众的雀杰',
        },
        {
            'name': '雀豪', 'level_order': 5, 'initial_score': 200, 'promotion_score': 1000,
            'dajiang_score': 25, 'fourth_penalty': 10, 'is_protected': False,
            'bg_color': '#d4845a', 'bg_gradient': '', 'description': '豪气干云的雀豪',
        },
        {
            'name': '雀灵', 'level_order': 6, 'initial_score': 500, 'promotion_score': 1200,
            'dajiang_score': 30, 'fourth_penalty': 20, 'is_protected': False,
            'bg_color': '#b47bcc', 'bg_gradient': '', 'description': '灵气逼人的雀灵',
        },
        {
            'name': '雀王', 'level_order': 7, 'initial_score': 600, 'promotion_score': 1400,
            'dajiang_score': 30, 'fourth_penalty': 30, 'is_protected': False,
            'bg_color': '#e8637a', 'bg_gradient': '', 'description': '称王称霸的雀王',
        },
        {
            'name': '雀圣', 'level_order': 8, 'initial_score': 700, 'promotion_score': 1600,
            'dajiang_score': 30, 'fourth_penalty': 40, 'is_protected': False,
            'bg_color': '#4fc1e8', 'bg_gradient': '', 'description': '超凡入圣的雀圣',
        },
        {
            'name': '雀尊', 'level_order': 9, 'initial_score': 800, 'promotion_score': 2000,
            'dajiang_score': 30, 'fourth_penalty': 50, 'is_protected': False,
            'bg_color': '#a8d8ea', 'bg_gradient': '', 'description': '至高无上的雀尊',
        },
        {
            'name': '雀神-人间境', 'level_order': 10, 'initial_score': 1000, 'promotion_score': 2500,
            'dajiang_score': 30, 'fourth_penalty': 60, 'is_protected': False,
            'bg_color': '#ff8c42', 'bg_gradient': 'linear-gradient(135deg, #ff8c42, #ff6b6b)', 'description': '雀神之路·人间境',
        },
        {
            'name': '雀神-修罗境', 'level_order': 11, 'initial_score': 1300, 'promotion_score': 3000,
            'dajiang_score': 30, 'fourth_penalty': 70, 'is_protected': False,
            'bg_color': '#ff6b6b', 'bg_gradient': 'linear-gradient(135deg, #ff6b6b, #c0392b)', 'description': '雀神之路·修罗境',
        },
        {
            'name': '雀神-魔神境', 'level_order': 12, 'initial_score': 1500, 'promotion_score': 4000,
            'dajiang_score': 30, 'fourth_penalty': 80, 'is_protected': False,
            'bg_color': '#9b59b6', 'bg_gradient': 'linear-gradient(135deg, #9b59b6, #6c3483)', 'description': '雀神之路·魔神境',
        },
        {
            'name': '雀神-鬼神境', 'level_order': 13, 'initial_score': 2000, 'promotion_score': 5000,
            'dajiang_score': 30, 'fourth_penalty': 90, 'is_protected': False,
            'bg_color': '#2c3e50', 'bg_gradient': 'linear-gradient(135deg, #2c3e50, #1a252f)', 'description': '雀神之路·鬼神境',
        },
        {
            'name': '雀神-赤木鬼神境', 'level_order': 14, 'initial_score': 2500, 'promotion_score': 7000,
            'dajiang_score': 30, 'fourth_penalty': 100, 'is_protected': False,
            'bg_color': '#e74c3c', 'bg_gradient': 'linear-gradient(135deg, #e74c3c, #c0392b, #8e44ad)', 'description': '雀神之路·赤木鬼神境',
        },
        {
            'name': '魂天', 'level_order': 15, 'initial_score': 7000, 'promotion_score': 0,
            'dajiang_score': 30, 'fourth_penalty': 100, 'is_protected': False,
            'bg_color': '#f39c12', 'bg_gradient': 'linear-gradient(135deg, #f39c12, #e74c3c, #9b59b6)', 'description': '至高之境·魂天',
        },
    ]

    for t in tiers_data:
        RankTier.objects.get_or_create(name=t['name'], defaults=t)

    uma_defaults = [
        {
            'name': '四麻半庄(默认)',
            'player_count': 4,
            'game_mode': 'half_match',
            'uma_1st': 30,
            'uma_2nd': 10,
            'uma_3rd': -10,
            'uma_4th': -30,
            'base_score': 250,
            'is_active': True,
        },
        {
            'name': '四麻东风(默认)',
            'player_count': 4,
            'game_mode': 'east_wind',
            'uma_1st': 15,
            'uma_2nd': 5,
            'uma_3rd': -5,
            'uma_4th': -15,
            'base_score': 250,
            'is_active': True,
        },
        {
            'name': '三麻半庄(默认)',
            'player_count': 3,
            'game_mode': 'half_match',
            'uma_1st': 30,
            'uma_2nd': 0,
            'uma_3rd': -30,
            'base_score': 350,
            'is_active': True,
        },
        {
            'name': '三麻东风(默认)',
            'player_count': 3,
            'game_mode': 'east_wind',
            'uma_1st': 15,
            'uma_2nd': 0,
            'uma_3rd': -15,
            'base_score': 350,
            'is_active': True,
        },
    ]

    for u in uma_defaults:
        UmaConfig.objects.get_or_create(
            name=u['name'],
            player_count=u['player_count'],
            game_mode=u['game_mode'],
            defaults=u,
        )


class Migration(migrations.Migration):
    dependencies = [
        ('ranking', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(create_default_tiers_and_uma, reverse_code=migrations.RunPython.noop),
    ]
