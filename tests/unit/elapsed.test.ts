import { describe, expect, it } from "vitest";
import { elapsedTime, formatElapsed } from "@/server/elapsed";

describe("elapsed-time semantics", () => {
  it("keeps active workers running from an authoritative start", () => {
    expect(elapsedTime(1_000, null, 61_000)).toEqual({
      milliseconds: 60_000,
      running: true,
    });
  });

  it("freezes terminal workers at their end time", () => {
    expect(elapsedTime(1_000, 121_000, 999_000)).toEqual({
      milliseconds: 120_000,
      running: false,
    });
  });

  it("never reports negative or invented elapsed time", () => {
    expect(elapsedTime(10_000, 1_000)).toEqual({
      milliseconds: 0,
      running: false,
    });
    expect(elapsedTime(null, null)).toEqual({
      milliseconds: null,
      running: false,
    });
    expect(formatElapsed(null)).toBe("elapsed unavailable");
  });
});
