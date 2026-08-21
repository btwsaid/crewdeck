import { isAbsolute, join, resolve } from "node:path";

export interface CrewdeckConfig {
  demo: boolean;
  fmHome: string | null;
  fleetCommand: string | null;
  quotaCommand: string;
  accountsFile: string;
}

function absoluteEnvironmentPath(
  name: string,
  value: string | undefined,
): string | null {
  if (!value) return null;
  if (!isAbsolute(value)) throw new Error(`${name} must be an absolute path`);
  return resolve(value);
}

export function readConfig(
  environment: NodeJS.ProcessEnv = process.env,
): CrewdeckConfig {
  const demo = environment.CREWDECK_DEMO === "1";
  const fmHome = absoluteEnvironmentPath("FM_HOME", environment.FM_HOME);
  if (!demo && !fmHome)
    throw new Error("FM_HOME is required when CREWDECK_DEMO is not 1");
  const fleetCommand =
    absoluteEnvironmentPath(
      "CREWDECK_FLEET_COMMAND",
      environment.CREWDECK_FLEET_COMMAND,
    ) ?? (fmHome ? join(fmHome, "bin", "fm-fleet-snapshot.sh") : null);
  const quotaCommand =
    absoluteEnvironmentPath(
      "CREWDECK_QUOTA_COMMAND",
      environment.CREWDECK_QUOTA_COMMAND,
    ) ?? "quota-axi";
  const accountsFile =
    absoluteEnvironmentPath(
      "CREWDECK_ACCOUNTS_FILE",
      environment.CREWDECK_ACCOUNTS_FILE,
    ) ??
    (fmHome
      ? join(fmHome, "state", "crewdeck", "accounts.json")
      : join(process.cwd(), ".crewdeck", "demo-accounts.json"));
  return { demo, fmHome, fleetCommand, quotaCommand, accountsFile };
}
