from django.conf import settings
from django.db import models


class Category(models.Model):
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="categories")
    name = models.CharField(max_length=50)
    color = models.CharField(max_length=7, default="#3b82f6")

    class Meta:
        unique_together = ("owner", "name")
        ordering = ["name"]

    def __str__(self):
        return self.name


class Task(models.Model):
    class Priority(models.TextChoices):
        LOW = "low", "Low"
        MEDIUM = "medium", "Medium"
        HIGH = "high", "High"
        URGENT = "urgent", "Urgent"

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        SCHEDULED = "scheduled", "Scheduled"
        IN_PROGRESS = "in_progress", "In progress"
        COMPLETED = "completed", "Completed"
        CANCELLED = "cancelled", "Cancelled"

    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="tasks")
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    priority = models.CharField(max_length=10, choices=Priority.choices, default=Priority.MEDIUM)
    deadline = models.DateTimeField(null=True, blank=True)
    estimated_duration_minutes = models.PositiveIntegerField(null=True, blank=True)
    status = models.CharField(max_length=15, choices=Status.choices, default=Status.PENDING)
    category = models.ForeignKey(
        Category, null=True, blank=True, on_delete=models.SET_NULL, related_name="tasks"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["owner", "status"]),
            models.Index(fields=["owner", "deadline"]),
        ]

    def __str__(self):
        return self.title
