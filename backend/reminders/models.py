from django.conf import settings
from django.db import models
from django.db.models import Q


class Reminder(models.Model):
    class Method(models.TextChoices):
        IN_APP = "in_app", "In-app"
        EMAIL = "email", "Email"

    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="reminders")
    task = models.ForeignKey(
        "tasks.Task", null=True, blank=True, on_delete=models.CASCADE, related_name="reminders"
    )
    event = models.ForeignKey(
        "events.Event", null=True, blank=True, on_delete=models.CASCADE, related_name="reminders"
    )
    remind_at = models.DateTimeField()
    method = models.CharField(max_length=10, choices=Method.choices, default=Method.IN_APP)
    sent = models.BooleanField(default=False)
    message = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["remind_at"]
        indexes = [models.Index(fields=["owner", "remind_at", "sent"])]
        constraints = [
            models.CheckConstraint(
                check=Q(task__isnull=False) | Q(event__isnull=False),
                name="reminder_has_task_or_event",
            )
        ]

    def __str__(self):
        return self.message or f"Reminder #{self.pk}"
