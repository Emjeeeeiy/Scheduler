from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/auth/", include("accounts.urls")),
    path("api/", include("tasks.urls")),
    path("api/", include("events.urls")),
    path("api/reminders/", include("reminders.urls")),
    path("api/ai/", include("ai_scheduler.urls")),
]
