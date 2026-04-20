import os
import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from django.contrib.auth import get_user_model

User = get_user_model()
username = os.environ.get("ADMIN_USER", "admin")
password = os.environ.get("ADMIN_PASS", "admin123")

if User.objects.filter(username=username).exists():
    print(f"  Admin user '{username}' already exists")
else:
    User.objects.create_superuser(username, "", password)
    print(f"  Admin created: {username} / {password}")
