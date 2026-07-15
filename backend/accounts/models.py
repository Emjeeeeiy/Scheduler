from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    email = models.EmailField(unique=True)
    timezone = models.CharField(max_length=64, default="UTC")
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.username
