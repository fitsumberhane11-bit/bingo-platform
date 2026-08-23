import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { apiError, apiSuccess } from "@bingo/shared-types";
import { ProviderNotConfiguredError } from "@bingo/payments";
import { AppError, ForbiddenError } from "./errors";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Defense-in-depth CSRF check using the Fetch Metadata `Sec-Fetch-Site`
 * header: browsers set this themselves on every request and a cross-site
 * attacker page cannot spoof or suppress it, unlike a JSON body or a custom
 * header. Only rejects when the browser explicitly reports "cross-site" —
 * absence of the header (non-browser HTTP clients: server-to-server
 * payment-provider callbacks, curl, older browsers, this repo's own
 * integration tests) is NOT treated as an attack signal, since failing
 * closed on absence would both break legitimate non-browser callers and
 * misrepresent what this check can actually prove. This complements, not
 * replaces, the SameSite=Lax cookie policy already in place — SameSite
 * blocks the classic cross-site cookie-riding request outright, this catches
 * cases where a cross-site fetch/XHR is made without relying on cookies.
 */
function isDisallowedCrossSiteRequest(req: Request): boolean {
  return req.headers.get("sec-fetch-site") === "cross-site";
}

/**
 * Wraps a Next.js route handler so every API route returns the same
 * { success, data | error } envelope and every thrown error is translated
 * consistently instead of leaking stack traces or ad-hoc shapes.
 */
export function withApiHandler<Args extends unknown[]>(
  handler: (...args: Args) => Promise<Response>,
) {
  return async (...args: Args): Promise<Response> => {
    try {
      const maybeReq = args[0] as Request | undefined;
      if (maybeReq && typeof maybeReq.method === "string" && typeof maybeReq.headers?.get === "function") {
        if (MUTATING_METHODS.has(maybeReq.method) && isDisallowedCrossSiteRequest(maybeReq)) {
          throw new ForbiddenError("Cross-site requests are not permitted.");
        }
      }
      return await handler(...args);
    } catch (err) {
      if (err instanceof ZodError) {
        const fieldErrors: Record<string, string[]> = {};
        for (const issue of err.issues) {
          const key = issue.path.join(".") || "_";
          (fieldErrors[key] ??= []).push(issue.message);
        }
        return NextResponse.json(apiError("VALIDATION_ERROR", "Invalid input.", fieldErrors), {
          status: 400,
        });
      }
      if (err instanceof AppError) {
        return NextResponse.json(apiError(err.code, err.message, err.fieldErrors), {
          status: err.httpStatus,
        });
      }
      if (err instanceof ProviderNotConfiguredError) {
        return NextResponse.json(apiError("PROVIDER_NOT_CONFIGURED", err.message), { status: 503 });
      }
      // eslint-disable-next-line no-console
      console.error("Unhandled API error:", err);
      return NextResponse.json(apiError("INTERNAL_ERROR", "Something went wrong. Please try again."), {
        status: 500,
      });
    }
  };
}

export function jsonOk<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(apiSuccess(data), init);
}
