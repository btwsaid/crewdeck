import { describe, expect, it } from "vitest";
import { parseMetaAllowlist, runtimeFamily } from "@/server/meta-parser";

describe("Firstmate meta allowlist", () => {
  it("keeps runtime and model as separate axes and drops every other key", () => {
    const raw = [
      "project=harbor",
      "kind=ship",
      "harness=pi",
      "model=openai/gpt-demo-codex",
      "effort=xhigh",
      `worktree=${["", "home", "synthetic", "tree"].join("/")}`,
      "terminal=private fixture text",
      "cost=900",
      "future_upstream_field=excluded",
    ].join("\n");
    const result = parseMetaAllowlist(raw, { startedAt: 10, updatedAt: 20 });
    expect(result).toEqual({
      project: "harbor",
      kind: "crewmate",
      runtime: "pi",
      model: "openai/gpt-demo-codex",
      effort: "xhigh",
      startedAt: 10,
      updatedAt: 20,
    });
    expect(JSON.stringify(result)).not.toContain("worktree");
  });

  it("normalizes only known runtime families", () => {
    expect(runtimeFamily("pi-signed-preview")).toBe("pi-signed");
    expect(runtimeFamily("codex-nightly")).toBe("codex");
    expect(runtimeFamily("not-a-runtime")).toBe("unknown");
  });
});
