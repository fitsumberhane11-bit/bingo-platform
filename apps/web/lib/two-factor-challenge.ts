import { SignJWT, jwtVerify } from "jose";
import { getEnv } from "./env";

// Deliberately reuses the access-token secret but with its own short TTL
// and a distinct `typ` header + `purpose` claim — verifyAccessToken()'s
// shape check (requires roles/permissions/sessionId arrays) already fails
// closed against a challenge token, and vice versa, so the two token kinds
// can never be confused for one another even though they share a key.
const CHALLENGE_TTL_SECONDS = 5 * 60;

function secret() {
  return new TextEncoder().encode(getEnv().AUTH_JWT_ACCESS_SECRET);
}

export async function signTwoFactorChallenge(userId: string): Promise<string> {
  return new SignJWT({ purpose: "2fa_challenge", sub: userId })
    .setProtectedHeader({ alg: "HS256", typ: "2fa_challenge" })
    .setIssuedAt()
    .setIssuer("bingo-platform")
    .setExpirationTime(`${CHALLENGE_TTL_SECONDS}s`)
    .sign(secret());
}

export async function verifyTwoFactorChallenge(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, secret(), { issuer: "bingo-platform" });
    if (payload.purpose !== "2fa_challenge" || typeof payload.sub !== "string") return null;
    return payload.sub;
  } catch {
    return null;
  }
}
