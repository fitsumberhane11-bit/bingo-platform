"use client";

import type { ApiResponse } from "@bingo/shared-types";

export class ApiClientError extends Error {
  constructor(public code: string, message: string, public fieldErrors?: Record<string, string[]>) {
    super(message);
  }
}

export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
      ...options?.headers,
    },
    credentials: "include",
  });

  const body = (await res.json()) as ApiResponse<T>;
  if (!body.success) {
    throw new ApiClientError(body.error.code, body.error.message, body.error.fieldErrors);
  }
  return body.data;
}

export function apiPost<T>(path: string, data?: unknown): Promise<T> {
  return apiFetch<T>(path, { method: "POST", body: data ? JSON.stringify(data) : undefined });
}

export function apiPatch<T>(path: string, data?: unknown): Promise<T> {
  return apiFetch<T>(path, { method: "PATCH", body: data ? JSON.stringify(data) : undefined });
}

export function apiPut<T>(path: string, data?: unknown): Promise<T> {
  return apiFetch<T>(path, { method: "PUT", body: data ? JSON.stringify(data) : undefined });
}

export function apiGet<T>(path: string): Promise<T> {
  return apiFetch<T>(path, { method: "GET" });
}

export function apiDelete<T>(path: string): Promise<T> {
  return apiFetch<T>(path, { method: "DELETE" });
}
