import { chmod, readdir, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TokenStore } from "../src/token-store.js";
import { sampleTokens, tempDir } from "./helpers.js";

const posix = process.platform !== "win32";

describe("TokenStore", () => {
  it("returns null when nothing is stored", async () => {
    const store = new TokenStore(join(await tempDir(), "sonora-mcp"));
    await expect(store.load()).resolves.toBeNull();
  });

  it("round-trips tokens", async () => {
    const store = new TokenStore(join(await tempDir(), "sonora-mcp"));
    const tokens = sampleTokens();
    await store.save(tokens);
    await expect(store.load()).resolves.toEqual(tokens);
  });

  it.runIf(posix)("creates the directory as 0700 and the file as 0600", async () => {
    const store = new TokenStore(join(await tempDir(), "nested", "sonora-mcp"));
    await store.save(sampleTokens());
    expect((await stat(store.dir)).mode & 0o777).toBe(0o700);
    expect((await stat(store.file)).mode & 0o777).toBe(0o600);
  });

  it.runIf(posix)(
    "keeps 0600 when overwriting and leaves no temp files (atomic write)",
    async () => {
      const store = new TokenStore(join(await tempDir(), "sonora-mcp"));
      await store.save(sampleTokens());
      await store.save(sampleTokens({ accessToken: "second" }));
      expect((await stat(store.file)).mode & 0o777).toBe(0o600);
      expect(await readdir(store.dir)).toEqual(["tokens.json"]);
      expect((await store.load())?.accessToken).toBe("second");
    },
  );

  it.runIf(posix)("tightens loosened permissions on load", async () => {
    const store = new TokenStore(join(await tempDir(), "sonora-mcp"));
    await store.save(sampleTokens());
    await chmod(store.file, 0o644);
    await chmod(store.dir, 0o755);
    await store.load();
    expect((await stat(store.file)).mode & 0o777).toBe(0o600);
    expect((await stat(store.dir)).mode & 0o777).toBe(0o700);
  });

  it("reports a corrupt file clearly without leaking its content", async () => {
    const store = new TokenStore(join(await tempDir(), "sonora-mcp"));
    await store.save(sampleTokens());
    await writeFile(store.file, '{"accessToken":"SECRET-VALUE"', { mode: 0o600 });
    const error = await store.load().catch((e: unknown) => e as Error);
    expect(error).toMatchObject({ code: "storage" });
    expect((error as Error).message).not.toContain("SECRET-VALUE");
    expect((error as Error).message).toMatch(/logout/);
  });

  it("rejects schema-invalid content", async () => {
    const store = new TokenStore(join(await tempDir(), "sonora-mcp"));
    await store.save(sampleTokens());
    await writeFile(store.file, JSON.stringify({ version: 1 }), { mode: 0o600 });
    await expect(store.load()).rejects.toMatchObject({ code: "storage" });
  });

  it("clear deletes the file and reports whether it existed", async () => {
    const store = new TokenStore(join(await tempDir(), "sonora-mcp"));
    await expect(store.clear()).resolves.toBe(false);
    await store.save(sampleTokens());
    await expect(store.clear()).resolves.toBe(true);
    await expect(store.load()).resolves.toBeNull();
  });
});
