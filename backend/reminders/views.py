from django.utils import timezone
from rest_framework import permissions, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from tasks.permissions import IsOwner

from .models import Reminder
from .serializers import ReminderSerializer


class ReminderViewSet(viewsets.ModelViewSet):
    serializer_class = ReminderSerializer
    permission_classes = [permissions.IsAuthenticated, IsOwner]

    def get_queryset(self):
        queryset = Reminder.objects.filter(owner=self.request.user)
        sent_param = self.request.query_params.get("sent")
        if sent_param is not None:
            queryset = queryset.filter(sent=sent_param.lower() == "true")
        if self.request.query_params.get("due") == "true":
            queryset = queryset.filter(sent=False, remind_at__lte=timezone.now())
        return queryset

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user)

    @action(detail=True, methods=["post"])
    def dismiss(self, request, pk=None):
        reminder = self.get_object()
        reminder.sent = True
        reminder.save(update_fields=["sent"])
        return Response(ReminderSerializer(reminder).data)
