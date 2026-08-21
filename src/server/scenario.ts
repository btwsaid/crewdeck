export type DemoScenario =
  | "live"
  | "loading"
  | "empty"
  | "stale"
  | "partial"
  | "critical"
  | "source-failure"
  | "incomparable";

const values = new Set<DemoScenario>([
  "live",
  "loading",
  "empty",
  "stale",
  "partial",
  "critical",
  "source-failure",
  "incomparable",
]);

let scenario: DemoScenario = "live";

export function getDemoScenario(): DemoScenario {
  return scenario;
}

export function setDemoScenario(value: unknown): DemoScenario {
  if (typeof value !== "string" || !values.has(value as DemoScenario))
    throw new Error("unknown demo scenario");
  scenario = value as DemoScenario;
  return scenario;
}
