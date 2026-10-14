class AppError(Exception):
    status_code = 500
    code = "internal_error"

    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


class NotFoundError(AppError):
    status_code = 404
    code = "not_found"


class InvalidStateError(AppError):
    status_code = 409
    code = "invalid_state"


class InvalidRouteError(AppError):
    status_code = 422
    code = "invalid_route"


class ServiceUnavailableError(AppError):
    status_code = 503
    code = "llm_unavailable"
