from rest_framework import serializers

from .models import ScheduleSuggestion, SuggestedItem


class SuggestedItemSerializer(serializers.ModelSerializer):
    task_title = serializers.CharField(source="task.title", read_only=True)

    class Meta:
        model = SuggestedItem
        fields = [
            "id", "task", "task_title", "proposed_start", "proposed_end",
            "reasoning", "accepted", "resulting_event",
        ]
        read_only_fields = fields


class ScheduleSuggestionSerializer(serializers.ModelSerializer):
    items = SuggestedItemSerializer(many=True, read_only=True)

    class Meta:
        model = ScheduleSuggestion
        fields = [
            "id", "status", "model_used", "overall_reasoning", "error_message",
            "items", "created_at", "decided_at",
        ]
        read_only_fields = fields
