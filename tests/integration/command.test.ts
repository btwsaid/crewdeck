import { chmod, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { executeFixedCommand } from "@/server/command";

describe("fixed local command boundary", () => {
  it("executes only the fixed safe JSON argv and never --full", async () => {
    const directory = await mkdtemp(join(tmpdir(), "crewdeck-command-"));
    const executable = join(directory, "quota-fixture");
    const observed = join(directory, "argv");
    await writeFile(
      executable,
      `#!/bin/sh\nprintf '%s\\n' "$@" > "$OBSERVED_ARGV"\nprintf '{"schemaVersion":3,"providers":[]}'\nprintf 'discarded native diagnostic' >&2\n`,
      "utf8",
    );
    await chmod(executable, 0o700);
    const result = await executeFixedCommand(executable, "--json", {
      env: { ...process.env, OBSERVED_ARGV: observed },
      timeoutMs: 2_000,
    });
    expect(await readFile(observed, "utf8")).toBe("--json\n");
    expect(result).toEqual({ stdout: '{"schemaVersion":3,"providers":[]}' });
    expect(JSON.stringify(result)).not.toContain("diagnostic");
  });

  it("bounds output and runtime", async () => {
    const directory = await mkdtemp(join(tmpdir(), "crewdeck-command-"));
    const huge = join(directory, "huge");
    await writeFile(huge, "#!/bin/sh\nyes x | head -1000\n", "utf8");
    await chmod(huge, 0o700);
    await expect(
      executeFixedCommand(huge, "--json", { timeoutMs: 2_000, maxBytes: 64 }),
    ).rejects.toThrow(/output limit/u);
    const slow = join(directory, "slow");
    await writeFile(slow, "#!/bin/sh\nsleep 2\n", "utf8");
    await chmod(slow, 0o700);
    await expect(
      executeFixedCommand(slow, "--json", { timeoutMs: 20 }),
    ).rejects.toThrow(/timed out/u);
  });
});
