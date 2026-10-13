from drf_spectacular.utils import extend_schema
from rest_framework import mixins, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from .models import Notification, PushToken


class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = ["id", "kind", "title", "body", "data", "is_read", "created_at"]


class PushTokenSerializer(serializers.ModelSerializer):
    class Meta:
        model = PushToken
        fields = ["token", "platform"]
        extra_kwargs = {"token": {"validators": []}}


class NotificationViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    serializer_class = NotificationSerializer

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return Notification.objects.none()
        qs = Notification.objects.filter(user=self.request.user)
        if self.request.query_params.get("unread") == "true":
            qs = qs.filter(is_read=False)
        return qs

    @extend_schema(request=None, responses={200: NotificationSerializer})
    @action(detail=True, methods=["post"])
    def read(self, request, pk=None):
        notification = self.get_queryset().get(pk=pk)
        notification.is_read = True
        notification.save(update_fields=["is_read", "updated_at"])
        return Response(NotificationSerializer(notification).data)

    @extend_schema(request=None, responses={204: None})
    @action(detail=False, methods=["post"], url_path="read-all")
    def read_all(self, request):
        self.get_queryset().filter(is_read=False).update(is_read=True)
        return Response(status=status.HTTP_204_NO_CONTENT)

    @extend_schema(responses={200: {"type": "object", "properties": {"count": {"type": "integer"}}}})
    @action(detail=False, methods=["get"], url_path="unread-count")
    def unread_count(self, request):
        return Response({"count": Notification.objects.filter(user=request.user, is_read=False).count()})


class PushTokenViewSet(mixins.CreateModelMixin, viewsets.GenericViewSet):
    """Enregistre le jeton Expo du téléphone. Un jeton appartient au dernier utilisateur connecté sur l'appareil."""

    serializer_class = PushTokenSerializer

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        PushToken.objects.update_or_create(
            token=serializer.validated_data["token"],
            defaults={"user": request.user, "platform": serializer.validated_data.get("platform", "")},
        )
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @extend_schema(request=PushTokenSerializer, responses={204: None})
    @action(detail=False, methods=["post"])
    def unregister(self, request):
        PushToken.objects.filter(user=request.user, token=request.data.get("token", "")).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
