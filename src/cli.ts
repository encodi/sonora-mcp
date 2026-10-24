import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SCOPES_BY_MODE, configDir, loadConfig } from "./config.js";
import { SonoraError } from "./errors.js";
import { createLogger, parseLogLevel } from "./logger.js";
import { login, openBrowser } from "./login.js";
import { redactSecrets } from "./redact.js";
import { createServer } from "./server.js";
import { SpotifyClient } from "./spotify-client.js";
import { TokenManager } from "./token-manager.js";
import { TokenStore } from "./token-store.js";

export type Command = "serve" | "login" | "logout" | "status" | "help" | "version";

export interface ParsedCli {
  command: Command;
  mode: string | undefined;
  noOpen: boolean;
}

const COMMANDS: readonly string[] = ["serve", "login", "logout", "status", "help", "version"];

export function parseCli(argv: readonly string[]): ParsedCli {
  const { values, positionals } = parseArgs({
    args: [...argv],
    allowPositionals: true,
    options: {
      mode: { type: "string" },
      "no-open": { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
      version: { type: "boolean", short: "v", default: false },
    },
  });
  if (values.help) return { command: "help", mode: values.mode, noOpen: values["no-open"] };
  if (values.version) return { command: "version", mode: values.mode, noOpen: values["no-open"] };
  const word = positionals[0] ?? "serve";
  if (!COMMANDS.includes(word) || positionals.length > 1) {
    throw new SonoraError("config", `Unknown command "${positionals.join(" ")}". Run with --help.`);
  }
  return { command: word as Command, mode: values.mode, noOpen: values["no-open"] };
}

export const HELP = `sonora-mcp - Spotify MCP server (stdio, OAuth PKCE, no client secret)

Usage:
  sonora-mcp [serve] [--mode read-only|playback]   Start the MCP server on stdio (default)
  sonora-mcp login   [--mode read-only|playback] [--no-open]
                                                   Authorize with Spotify (opens/prints a URL)
  sonora-mcp logout                                Delete the stored tokens
  sonora-mcp status                                Show the stored login (no secrets)

Environment:
  SPOTIFY_CLIENT_ID       Spotify app Client ID (required for serve/login)
  SPOTIFY_REDIRECT_PORT   Loopback callback port (default 8888)
  SONORA_MODE             read-only (default) | playback
  SONORA_LOG_LEVEL        error | warn | info (default) | debug
  XDG_CONFIG_HOME         Tokens live in $XDG_CONFIG_HOME/sonora-mcp (or ~/.config/sonora-mcp)
`;

function readVersion(): string {
  const raw = readFileSync(new URL("../package.json", import.meta.url), "utf8");
  return (JSON.parse(raw) as { version: string }).version;
}

export async function run(argv: readonly string[], env: NodeJS.ProcessEnv): Promise<void> {
  const cli = parseCli(argv);
  const out = (line: string): void => {
    process.stdout.write(`${line}\n`);
  };
  const logger = createLogger(parseLogLevel(env["SONORA_LOG_LEVEL"]));
  const store = new TokenStore(configDir(env));

  switch (cli.command) {
    case "help":
      process.stdout.write(HELP);
      return;
    case "version":
      out(readVersion());
      return;
    case "logout": {
      const removed = await store.clear();
      out(removed ? `Logged out: deleted ${store.file}` : "No stored login found.");
      out("Tip: you can also revoke access at https://www.spotify.com/account/apps/");
      return;
    }
    case "status": {
      const tokens = await store.load();
      if (tokens === null) {
        out("Not logged in. Run `sonora-mcp login`.");
        return;
      }
      out(`Logged in (token file: ${store.file})`);
      out(`Scopes: ${tokens.scopes.join(" ")}`);
      out(`Access token expires: ${new Date(tokens.expiresAt).toISOString()} (auto-refreshed)`);
      return;
    }
    case "login": {
      const config = loadConfig(env, { mode: cli.mode });
      const granted = await login({
        config,
        store,
        print: out,
        open: cli.noOpen ? undefined : openBrowser,
      });
      out(`\nLogin successful. Granted scopes: ${granted.join(" ")}`);
      out(`Tokens stored in ${store.file} (permissions 0600).`);
      return;
    }
    case "serve": {
      const config = loadConfig(env, { mode: cli.mode });
      const tokens = new TokenManager({
        store,
        clientId: config.clientId,
        requiredScopes: SCOPES_BY_MODE[config.mode],
      });
      const server = createServer({
        client: new SpotifyClient({ tokens }),
        mode: config.mode,
        version: readVersion(),
      });
      await server.connect(new StdioServerTransport());
      logger.info(`MCP server running on stdio in "${config.mode}" mode.`);
      return;
    }
  }
}

export function formatFatal(error: unknown): string {
  if (error instanceof SonoraError) return redactSecrets(error.message);
  if (error instanceof Error && error.name === "TypeError" && "code" in error) {
    return "Invalid command-line arguments. Run with --help.";
  }
  return "Unexpected error. Re-run with SONORA_LOG_LEVEL=debug for details.";
}
