from rest_framework import serializers

from .models import Category, Task


class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ["id", "name", "color"]


class TaskSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source="category.name", read_only=True, default=None)

    class Meta:
        model = Task
        fields = [
            "id", "title", "description", "priority", "deadline",
            "estimated_duration_minutes", "status", "category", "category_name",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate_category(self, category):
        request = self.context["request"]
        if category is not None and category.owner_id != request.user.id:
            raise serializers.ValidationError("Category does not belong to this user.")
        return category
