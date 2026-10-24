import { describe, expect, it } from "vitest";
import { createLogger } from "../src/logger.js";
import { redactSecrets, redactValue } from "../src/redact.js";

describe("redaction", () => {
  it("redacts bearer tokens, JSON fields and query params", () => {
    const text =
      "Authorization: Bearer BQD-secret.value " +
      '{"access_token":"AAA","refresh_token":"BBB"} ' +
      "https://x/callback?code=CCC&state=DDD code_verifier=EEE";
    const out = redactSecrets(text);
    for (const secret of ["BQD-secret", "AAA", "BBB", "CCC", "DDD", "EEE"]) {
      expect(out).not.toContain(secret);
    }
    expect(out).toContain("[REDACTED]");
  });

  it("redacts sensitive keys in structured metadata", () => {
    const out = JSON.stringify(
      redactValue({ accessToken: "AAA", nested: { Authorization: "Bearer BBB", ok: "fine" } }),
    );
    expect(out).not.toContain("AAA");
    expect(out).not.toContain("BBB");
    expect(out).toContain("fine");
  });

  it("logger redacts messages and metadata and respects levels", () => {
    const lines: string[] = [];
    const log = createLogger("info", (l) => lines.push(l));
    log.info("token: Bearer ZZZ", { refresh_token: "YYY" });
    log.debug("hidden");
    expect(lines).toHaveLength(1);
    expect(lines[0]).not.toMatch(/ZZZ|YYY/);
  });
});
