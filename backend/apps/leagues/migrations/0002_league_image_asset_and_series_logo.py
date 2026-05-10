# Generated manually for league logo stored in SQLite

import uuid
import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('leagues', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='LeagueImageAsset',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('mime_type', models.CharField(max_length=100, verbose_name='MIME 类型')),
                ('data', models.BinaryField(verbose_name='图片数据')),
                ('created_at', models.DateTimeField(auto_now_add=True, verbose_name='创建时间')),
            ],
            options={
                'db_table': 'league_image_assets',
            },
        ),
        migrations.AddField(
            model_name='leagueseries',
            name='logo_asset',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='+',
                to='leagues.leagueimageasset',
                verbose_name='联赛 Logo',
            ),
        ),
    ]
