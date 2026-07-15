import datetime as dt

from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework import permissions, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from tasks.permissions import IsOwner

from .models import Event
from .serializers import EventSerializer
from .services import get_free_busy_blocks


class EventViewSet(viewsets.ModelViewSet):
    serializer_class = EventSerializer
    permission_classes = [permissions.IsAuthenticated, IsOwner]

    def get_queryset(self):
        queryset = Event.objects.filter(owner=self.request.user)

        start = self.request.query_params.get("start")
        end = self.request.query_params.get("end")
        if start:
            parsed = parse_datetime(start)
            if parsed:
                queryset = queryset.filter(end_time__gte=parsed)
        if end:
            parsed = parse_datetime(end)
            if parsed:
                queryset = queryset.filter(start_time__lte=parsed)

        return queryset

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user, source=Event.Source.MANUAL)

    @action(detail=False, methods=["get"], url_path="free-busy")
    def free_busy(self, request):
        start_param = request.query_params.get("start")
        end_param = request.query_params.get("end")
        if not start_param or not end_param:
            raise ValidationError({"start": "start and end query params are required."})

        start = parse_datetime(start_param)
        end = parse_datetime(end_param)
        if not start or not end:
            raise ValidationError({"start": "start and end must be ISO-8601 datetimes."})
        if timezone.is_naive(start):
            start = timezone.make_aware(start, dt.timezone.utc)
        if timezone.is_naive(end):
            end = timezone.make_aware(end, dt.timezone.utc)

        busy, free = get_free_busy_blocks(request.user, start, end)
        return Response({
            "busy": [{"start": s.isoformat(), "end": e.isoformat()} for s, e in busy],
            "free": [{"start": s.isoformat(), "end": e.isoformat()} for s, e in free],
        })
