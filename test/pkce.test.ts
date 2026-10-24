import { describe, expect, it } from "vitest";
import {
  createCodeChallenge,
  createCodeVerifier,
  createState,
  isValidCodeVerifier,
} from "../src/pkce.js";

describe("PKCE", () => {
  it("matches the RFC 7636 Appendix B test vector", () => {
    expect(createCodeChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe(
      "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
    );
  });

  it("generates RFC-compliant, unique verifiers", () => {
    const a = createCodeVerifier();
    const b = createCodeVerifier();
    expect(isValidCodeVerifier(a)).toBe(true);
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(43);
    expect(a.length).toBeLessThanOrEqual(128);
  });

  it("rejects invalid verifiers", () => {
    expect(isValidCodeVerifier("short")).toBe(false);
    expect(isValidCodeVerifier("a".repeat(129))).toBe(false);
    expect(isValidCodeVerifier("a".repeat(50) + "!")).toBe(false);
  });

  it("produces unpadded base64url challenges and high-entropy states", () => {
    expect(createCodeChallenge(createCodeVerifier())).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(createState()).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(createState()).not.toBe(createState());
  });
});
