from django.contrib.auth import authenticate
from rest_framework.authtoken.models import Token
from common.exceptions import BusinessException


class AuthService:
    @staticmethod
    def login(request, username, password):
        user = authenticate(request, username=username, password=password)
        if user is None:
            raise BusinessException('用户名或密码错误', code=401)
        if not user.is_staff:
            raise BusinessException('仅管理员可登录', code=403)
        token, _ = Token.objects.get_or_create(user=user)
        return {'user': user, 'token': token.key}

    @staticmethod
    def logout(user):
        Token.objects.filter(user=user).delete()

    @staticmethod
    def get_current_user(user):
        return user
