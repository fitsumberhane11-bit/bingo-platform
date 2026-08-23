export interface ApiError {
  code: string;
  message: string;
  fieldErrors?: Record<string, string[]>;
}

export type ApiResponse<T> =
  | { success: true; data: T }
  | { success: false; error: ApiError };

export function apiSuccess<T>(data: T): ApiResponse<T> {
  return { success: true, data };
}

export function apiError(code: string, message: string, fieldErrors?: Record<string, string[]>): ApiResponse<never> {
  return { success: false, error: { code, message, fieldErrors } };
}
