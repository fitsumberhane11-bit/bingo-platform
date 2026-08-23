export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public httpStatus: number,
    public fieldErrors?: Record<string, string[]>,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class ValidationError extends AppError {
  constructor(message = "Invalid input.", fieldErrors?: Record<string, string[]>) {
    super("VALIDATION_ERROR", message, 400, fieldErrors);
  }
}

export class AuthError extends AppError {
  constructor(message = "Authentication required.") {
    super("UNAUTHENTICATED", message, 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "You do not have permission to perform this action.") {
    super("FORBIDDEN", message, 403);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Resource not found.") {
    super("NOT_FOUND", message, 404);
  }
}

export class ConflictError extends AppError {
  constructor(message = "This action conflicts with existing data.") {
    super("CONFLICT", message, 409);
  }
}

export class RateLimitError extends AppError {
  constructor(message = "Too many requests. Please try again later.", public retryAfterSeconds?: number) {
    super("RATE_LIMITED", message, 429);
  }
}

export class MaintenanceModeError extends AppError {
  constructor(message = "The platform is temporarily under maintenance. Please try again shortly.") {
    super("MAINTENANCE_MODE", message, 503);
  }
}

export class ResponsibleGamingLimitError extends AppError {
  constructor(message: string) {
    super("RESPONSIBLE_GAMING_LIMIT", message, 403);
  }
}

export class SelfExclusionActiveError extends AppError {
  constructor(message: string) {
    super("SELF_EXCLUSION_ACTIVE", message, 403);
  }
}
