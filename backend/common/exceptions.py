class BusinessException(Exception):
    def __init__(self, message, code=400):
        self.message = message
        self.code = code
        super().__init__(message)


class ScoreValidationError(BusinessException):
    def __init__(self, message):
        super().__init__(message, code=422)


class PlayerAlreadyInGame(BusinessException):
    def __init__(self, message):
        super().__init__(message, code=409)


class GameAlreadyScored(BusinessException):
    def __init__(self, message):
        super().__init__(message, code=409)
