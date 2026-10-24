import { afterEach, describe, expect, it } from "vitest";
import { parseCallback, startCallbackServer, type CallbackHandle } from "../src/callback-server.js";
import { SonoraError } from "../src/errors.js";
import { freePort } from "./helpers.js";

const url = (qs: string): URL => new URL(`http://127.0.0.1:8888/callback?${qs}`);

describe("parseCallback", () => {
  it("returns the code when state matches", () => {
    expect(parseCallback(url("code=abc&state=xyz"), "xyz")).toEqual({ code: "abc" });
  });

  it("rejects a wrong state", () => {
    expect(() => parseCallback(url("code=abc&state=evil"), "xyz")).toThrow(
      expect.objectContaining({ code: "state_mismatch" }),
    );
  });

  it("rejects a missing state, even when an error or code is present", () => {
    expect(() => parseCallback(url("code=abc"), "xyz")).toThrow(
      expect.objectContaining({ code: "state_mismatch" }),
    );
    expect(() => parseCallback(url("error=access_denied"), "xyz")).toThrow(
      expect.objectContaining({ code: "state_mismatch" }),
    );
  });

  it("rejects states of different length without throwing a crypto error", () => {
    expect(() => parseCallback(url("code=abc&state=x"), "xyz")).toThrow(SonoraError);
  });

  it("surfaces access_denied clearly", () => {
    expect(() => parseCallback(url("error=access_denied&state=xyz"), "xyz")).toThrow(/denied/);
  });

  it("requires a code", () => {
    expect(() => parseCallback(url("state=xyz"), "xyz")).toThrow(/authorization code/);
  });
});

describe("callback server", () => {
  let handle: CallbackHandle | undefined;
  afterEach(async () => {
    await handle?.close();
    handle = undefined;
  });

  const hit = (port: number, path: string): Promise<Response> =>
    fetch(`http://127.0.0.1:${port}${path}`);

  it("ignores a wrong-state request, then accepts the right one", async () => {
    handle = await startCallbackServer({ port: 0, expectedState: "good", timeoutMs: 5000 });
    const bad = await hit(handle.port, "/callback?code=stolen&state=bad");
    expect(bad.status).toBe(400);
    const ok = await hit(handle.port, "/callback?code=real&state=good");
    expect(ok.status).toBe(200);
    await expect(handle.result).resolves.toEqual({ code: "real" });
  });

  it("404s other paths and never reflects query input", async () => {
    handle = await startCallbackServer({ port: 0, expectedState: "good", timeoutMs: 5000 });
    expect((await hit(handle.port, "/other")).status).toBe(404);
    const res = await hit(handle.port, "/callback?state=bad&code=<script>alert(1)</script>");
    expect(await res.text()).not.toContain("<script>alert");
  });

  it("times out", async () => {
    handle = await startCallbackServer({ port: 0, expectedState: "s", timeoutMs: 50 });
    await expect(handle.result).rejects.toMatchObject({ code: "callback_timeout" });
  });

  it("binds to loopback only and reports EADDRINUSE clearly", async () => {
    const port = await freePort();
    handle = await startCallbackServer({ port, expectedState: "s" });
    await expect(startCallbackServer({ port, expectedState: "s" })).rejects.toThrow(
      /already in use/,
    );
  });
});
