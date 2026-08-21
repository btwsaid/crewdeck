import { describe, expect, it } from "vitest";
import { assertCleanPayload, publicJson, safeNarrative } from "@/server/safety";

const hostileEmail = ["captain", "example.invalid"].join("@");
const hostilePath = ["", "home", "synthetic-user", "private-project"].join("/");
const hostileCredential = ["token", "synthetic-credential-material"].join("=");

describe("presentation safety boundary", () => {
  it("constructs clean allowlisted payloads", () => {
    const payload = {
      project: "harbor",
      sourceId: "claude:oauth-profile:····a4f2",
      last: { text: "local tests passed" },
    };
    expect(() => assertCleanPayload(payload)).not.toThrow();
    expect(publicJson(payload)).toContain("harbor");
  });

  it.each([
    { email: hostileEmail },
    { worktree: "synthetic" },
    { last: { text: hostilePath } },
    { last: { text: hostileCredential } },
    { terminal: "synthetic output" },
    { cost: 3 },
  ])("rejects a hostile field or value before serialization", (payload) => {
    expect(() => assertCleanPayload(payload)).toThrow(/private/u);
  });

  it("withholds an entire unsafe narrative instead of partially leaking it", () => {
    expect(safeNarrative(`update at ${hostilePath}`, "withheld")).toBe(
      "withheld",
    );
    expect(safeNarrative(hostileEmail, "withheld")).toBe("withheld");
  });
});
