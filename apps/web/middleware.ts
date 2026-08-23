import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

/**
 * Edge-compatible coarse gate: redirects unauthenticated visitors away from
 * protected route groups before a page even renders. This is a UX
 * convenience only — it does NOT decide *what* an authenticated user is
 * allowed to do. Real authorization (RBAC permission checks against the
 * database) happens server-side in each page/API route via
 * `requireApiPermission` / `loadAccessContext`, per the "never trust the
 * client, always re-check on the server" rule. The Edge runtime can't reach
 * Postgres, which is precisely why permission checks are deferred to Node
 * route handlers instead of living here.
 */
const PROTECTED_PREFIXES = [
  "/dashboard",
  "/play",
  "/room",
  "/tickets",
  "/wallet",
  "/transactions",
  "/notifications",
  "/profile",
  "/security",
  "/admin",
];

const ACCESS_COOKIE = "bingo_at";

async function isValidAccessToken(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const secret = process.env.AUTH_JWT_ACCESS_SECRET;
  if (!secret) return false;
  try {
    await jwtVerify(token, new TextEncoder().encode(secret), { issuer: "bingo-platform" });
    return true;
  } catch {
    return false;
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isProtected = PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  const res = NextResponse.next();

  if (isProtected) {
    const token = req.cookies.get(ACCESS_COOKIE)?.value;
    const valid = await isValidAccessToken(token);
    if (!valid) {
      const loginUrl = new URL("/login", req.url);
      loginUrl.searchParams.set("next", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return res;
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/play/:path*",
    "/room/:path*",
    "/tickets/:path*",
    "/wallet/:path*",
    "/transactions/:path*",
    "/notifications/:path*",
    "/profile/:path*",
    "/security/:path*",
    "/admin/:path*",
  ],
};
