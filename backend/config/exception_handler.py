from rest_framework.views import exception_handler
from rest_framework.response import Response
from rest_framework import status
from common.exceptions import BusinessException


def custom_exception_handler(exc, context):
    response = exception_handler(exc, context)

    if isinstance(exc, BusinessException):
        return Response(
            {'error': exc.message, 'code': exc.code},
            status=exc.code,
        )

    if response is not None:
        data = response.data
        if isinstance(data, dict):
            msgs = []
            for key, value in data.items():
                if isinstance(value, list):
                    msgs.extend([f'{key}: {v}' for v in value])
                else:
                    msgs.append(f'{key}: {value}')
            response.data = {'error': '; '.join(msgs), 'code': response.status_code}

    return response
