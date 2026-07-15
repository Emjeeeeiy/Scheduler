from rest_framework import serializers

from .models import Reminder


class ReminderSerializer(serializers.ModelSerializer):
    class Meta:
        model = Reminder
        fields = ["id", "task", "event", "remind_at", "method", "sent", "message", "created_at"]
        read_only_fields = ["id", "sent", "created_at"]

    def validate(self, attrs):
        task = attrs.get("task", getattr(self.instance, "task", None))
        event = attrs.get("event", getattr(self.instance, "event", None))
        if not task and not event:
            raise serializers.ValidationError("A reminder must be linked to a task or an event.")

        request = self.context["request"]
        if task and task.owner_id != request.user.id:
            raise serializers.ValidationError("Task does not belong to this user.")
        if event and event.owner_id != request.user.id:
            raise serializers.ValidationError("Event does not belong to this user.")
        return attrs
