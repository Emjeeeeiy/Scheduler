from django.conf import settings
from django.db import models


class Event(models.Model):
    class Source(models.TextChoices):
        MANUAL = "manual", "Manual"
        AI_SUGGESTION = "ai_suggestion", "AI suggestion"

    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="events")
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    start_time = models.DateTimeField()
    end_time = models.DateTimeField()
    all_day = models.BooleanField(default=False)
    related_task = models.ForeignKey(
        "tasks.Task", null=True, blank=True, on_delete=models.SET_NULL, related_name="events"
    )
    source = models.CharField(max_length=20, choices=Source.choices, default=Source.MANUAL)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["start_time"]
        indexes = [models.Index(fields=["owner", "start_time"])]

    def __str__(self):
        return self.title
