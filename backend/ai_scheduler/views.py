import datetime as dt

from django.db import transaction
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework import mixins, permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from events.models import Event
from events.services import get_free_busy_blocks
from tasks.models import Task
from tasks.permissions import IsOwner

from .claude_client import OptimizationError, request_schedule_optimization
from .models import ScheduleSuggestion, SuggestedItem
from .serializers import ScheduleSuggestionSerializer

DEFAULT_HORIZON_DAYS = 7


class ScheduleSuggestionViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    serializer_class = ScheduleSuggestionSerializer
    permission_classes = [permissions.IsAuthenticated, IsOwner]

    def get_queryset(self):
        return ScheduleSuggestion.objects.filter(owner=self.request.user).prefetch_related("items")

    def create(self, request, *args, **kwargs):
        horizon_days = request.data.get("horizon_days", DEFAULT_HORIZON_DAYS)
        try:
            horizon_days = int(horizon_days)
        except (TypeError, ValueError):
            raise ValidationError({"horizon_days": "Must be an integer."})

        now = timezone.now()
        horizon_end = now + dt.timedelta(days=horizon_days)

        pending_tasks = list(Task.objects.filter(owner=request.user, status=Task.Status.PENDING))
        _, free_blocks = get_free_busy_blocks(request.user, now, horizon_end)

        request_context = {
            "horizon_days": horizon_days,
            "task_ids": [t.id for t in pending_tasks],
            "free_blocks": [
                {"start": s.isoformat(), "end": e.isoformat()} for s, e in free_blocks
            ],
        }

        if not pending_tasks or not free_blocks:
            suggestion = ScheduleSuggestion.objects.create(
                owner=request.user,
                status=ScheduleSuggestion.Status.FAILED,
                model_used="",
                request_context=request_context,
                error_message="No pending tasks or no free time available to schedule against.",
            )
            return Response(
                self.get_serializer(suggestion).data, status=status.HTTP_422_UNPROCESSABLE_ENTITY
            )

        try:
            parsed, model_used = request_schedule_optimization(request.user, pending_tasks, free_blocks, now)
        except OptimizationError as exc:
            suggestion = ScheduleSuggestion.objects.create(
                owner=request.user,
                status=ScheduleSuggestion.Status.FAILED,
                model_used="",
                request_context=request_context,
                error_message=str(exc),
            )
            return Response(
                self.get_serializer(suggestion).data, status=status.HTTP_502_BAD_GATEWAY
            )

        tasks_by_id = {t.id: t for t in pending_tasks}
        suggestion = ScheduleSuggestion.objects.create(
            owner=request.user,
            status=ScheduleSuggestion.Status.PENDING,
            model_used=model_used,
            request_context=request_context,
            raw_response=parsed.model_dump(mode="json"),
            overall_reasoning=parsed.overall_reasoning,
        )
        SuggestedItem.objects.bulk_create([
            SuggestedItem(
                suggestion=suggestion,
                task=tasks_by_id[item.task_id],
                proposed_start=item.proposed_start,
                proposed_end=item.proposed_end,
                reasoning=item.reasoning,
            )
            for item in parsed.suggestions
        ])

        return Response(self.get_serializer(suggestion).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"])
    def accept(self, request, pk=None):
        suggestion = self.get_object()
        if suggestion.status != ScheduleSuggestion.Status.PENDING:
            raise ValidationError({"status": "Only pending suggestions can be accepted."})

        item_ids = request.data.get("item_ids")
        overrides = request.data.get("overrides", {})

        items_qs = suggestion.items.filter(accepted__isnull=True)
        if item_ids is not None:
            items_qs = items_qs.filter(id__in=item_ids)
        items = list(items_qs.select_related("task"))

        if not items:
            raise ValidationError({"item_ids": "No matching pending items on this suggestion."})

        created_events = []
        skipped = []

        with transaction.atomic():
            for item in items:
                start = item.proposed_start
                end = item.proposed_end
                override = overrides.get(str(item.id)) or overrides.get(item.id)
                if override:
                    override_start = parse_datetime(override.get("start", "")) if override.get("start") else None
                    override_end = parse_datetime(override.get("end", "")) if override.get("end") else None
                    if override_start:
                        start = override_start
                    if override_end:
                        end = override_end

                conflict = Event.objects.filter(
                    owner=request.user, start_time__lt=end, end_time__gt=start
                ).exists()
                if conflict:
                    item.accepted = False
                    item.save(update_fields=["accepted"])
                    skipped.append({"item_id": item.id, "reason": "Conflicts with an existing event."})
                    continue

                event = Event.objects.create(
                    owner=request.user,
                    title=item.task.title,
                    description=item.reasoning,
                    start_time=start,
                    end_time=end,
                    related_task=item.task,
                    source=Event.Source.AI_SUGGESTION,
                )
                item.accepted = True
                item.resulting_event = event
                item.save(update_fields=["accepted", "resulting_event"])
                created_events.append(event.id)

                item.task.status = Task.Status.SCHEDULED
                item.task.save(update_fields=["status"])

            suggestion.status = ScheduleSuggestion.Status.ACCEPTED
            suggestion.decided_at = timezone.now()
            suggestion.save(update_fields=["status", "decided_at"])

        return Response({
            "suggestion": self.get_serializer(suggestion).data,
            "created_event_ids": created_events,
            "skipped": skipped,
        })

    @action(detail=True, methods=["post"])
    def reject(self, request, pk=None):
        suggestion = self.get_object()
        if suggestion.status != ScheduleSuggestion.Status.PENDING:
            raise ValidationError({"status": "Only pending suggestions can be rejected."})

        item_ids = request.data.get("item_ids")
        items_qs = suggestion.items.filter(accepted__isnull=True)
        if item_ids is not None:
            items_qs = items_qs.filter(id__in=item_ids)
        items_qs.update(accepted=False)

        if not suggestion.items.filter(accepted__isnull=True).exists():
            suggestion.status = ScheduleSuggestion.Status.REJECTED
            suggestion.decided_at = timezone.now()
            suggestion.save(update_fields=["status", "decided_at"])

        return Response(self.get_serializer(suggestion).data)
