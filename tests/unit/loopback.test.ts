import { describe, expect, it } from "vitest";
import {
  isLoopbackAuthority,
  isSameLoopbackOrigin,
  validateLoopbackHeaders,
} from "../../src/server/loopback.mjs";

describe("loopback enforcement", () => {
  it.each(["127.0.0.1:4317", "127.4.3.2", "[::1]:4317"])(
    "accepts explicit loopback authority %s",
    (host) => expect(isLoopbackAuthority(host)).toBe(true),
  );
  it.each([
    "localhost:4317",
    "0.0.0.0:4317",
    "192.0.2.20:4317",
    "crewdeck.example",
    "127.0.0.1.example",
    "127.0.0.1?remote",
    "127.0.0.1#remote",
  ])("rejects non-IP or non-loopback authority %s", (host) =>
    expect(isLoopbackAuthority(host)).toBe(false),
  );
  it("rejects every forwarded request even when Host looks local", () => {
    expect(
      validateLoopbackHeaders({
        host: "127.0.0.1:4317",
        forwarded: "for=192.0.2.4",
      }).ok,
    ).toBe(false);
    expect(
      validateLoopbackHeaders({
        host: "127.0.0.1:4317",
        "x-forwarded-for": "127.0.0.1",
      }).ok,
    ).toBe(false);
  });
  it("requires same loopback Origin for mutation requests", () => {
    expect(
      isSameLoopbackOrigin("http://127.0.0.1:4317", "127.0.0.1:4317"),
    ).toBe(true);
    expect(
      isSameLoopbackOrigin("https://127.0.0.1:4317", "127.0.0.1:4317"),
    ).toBe(false);
    expect(
      isSameLoopbackOrigin("http://127.0.0.1:9999", "127.0.0.1:4317"),
    ).toBe(false);
    expect(
      isSameLoopbackOrigin("http://127.0.0.1:4317?remote", "127.0.0.1:4317"),
    ).toBe(false);
  });
});
