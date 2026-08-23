import { describe, expect, it } from "vitest";
import { isValidEthiopianPhone, normalizeEthiopianPhone } from "./phone";

describe("Ethiopian phone validation", () => {
  it("accepts a valid +251 mobile number", () => {
    expect(isValidEthiopianPhone("+251912345678")).toBe(true);
  });

  it("normalizes a local 09... number to E.164", () => {
    expect(normalizeEthiopianPhone("0912345678")).toBe("+251912345678");
  });

  it("accepts the newer 07... mobile range", () => {
    expect(isValidEthiopianPhone("+251712345678")).toBe(true);
  });

  it("rejects landline-shaped numbers", () => {
    expect(isValidEthiopianPhone("+251112345678")).toBe(false);
  });

  it("rejects numbers from other countries", () => {
    expect(isValidEthiopianPhone("+14155552671")).toBe(false);
  });

  it("rejects garbage input", () => {
    expect(isValidEthiopianPhone("not-a-phone-number")).toBe(false);
  });
});
