from rest_framework import mixins, serializers, viewsets

from .models import Report


class ReportSerializer(serializers.ModelSerializer):
    status_label = serializers.CharField(source="get_status_display", read_only=True)

    class Meta:
        model = Report
        fields = ["id", "reason", "description", "cargo", "shipment", "reported_user", "status", "status_label", "created_at"]
        read_only_fields = ["status", "reported_user", "created_at"]

    def validate(self, attrs):
        user = self.context["request"].user
        cargo, shipment = attrs.get("cargo"), attrs.get("shipment")
        if not cargo and not shipment:
            raise serializers.ValidationError("Indiquez l'annonce ou le transport concerné.")
        if shipment and user.pk not in (shipment.client_id, shipment.driver.user_id):
            raise serializers.ValidationError({"shipment": "Vous ne participez pas à ce transport."})
        # Personne signalée déduite du contexte, jamais fournie par le client.
        if shipment:
            attrs["reported_user"] = shipment.driver.user if user.pk == shipment.client_id else shipment.client
            attrs["cargo"] = shipment.cargo
        elif cargo:
            attrs["reported_user"] = cargo.client
        return attrs


class ReportViewSet(mixins.CreateModelMixin, mixins.ListModelMixin, viewsets.GenericViewSet):
    serializer_class = ReportSerializer

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return Report.objects.none()
        return Report.objects.filter(reporter=self.request.user)

    def perform_create(self, serializer):
        serializer.save(reporter=self.request.user)
