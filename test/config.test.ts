import { describe, expect, it } from "vitest";
import {
  SCOPES_BY_MODE,
  modeLabel,
  modesCovering,
  parseModes,
  scopesForModes,
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
    expect(config.modes).toEqual(["read-only"]);
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
      modes: ["playback"],
      redirectUri: "http://127.0.0.1:9999/callback",
    });
    expect(loadConfig(env, { mode: "read-only" }).modes).toEqual(["read-only"]);
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

  describe("modes and scopes (#11)", () => {
    it("keeps the Sprint 1 scopes of read-only and playback exactly as they were", () => {
      expect(SCOPES_BY_MODE["read-only"]).toEqual([
        "user-read-playback-state",
        "user-read-currently-playing",
      ]);
      expect(SCOPES_BY_MODE.playback).toEqual([
        "user-read-playback-state",
        "user-read-currently-playing",
        "user-modify-playback-state",
      ]);
    });

    it("library, playlists and playback add only what they need on top of the base", () => {
      const base = SCOPES_BY_MODE["read-only"];
      expect(SCOPES_BY_MODE.library).toEqual([
        ...base,
        "user-library-read",
        "user-library-modify",
        "user-read-recently-played",
        "user-top-read",
        "playlist-read-private",
        "playlist-read-collaborative",
      ]);
      expect(SCOPES_BY_MODE.playlists).toEqual([
        ...base,
        "playlist-read-private",
        "playlist-read-collaborative",
        "playlist-modify-private",
        "playlist-modify-public",
      ]);
      // Only `playlists` may write playlists; only `library` touches the saved-tracks library.
      expect(SCOPES_BY_MODE.library).not.toContain("playlist-modify-private");
      expect(SCOPES_BY_MODE.playlists).not.toContain("user-library-modify");
      expect(SCOPES_BY_MODE.playback).not.toContain("user-library-read");
    });

    it("parses comma-separated modes into a normalised set", () => {
      expect(parseModes(undefined)).toEqual(["read-only"]);
      expect(parseModes("")).toEqual(["read-only"]);
      expect(parseModes("playback, library ,playback")).toEqual(["library", "playback"]);
      expect(() => parseModes("library,admin")).toThrow(/Invalid mode "admin"/);
      expect(
        loadConfig({ SPOTIFY_CLIENT_ID: FAKE_CLIENT_ID }, { mode: "playback,library" }).modes,
      ).toEqual(["library", "playback"]);
    });

    it("combined modes request the deduplicated union of scopes", () => {
      const scopes = scopesForModes(["library", "playlists", "playback"]);
      expect(new Set(scopes).size).toBe(scopes.length);
      expect(scopes).toContain("user-modify-playback-state");
      expect(scopes).toContain("playlist-modify-public");
      expect(scopes).toContain("user-top-read");
    });

    it("labels modes and picks the login modes that cover missing scopes", () => {
      expect(modeLabel(["read-only"])).toBe("read-only");
      expect(modeLabel(["read-only", "library", "playback"])).toBe("library,playback");
      expect(modesCovering(["user-modify-playback-state"])).toEqual(["playback"]);
      expect(modesCovering(["playlist-modify-private", "user-top-read"])).toEqual([
        "library",
        "playlists",
      ]);
      expect(modesCovering(["something-else"])).toEqual(["read-only"]);
    });
  });
});
