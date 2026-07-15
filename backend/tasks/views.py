from rest_framework import permissions, viewsets

from .models import Category, Task
from .permissions import IsOwner
from .serializers import CategorySerializer, TaskSerializer


class CategoryViewSet(viewsets.ModelViewSet):
    serializer_class = CategorySerializer
    permission_classes = [permissions.IsAuthenticated, IsOwner]

    def get_queryset(self):
        return Category.objects.filter(owner=self.request.user)

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user)


class TaskViewSet(viewsets.ModelViewSet):
    serializer_class = TaskSerializer
    permission_classes = [permissions.IsAuthenticated, IsOwner]

    def get_queryset(self):
        queryset = Task.objects.filter(owner=self.request.user)

        status_param = self.request.query_params.get("status")
        if status_param:
            queryset = queryset.filter(status=status_param)

        priority_param = self.request.query_params.get("priority")
        if priority_param:
            queryset = queryset.filter(priority=priority_param)

        category_param = self.request.query_params.get("category")
        if category_param:
            queryset = queryset.filter(category_id=category_param)

        ordering = self.request.query_params.get("ordering")
        if ordering in ("deadline", "-deadline", "created_at", "-created_at", "priority", "-priority"):
            queryset = queryset.order_by(ordering)

        return queryset

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user)
