import { SignJWT, jwtVerify } from "jose";
import { getEnv } from "./env";

export interface AccessTokenClaims {
  sub: string; // userId
  username: string;
  roles: string[];
  permissions: string[];
  sessionId: string;
}

function accessSecret() {
  return new TextEncoder().encode(getEnv().AUTH_JWT_ACCESS_SECRET);
}

export async function signAccessToken(claims: AccessTokenClaims): Promise<string> {
  const env = getEnv();
  return new SignJWT({ ...claims })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt()
    .setIssuer("bingo-platform")
    .setExpirationTime(`${env.AUTH_JWT_ACCESS_TTL_SECONDS}s`)
    .sign(accessSecret());
}

export async function verifyAccessToken(token: string): Promise<AccessTokenClaims | null> {
  try {
    const { payload } = await jwtVerify(token, accessSecret(), { issuer: "bingo-platform" });
    if (
      typeof payload.sub !== "string" ||
      typeof payload.username !== "string" ||
      !Array.isArray(payload.roles) ||
      !Array.isArray(payload.permissions) ||
      typeof payload.sessionId !== "string"
    ) {
      return null;
    }
    return {
      sub: payload.sub,
      username: payload.username as string,
      roles: payload.roles as string[],
      permissions: payload.permissions as string[],
      sessionId: payload.sessionId,
    };
  } catch {
    return null;
  }
}
