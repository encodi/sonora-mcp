import { describe, expect, it } from "vitest";
import {
  SCOPES_BY_MODE,
  configDir,
  loadConfig,
  parseMode,
  parsePort,
  redirectUriForPort,
} from "../src/config.js";
import { FAKE_CLIENT_ID } from "./helpers.js";

describe("config", () => {
  it("requires SPOTIFY_CLIENT_ID with a helpful message", () => {
    expect(() => loadConfig({})).toThrow(/SPOTIFY_CLIENT_ID is not set/);
    expect(() => loadConfig({ SPOTIFY_CLIENT_ID: "bad id!" })).toThrow(/does not look like/);
  });

  it("defaults to read-only mode, port 8888 and the exact redirect URI", () => {
    const config = loadConfig({ SPOTIFY_CLIENT_ID: FAKE_CLIENT_ID });
    expect(config.mode).toBe("read-only");
    expect(config.redirectPort).toBe(8888);
    expect(config.redirectUri).toBe("http://127.0.0.1:8888/callback");
  });

  it("honours SPOTIFY_REDIRECT_PORT, SONORA_MODE and a --mode override", () => {
    const env = {
      SPOTIFY_CLIENT_ID: FAKE_CLIENT_ID,
      SPOTIFY_REDIRECT_PORT: "9999",
      SONORA_MODE: "playback",
    };
    expect(loadConfig(env)).toMatchObject({
      mode: "playback",
      redirectUri: "http://127.0.0.1:9999/callback",
    });
    expect(loadConfig(env, { mode: "read-only" }).mode).toBe("read-only");
  });

  it("validates mode and port", () => {
    expect(() => parseMode("admin")).toThrow(/Invalid mode/);
    expect(() => parsePort("80")).toThrow(/Invalid SPOTIFY_REDIRECT_PORT/);
    expect(() => parsePort("abc")).toThrow(/Invalid SPOTIFY_REDIRECT_PORT/);
    expect(redirectUriForPort(1234)).toBe("http://127.0.0.1:1234/callback");
  });

  it("uses minimal scopes; playback only adds user-modify-playback-state", () => {
    expect(SCOPES_BY_MODE["read-only"]).toEqual([
      "user-read-playback-state",
      "user-read-currently-playing",
    ]);
    expect(SCOPES_BY_MODE.playback).toEqual([
      ...SCOPES_BY_MODE["read-only"],
      "user-modify-playback-state",
    ]);
  });

  it("stores config under XDG_CONFIG_HOME or ~/.config", () => {
    expect(configDir({ XDG_CONFIG_HOME: "/x/cfg" }, "/home/u")).toBe("/x/cfg/sonora-mcp");
    expect(configDir({}, "/home/u")).toBe("/home/u/.config/sonora-mcp");
    expect(configDir({ XDG_CONFIG_HOME: "relative" }, "/home/u")).toBe(
      "/home/u/.config/sonora-mcp",
    );
  });
});
