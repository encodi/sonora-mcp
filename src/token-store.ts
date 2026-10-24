import { randomBytes } from "node:crypto";
import { chmod, mkdir, open, readFile, rename, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { SonoraError } from "./errors.js";

export const DIR_MODE = 0o700;
export const FILE_MODE = 0o600;
export const TOKEN_FILE = "tokens.json";

const StoredTokensSchema = z.object({
  version: z.literal(1),
  clientId: z.string().min(1),
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  /** Epoch milliseconds at which the access token expires. */
  expiresAt: z.number().int().nonnegative(),
  scopes: z.array(z.string()),
});

export type StoredTokens = z.infer<typeof StoredTokensSchema>;

const isPosix = process.platform !== "win32";

function isMissing(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

/**
 * Persists OAuth tokens outside the repository: directory 0700, file 0600,
 * atomic writes (temp file in the same directory + fsync + rename).
 */
export class TokenStore {
  readonly dir: string;
  readonly file: string;

  constructor(dir: string) {
    this.dir = dir;
    this.file = join(dir, TOKEN_FILE);
  }

  async load(): Promise<StoredTokens | null> {
    let raw: string;
    try {
      await this.tightenPermissions();
      raw = await readFile(this.file, "utf8");
    } catch (error) {
      if (isMissing(error)) return null;
      throw new SonoraError("storage", `Could not read the token file at ${this.file}.`, {
        cause: error,
      });
    }
    try {
      return StoredTokensSchema.parse(JSON.parse(raw));
    } catch (error) {
      throw new SonoraError(
        "storage",
        `The token file at ${this.file} is corrupt. Run \`sonora-mcp logout\` and then \`sonora-mcp login\`.`,
        { cause: error },
      );
    }
  }

  async save(tokens: StoredTokens): Promise<void> {
    const data = JSON.stringify(StoredTokensSchema.parse(tokens), null, 2) + "\n";
    const temp = join(this.dir, `.${TOKEN_FILE}.${randomBytes(6).toString("hex")}.tmp`);
    try {
      await mkdir(this.dir, { recursive: true, mode: DIR_MODE });
      if (isPosix) await chmod(this.dir, DIR_MODE);
      // "wx": never follow or overwrite a pre-existing path; mode applies at creation.
      const handle = await open(temp, "wx", FILE_MODE);
      try {
        await handle.writeFile(data, "utf8");
        await handle.sync();
      } finally {
        await handle.close();
      }
      await rename(temp, this.file);
      if (isPosix) await chmod(this.file, FILE_MODE);
    } catch (error) {
      await rm(temp, { force: true }).catch(() => undefined);
      throw new SonoraError("storage", `Could not write the token file at ${this.file}.`, {
        cause: error,
      });
    }
  }

  /** Deletes the stored tokens. Returns whether a file existed. */
  async clear(): Promise<boolean> {
    try {
      await rm(this.file);
      return true;
    } catch (error) {
      if (isMissing(error)) return false;
      throw new SonoraError("storage", `Could not delete the token file at ${this.file}.`, {
        cause: error,
      });
    }
  }

  /** If a previous version or the user loosened permissions, put them back. */
  private async tightenPermissions(): Promise<void> {
    if (!isPosix) return;
    const file = await stat(this.file);
    if ((file.mode & 0o077) !== 0) await chmod(this.file, FILE_MODE);
    const dir = await stat(this.dir);
    if ((dir.mode & 0o077) !== 0) await chmod(this.dir, DIR_MODE);
  }
}
