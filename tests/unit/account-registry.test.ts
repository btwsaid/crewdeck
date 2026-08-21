import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  AccountRegistry,
  validateRegistration,
} from "@/server/account-registry";

describe("non-secret account registry", () => {
  it("accepts only alias plus masked source identifier", () => {
    expect(
      validateRegistration({
        alias: "night watch",
        sourceId: "claude:oauth-profile:····a4f2",
      }),
    ).toEqual({
      alias: "night watch",
      sourceId: "claude:oauth-profile:····a4f2",
    });
    expect(() =>
      validateRegistration({
        alias: "bad",
        sourceId: "claude:oauth-profile:····a4f2",
        password: "never",
      }),
    ).toThrow(/only alias and sourceId/u);
    expect(() =>
      validateRegistration({ alias: "bad", sourceId: "raw-native-profile" }),
    ).toThrow(/masked/u);
  });

  it("registers, renames, and disconnects without native credential operations", async () => {
    const directory = await mkdtemp(join(tmpdir(), "crewdeck-registry-"));
    const file = join(directory, "state", "accounts.json");
    const registry = new AccountRegistry(file);
    await registry.register({
      alias: "reserve",
      sourceId: "codex:oauth-profile:····9b30",
    });
    await registry.renameAlias("codex:oauth-profile:····9b30", "night reserve");
    expect(await registry.list()).toEqual([
      { alias: "night reserve", sourceId: "codex:oauth-profile:····9b30" },
    ]);
    const persisted = await readFile(file, "utf8");
    expect(Object.keys(JSON.parse(persisted)[0])).toEqual([
      "alias",
      "sourceId",
    ]);
    expect((await stat(file)).mode & 0o777).toBe(0o600);
    await registry.disconnect("codex:oauth-profile:····9b30");
    expect(await registry.list()).toEqual([]);
  });

  it("refuses duplicate aliases and source identifiers", async () => {
    const directory = await mkdtemp(join(tmpdir(), "crewdeck-registry-"));
    const registry = new AccountRegistry(join(directory, "accounts.json"));
    await registry.register({
      alias: "reserve",
      sourceId: "codex:oauth-profile:····9b30",
    });
    await expect(
      registry.register({
        alias: "Reserve",
        sourceId: "codex:oauth-profile:····e77c",
      }),
    ).rejects.toThrow(/alias/u);
    await expect(
      registry.register({
        alias: "other",
        sourceId: "codex:oauth-profile:····9b30",
      }),
    ).rejects.toThrow(/profile/u);
  });
});
