from rest_framework import serializers

from apps.common.validators import validate_no_contact_info

from .models import Review


class ReviewCreateSerializer(serializers.Serializer):
    rating = serializers.IntegerField(min_value=1, max_value=5)
    comment = serializers.CharField(required=False, allow_blank=True, max_length=500, default="")

    def validate_comment(self, value):
        try:
            validate_no_contact_info(value)
        except Exception as exc:
            raise serializers.ValidationError(getattr(exc, "messages", [str(exc)])[0]) from exc
        return value


class ReviewSerializer(serializers.ModelSerializer):
    author_name = serializers.CharField(source="author.public_name", read_only=True)

    class Meta:
        model = Review
        fields = ["id", "shipment", "author_name", "target_role", "rating", "comment", "created_at"]

