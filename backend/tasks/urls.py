from rest_framework.routers import DefaultRouter

from .views import CategoryViewSet, TaskViewSet

router = DefaultRouter()
router.register("tasks", TaskViewSet, basename="task")
router.register("categories", CategoryViewSet, basename="category")

urlpatterns = router.urls
