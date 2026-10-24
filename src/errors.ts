/** Stable, user-facing error codes. Messages never contain secrets. */
export type SonoraErrorCode =
  | "config"
  | "not_authenticated"
  | "insufficient_scope"
  | "auth_failed"
  | "state_mismatch"
  | "callback_timeout"
  | "storage"
  | "spotify_api"
  | "network";

export class SonoraError extends Error {
  readonly code: SonoraErrorCode;

  constructor(code: SonoraErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "SonoraError";
    this.code = code;
  }
}

export class SpotifyApiError extends SonoraError {
  readonly status: number;
  readonly reason: string | undefined;
  /** Seconds to wait before retrying (HTTP 429). */
  readonly retryAfterSeconds: number | undefined;

  constructor(
    status: number,
    message: string,
    extra: { reason?: string | undefined; retryAfterSeconds?: number | undefined } = {},
  ) {
    super("spotify_api", message);
    this.name = "SpotifyApiError";
    this.status = status;
    this.reason = extra.reason;
    this.retryAfterSeconds = extra.retryAfterSeconds;
  }
}
