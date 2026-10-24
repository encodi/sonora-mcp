const REDACTED = "[REDACTED]";

const SENSITIVE_KEY = /token|secret|verifier|authorization|password|code|state/i;

const BEARER = /Bearer\s+[A-Za-z0-9._~+/=-]+/gi;
const KEY_VALUE =
  /((?:access_token|refresh_token|code_verifier|code_challenge|client_secret|code|state)["']?\s*[:=]\s*)("[^"]*"|'[^']*'|[^\s&,}"']+)/gi;

/** Redacts tokens, authorization codes, verifiers and similar values from free text. */
export function redactSecrets(text: string): string {
  return text.replace(BEARER, `Bearer ${REDACTED}`).replace(KEY_VALUE, `$1${REDACTED}`);
}

/** Deep-redacts structured log metadata: sensitive keys are replaced, strings are scrubbed. */
export function redactValue(value: unknown, depth = 0): unknown {
  if (typeof value === "string") return redactSecrets(value);
  if (value === null || typeof value !== "object") return value;
  if (depth > 6) return REDACTED;
  if (Array.isArray(value)) return value.map((item) => redactValue(item, depth + 1));
  if (value instanceof Error) return redactSecrets(value.message);
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      SENSITIVE_KEY.test(key) ? REDACTED : redactValue(item, depth + 1),
    ]),
  );
}
