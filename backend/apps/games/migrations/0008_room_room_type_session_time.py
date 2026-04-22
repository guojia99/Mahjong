from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('games', '0007_game_paipu_data_alter_game_game_mode'),
    ]

    operations = [
        migrations.AddField(
            model_name='room',
            name='room_type',
            field=models.CharField(
                choices=[('offline', '线下场'), ('online', '线上场')],
                default='offline',
                max_length=20,
                verbose_name='房间类型',
            ),
        ),
        migrations.AddField(
            model_name='room',
            name='session_time',
            field=models.DateTimeField(
                blank=True, null=True, verbose_name='场次时间',
            ),
        ),
    ]
