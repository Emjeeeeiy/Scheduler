from rest_framework.routers import DefaultRouter

from .views import ScheduleSuggestionViewSet

router = DefaultRouter()
router.register("optimize-schedule", ScheduleSuggestionViewSet, basename="schedule-suggestion")

urlpatterns = router.urls
