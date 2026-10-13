from rest_framework import status
from rest_framework.exceptions import APIException
from rest_framework.views import exception_handler


class BusinessRuleError(APIException):
    """Action refusée par une règle métier (statut incompatible, conflit...)."""

    status_code = status.HTTP_409_CONFLICT
    default_detail = "Action impossible dans l'état actuel."
    default_code = "business_rule"

    def __init__(self, detail=None, code=None):
        super().__init__(detail=detail, code=code)


def api_exception_handler(exc, context):
    """Ajoute un champ `code` stable que l'application mobile peut interpréter."""
    response = exception_handler(exc, context)
    if response is not None and isinstance(response.data, dict) and "detail" in response.data:
        codes = exc.get_codes() if isinstance(exc, APIException) else None
        if isinstance(codes, str):
            response.data["code"] = codes
    return response
