from rest_framework import serializers
from .models import Player, MahjongSoulAccount


class MahjongSoulAccountSerializer(serializers.ModelSerializer):
    class Meta:
        model = MahjongSoulAccount
        fields = ['id', 'uid', 'nickname', 'player', 'created_at']
        read_only_fields = ['id', 'created_at']


class PlayerBriefSerializer(serializers.ModelSerializer):
    class Meta:
        model = Player
        fields = ['id', 'nickname']


class PlayerListSerializer(serializers.ModelSerializer):
    majsoul_uids = serializers.SerializerMethodField()

    class Meta:
        model = Player
        fields = ['id', 'nickname', 'real_name', 'avatar', 'majsoul_uids', 'created_at']

    def get_majsoul_uids(self, obj):
        return list(obj.majsoul_accounts.values_list('uid', flat=True))


class PlayerDetailSerializer(serializers.ModelSerializer):
    majsoul_accounts = MahjongSoulAccountSerializer(many=True, read_only=True)

    class Meta:
        model = Player
        fields = [
            'id', 'nickname', 'real_name', 'avatar',
            'extra_info', 'majsoul_accounts', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class PlayerCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Player
        fields = ['nickname', 'real_name', 'avatar', 'extra_info']

    def create(self, validated_data):
        validated_data['created_by'] = self.context['request'].user
        return super().create(validated_data)


class PlayerUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Player
        fields = ['nickname', 'real_name', 'avatar', 'extra_info']


class MahjongSoulAccountCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = MahjongSoulAccount
        fields = ['uid', 'nickname']

    def validate_uid(self, value):
        if MahjongSoulAccount.objects.filter(uid=value).exists():
            raise serializers.ValidationError('该UID已绑定其他雀士')
        return value
