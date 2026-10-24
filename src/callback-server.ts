import { timingSafeEqual } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { SonoraError } from "./errors.js";

export const CALLBACK_PATH = "/callback";
export const LOOPBACK_HOST = "127.0.0.1";

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * Validates the redirect from Spotify. `state` is checked FIRST (constant time):
 * nothing from a response with a wrong/missing state is trusted.
 */
export function parseCallback(url: URL, expectedState: string): { code: string } {
  const state = url.searchParams.get("state");
  if (state === null || !safeEqual(state, expectedState)) {
    throw new SonoraError(
      "state_mismatch",
      "The OAuth `state` did not match; the response was ignored (possible CSRF).",
    );
  }
  const error = url.searchParams.get("error");
  if (error !== null) {
    throw new SonoraError(
      "auth_failed",
      error === "access_denied"
        ? "Authorization was denied in Spotify."
        : `Spotify returned an authorization error (${error.slice(0, 60)}).`,
    );
  }
  const code = url.searchParams.get("code");
  if (code === null || code === "") {
    throw new SonoraError("auth_failed", "The callback did not include an authorization code.");
  }
  return { code };
}

export interface CallbackHandle {
  /** Actual port (useful when 0 was requested, e.g. in tests). */
  port: number;
  result: Promise<{ code: string }>;
  close(): Promise<void>;
}

const PAGE = (title: string, body: string): string =>
  `<!doctype html><meta charset="utf-8"><title>${title}</title>` +
  `<body style="font-family:system-ui;margin:3rem"><h1>${title}</h1><p>${body}</p></body>`;

/**
 * One-shot HTTP server bound to 127.0.0.1 only. Requests with a wrong `state`
 * get a 400 and are ignored (login keeps waiting until the timeout).
 */
export async function startCallbackServer(options: {
  port: number;
  expectedState: string;
  timeoutMs?: number;
}): Promise<CallbackHandle> {
  const timeoutMs = options.timeoutMs ?? 5 * 60_000;
  let settle: { resolve: (v: { code: string }) => void; reject: (e: unknown) => void } | undefined;
  const result = new Promise<{ code: string }>((resolve, reject) => {
    settle = { resolve, reject };
  });
  // Avoid an unhandled rejection if the caller only awaits `result` later.
  result.catch(() => undefined);

  const close = async (): Promise<void> => {
    clearTimeout(timer);
    const s = server;
    if (!s.listening) return;
    await new Promise<void>((resolve) => {
      s.close(() => {
        resolve();
      });
      s.closeAllConnections();
    });
  };

  const server: Server = createServer((req, res) => {
    const respond = (status: number, title: string, body: string): void => {
      res.writeHead(status, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
        Connection: "close",
      });
      res.end(PAGE(title, body));
    };
    const port = (server.address() as AddressInfo | null)?.port;
    const hostOk = req.headers.host === `${LOOPBACK_HOST}:${port}`;
    const url = new URL(req.url ?? "/", `http://${LOOPBACK_HOST}:${port}`);
    if (req.method !== "GET" || url.pathname !== CALLBACK_PATH || !hostOk) {
      respond(404, "Not found", "Nothing here.");
      return;
    }
    try {
      const { code } = parseCallback(url, options.expectedState);
      respond(200, "Sonora MCP", "Authorization complete. You can close this tab.");
      settle?.resolve({ code });
    } catch (error) {
      if (error instanceof SonoraError && error.code === "state_mismatch") {
        respond(400, "Invalid request", "State mismatch. This request was ignored.");
        return;
      }
      respond(400, "Authorization failed", "Return to the terminal for details.");
      settle?.reject(error);
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", (error: NodeJS.ErrnoException) => {
      reject(
        new SonoraError(
          "auth_failed",
          error.code === "EADDRINUSE"
            ? `Port ${options.port} is already in use. Free it or set SPOTIFY_REDIRECT_PORT (and register the matching redirect URI in the Spotify dashboard).`
            : `Could not start the local callback server: ${error.message}`,
          { cause: error },
        ),
      );
    });
    server.listen(options.port, LOOPBACK_HOST, resolve);
  });

  const timer: NodeJS.Timeout = setTimeout(() => {
    settle?.reject(
      new SonoraError(
        "callback_timeout",
        `Timed out after ${Math.round(timeoutMs / 1000)}s waiting for the Spotify authorization.`,
      ),
    );
  }, timeoutMs);
  timer.unref();

  const address = server.address() as AddressInfo;
  return { port: address.port, result, close };
}
