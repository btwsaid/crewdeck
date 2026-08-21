import { spawn } from "node:child_process";

export interface CommandResult {
  stdout: string;
}

export async function executeFixedCommand(
  executable: string,
  argument: "--json",
  options: { env?: NodeJS.ProcessEnv; timeoutMs: number; maxBytes?: number },
): Promise<CommandResult> {
  const maxBytes = options.maxBytes ?? 2 * 1024 * 1024;
  return await new Promise((resolve, reject) => {
    const child = spawn(executable, [argument], {
      env: options.env,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let discardedStderrBytes = 0;
    let settled = false;
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      if (!settled) {
        settled = true;
        reject(new Error("local command timed out"));
      }
    }, options.timeoutMs);
    const enforceLimit = (additionalBytes: number) => {
      if (
        Buffer.byteLength(stdout) + discardedStderrBytes + additionalBytes <=
        maxBytes
      )
        return true;
      settled = true;
      clearTimeout(timer);
      child.kill("SIGKILL");
      reject(new Error("local command exceeded output limit"));
      return false;
    };
    child.stdout.on("data", (chunk: Buffer) => {
      if (!settled && enforceLimit(chunk.byteLength))
        stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      if (!settled && enforceLimit(chunk.byteLength))
        discardedStderrBytes += chunk.byteLength;
    });
    child.once("error", () => {
      clearTimeout(timer);
      if (!settled) {
        settled = true;
        reject(new Error("local command could not be started"));
      }
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      if (code !== 0) reject(new Error("local command returned an error"));
      else resolve({ stdout });
    });
  });
}
