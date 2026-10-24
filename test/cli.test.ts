import { describe, expect, it } from "vitest";
import { formatFatal, parseCli } from "../src/cli.js";
import { SonoraError } from "../src/errors.js";

describe("parseCli", () => {
  it("defaults to serve", () => {
    expect(parseCli([])).toMatchObject({ command: "serve", noOpen: false });
  });

  it("parses login with flags", () => {
    expect(parseCli(["login", "--mode", "playback", "--no-open"])).toEqual({
      command: "login",
      mode: "playback",
      noOpen: true,
    });
  });

  it("supports logout, status, help and version", () => {
    expect(parseCli(["logout"]).command).toBe("logout");
    expect(parseCli(["status"]).command).toBe("status");
    expect(parseCli(["--help"]).command).toBe("help");
    expect(parseCli(["-v"]).command).toBe("version");
  });

  it("rejects unknown commands", () => {
    expect(() => parseCli(["frobnicate"])).toThrow(/Unknown command/);
  });

  it("formatFatal never leaks unknown error details", () => {
    expect(formatFatal(new SonoraError("config", "bad config"))).toBe("bad config");
    expect(formatFatal(new Error("secret access_token=abc"))).not.toContain("abc");
  });
});
