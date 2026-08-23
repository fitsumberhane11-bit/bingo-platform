import { hash, verify } from "@node-rs/argon2";

/**
 * Argon2id via @node-rs/argon2 (prebuilt native bindings, no node-gyp/build
 * toolchain required at install time — important for both this sandbox and
 * for reproducible Docker builds). Parameters follow OWASP's Argon2id
 * baseline recommendation (m=19MiB, t=2, p=1) for an interactive login path.
 *
 * `algorithm: 2` is `Algorithm.Argon2id` — the library exports that as a
 * `const enum`, which isolatedModules (required by our build tooling)
 * cannot import, so the numeric value is inlined here instead.
 */
const ARGON2_OPTIONS = {
  algorithm: 2 as const, // Algorithm.Argon2id
  memoryCost: 19456, // KiB
  timeCost: 2,
  parallelism: 1,
};

export async function hashPassword(plain: string): Promise<string> {
  return hash(plain, ARGON2_OPTIONS);
}

export async function verifyPassword(passwordHash: string, plain: string): Promise<boolean> {
  try {
    return await verify(passwordHash, plain, ARGON2_OPTIONS);
  } catch {
    return false;
  }
}
