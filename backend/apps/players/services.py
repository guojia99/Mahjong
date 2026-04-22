from common.exceptions import BusinessException


class PlayerService:
    @staticmethod
    def create_player(user, **kwargs):
        from .models import Player
        kwargs['created_by'] = user
        return Player.objects.create(**kwargs)

    @staticmethod
    def update_player(player, **kwargs):
        for key, value in kwargs.items():
            setattr(player, key, value)
        player.save()
        return player

    @staticmethod
    def delete_player(player):
        player.delete()

    @staticmethod
    def add_majsoul_account(player, uid, nickname):
        from .models import MahjongSoulAccount
        if MahjongSoulAccount.objects.filter(uid=uid).exists():
            raise BusinessException('该UID已绑定其他雀士', code=409)
        return MahjongSoulAccount.objects.create(
            player=player, uid=uid, nickname=nickname
        )

    @staticmethod
    def remove_majsoul_account(account):
        account.delete()

    @staticmethod
    def bind_majsoul_account(account_id, player):
        from .models import MahjongSoulAccount
        try:
            account = MahjongSoulAccount.objects.get(pk=account_id)
        except MahjongSoulAccount.DoesNotExist:
            raise BusinessException('雀魂账号不存在')
        if account.player_id and account.player_id != player.id:
            raise BusinessException('该账号已绑定其他雀士', code=409)
        account.player = player
        account.save()
        return account

    @staticmethod
    def get_player_by_majsoul_uid(uid):
        from .models import MahjongSoulAccount
        try:
            account = MahjongSoulAccount.objects.select_related('player').get(uid=uid)
            return account.player
        except MahjongSoulAccount.DoesNotExist:
            return None

    @staticmethod
    def search_players(query=''):
        from .models import Player
        qs = Player.objects.all()
        if query:
            qs = qs.filter(nickname__icontains=query) | qs.filter(real_name__icontains=query)
        return qs
