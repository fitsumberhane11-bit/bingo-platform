/**
 * Rule-based password strength check (no external scoring library — keeps the
 * shared package dependency-light while still enforcing meaningful entropy).
 * Mirrors OWASP ASVS baseline: length + character-class diversity + a denylist
 * of the most commonly breached passwords, rather than length alone.
 */
const COMMON_PASSWORDS = new Set([
  "password", "password1", "12345678", "123456789", "qwertyui",
  "letmein11", "admin1234", "welcome11", "bingo1234", "ethiopia1",
  "iloveyou1", "abc123456", "password123",
]);

export interface PasswordCheckResult {
  valid: boolean;
  errors: string[];
}

export function checkPasswordStrength(password: string): PasswordCheckResult {
  const errors: string[] = [];

  if (password.length < 10) errors.push("Password must be at least 10 characters long.");
  if (password.length > 128) errors.push("Password must be at most 128 characters long.");
  if (!/[a-z]/.test(password)) errors.push("Password must include a lowercase letter.");
  if (!/[A-Z]/.test(password)) errors.push("Password must include an uppercase letter.");
  if (!/[0-9]/.test(password)) errors.push("Password must include a number.");
  if (!/[^a-zA-Z0-9]/.test(password)) errors.push("Password must include a special character.");
  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    errors.push("This password is too common. Choose something less predictable.");
  }

  return { valid: errors.length === 0, errors };
}
