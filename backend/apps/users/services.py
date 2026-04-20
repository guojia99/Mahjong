from django.contrib.auth import authenticate
from rest_framework.authtoken.models import Token
from common.exceptions import BusinessException


class AuthService:
    @staticmethod
    def login(request, username, password):
        user = authenticate(request, username=username, password=password)
        if user is None:
            raise BusinessException('用户名或密码错误', code=401)
        token, _ = Token.objects.get_or_create(user=user)
        return {'user': user, 'token': token.key}

    @staticmethod
    def logout(user):
        Token.objects.filter(user=user).delete()

    @staticmethod
    def get_current_user(user):
        return user

    @staticmethod
    def register(username, password):
        from django.contrib.auth import get_user_model
        User = get_user_model()
        if User.objects.filter(username=username).exists():
            raise BusinessException('用户名已存在', code=409)
        user = User.objects.create_user(username=username, password=password)
        token, _ = Token.objects.get_or_create(user=user)
        return {'user': user, 'token': token.key}
