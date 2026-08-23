import { describe, expect, it } from "vitest";
import { checkPasswordStrength } from "./password";

describe("checkPasswordStrength", () => {
  it("accepts a strong password", () => {
    expect(checkPasswordStrength("Str0ng!Passw0rd").valid).toBe(true);
  });

  it("rejects passwords shorter than 10 characters", () => {
    const result = checkPasswordStrength("Ab1!");
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("at least 10 characters"))).toBe(true);
  });

  it("rejects passwords missing a character class", () => {
    expect(checkPasswordStrength("alllowercase1").valid).toBe(false); // no uppercase/symbol
    expect(checkPasswordStrength("ALLUPPERCASE1").valid).toBe(false); // no lowercase/symbol
    expect(checkPasswordStrength("NoDigitsHere!").valid).toBe(false); // no digit
  });

  it("flags common breached passwords by their denylist message", () => {
    const result = checkPasswordStrength("Password123");
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("too common"))).toBe(true);
  });
});
