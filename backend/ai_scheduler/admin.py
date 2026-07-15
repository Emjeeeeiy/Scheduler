from django.contrib import admin

from .models import ScheduleSuggestion, SuggestedItem

admin.site.register(ScheduleSuggestion)
admin.site.register(SuggestedItem)
