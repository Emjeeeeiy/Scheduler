from django.conf import settings
from django.db import models


class ScheduleSuggestion(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        ACCEPTED = "accepted", "Accepted"
        REJECTED = "rejected", "Rejected"
        FAILED = "failed", "Failed"

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="schedule_suggestions"
    )
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING)
    model_used = models.CharField(max_length=64)
    request_context = models.JSONField()
    raw_response = models.JSONField(null=True, blank=True)
    overall_reasoning = models.TextField(blank=True)
    error_message = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    decided_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"Suggestion #{self.pk} ({self.status})"


class SuggestedItem(models.Model):
    suggestion = models.ForeignKey(ScheduleSuggestion, on_delete=models.CASCADE, related_name="items")
    task = models.ForeignKey("tasks.Task", on_delete=models.CASCADE, related_name="ai_suggestions")
    proposed_start = models.DateTimeField()
    proposed_end = models.DateTimeField()
    reasoning = models.TextField(blank=True)
    accepted = models.BooleanField(null=True)
    resulting_event = models.ForeignKey(
        "events.Event", null=True, blank=True, on_delete=models.SET_NULL,
        related_name="source_suggestion_item",
    )

    class Meta:
        ordering = ["proposed_start"]

    def __str__(self):
        return f"Item for task {self.task_id} ({self.proposed_start} - {self.proposed_end})"
