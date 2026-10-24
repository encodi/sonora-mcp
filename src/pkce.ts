import { createHash, randomBytes } from "node:crypto";

/** RFC 7636 §4.1: 43-128 chars from the unreserved set. 64 random bytes -> 86 chars. */
export function createCodeVerifier(bytes = 64): string {
  return randomBytes(bytes).toString("base64url");
}

export function isValidCodeVerifier(verifier: string): boolean {
  return /^[A-Za-z0-9._~-]{43,128}$/.test(verifier);
}

/** RFC 7636 §4.2 (S256): BASE64URL(SHA256(verifier)), unpadded. */
export function createCodeChallenge(verifier: string): string {
  return createHash("sha256").update(verifier, "ascii").digest("base64url");
}

/** Opaque anti-CSRF value bound to a single authorization attempt. */
export function createState(): string {
  return randomBytes(32).toString("base64url");
}
