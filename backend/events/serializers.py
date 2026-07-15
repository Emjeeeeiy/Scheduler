from rest_framework import serializers

from .models import Event


class EventSerializer(serializers.ModelSerializer):
    class Meta:
        model = Event
        fields = [
            "id", "title", "description", "start_time", "end_time", "all_day",
            "related_task", "source", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "source", "created_at", "updated_at"]

    def validate(self, attrs):
        start = attrs.get("start_time", getattr(self.instance, "start_time", None))
        end = attrs.get("end_time", getattr(self.instance, "end_time", None))
        if start and end and end <= start:
            raise serializers.ValidationError("end_time must be after start_time.")
        return attrs

    def validate_related_task(self, task):
        request = self.context["request"]
        if task is not None and task.owner_id != request.user.id:
            raise serializers.ValidationError("Task does not belong to this user.")
        return task
