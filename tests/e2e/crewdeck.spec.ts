import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { expect, test, type Page } from "@playwright/test";
import { createSyntheticLiveFixture } from "../integration/live-fixture";

async function isolatedPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("could not reserve a loopback test port");
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return address.port;
}

async function waitForLiveServer(url: string, child: ChildProcess) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null)
      throw new Error("synthetic live server exited before becoming ready");
    try {
      const response = await fetch(`${url}/api/health`);
      if (response.ok) return;
    } catch {
      // The isolated server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("synthetic live server did not become ready");
}

async function stopLiveServer(child: ChildProcess) {
  if (child.exitCode !== null) return;
  const exited = once(child, "exit");
  child.kill("SIGTERM");
  await Promise.race([
    exited,
    new Promise((resolve) => setTimeout(resolve, 5_000)),
  ]);
  if (child.exitCode === null) child.kill("SIGKILL");
}

async function scenario(page: Page, name: string) {
  await page.getByRole("button", { name, exact: true }).click();
  await expect(page.getByRole("button", { name, exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("CREWDECK", { exact: true })).toBeVisible();
  await page.evaluate(async () => {
    await fetch("/api/scenario", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scenario: "live" }),
    });
  });
  await page.reload();
  await expect(
    page.getByRole("button", { name: "live", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
});

test("live night watch renders quota, grouped workers, runtime/model axes, and attention order", async ({
  page,
}) => {
  await expect(page.getByRole("heading", { name: "Provisions" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Watch bill" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: /tern-hosting-move/u }),
  ).toContainText("blocked");
  const primaryRows = page
    .getByRole("region", { name: "Primary home" })
    .locator(".berth");
  await expect(primaryRows.first()).toContainText("tern-hosting-move");
  await expect(
    page.getByRole("button", { name: /harbor-read-authority/u }),
  ).toContainText("pi⌁gpt-demo-codex");
  await expect(
    page.locator("#view-deck").getByText(/Fable week/u),
  ).toBeVisible();
});

test("critical, source failure, stale recovery, and empty fleet remain explicit", async ({
  page,
}) => {
  await scenario(page, "critical");
  const critical = page.getByRole("img", {
    name: /Claude 5-hour: 11 percent remaining/u,
  });
  await expect(critical.locator(".gauge-fill")).toHaveClass(/critical/u);

  await scenario(page, "source failure");
  await expect(
    page.getByRole("status").filter({ hasText: "providers reporting" }),
  ).toBeVisible();
  await expect(
    page.getByRole("img", { name: "Codex quota unavailable" }),
  ).toBeVisible();

  await scenario(page, "stale");
  await expect(page.getByText(/fleet state has not refreshed/u)).toBeVisible();
  await expect(page.getByText("stale", { exact: true }).first()).toBeVisible();
  await scenario(page, "live");
  await expect(page.getByText(/fleet state has not refreshed/u)).toHaveCount(0);

  await scenario(page, "empty");
  await expect(page.getByText("All hands ashore")).toBeVisible();
  await expect(page.getByText(/Dispatch one from firstmate/u)).toBeVisible();
});

test("filters distinguish filtered-empty from empty fleet", async ({
  page,
}) => {
  await page.getByLabel("Project").selectOption("harbor");
  await page.getByLabel("Runtime").selectOption("opencode");
  await expect(page.getByText("Nothing matches these filters")).toBeVisible();
  await expect(page.getByText(/Clear a filter chip/u)).toBeVisible();
});

test("account add, detect, rename, and Crewdeck-only disconnect use no credential field", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop",
    "mutating account flow runs once",
  );
  await page.getByRole("tab", { name: "Accounts" }).click();
  await page.getByRole("button", { name: "+ Add account" }).click();
  const add = page.getByRole("dialog", { name: "Add account" });
  await expect(add).toContainText("claude /login");
  await expect(add).toContainText("codex login");
  await expect(add.locator('input[type="password"]')).toHaveCount(0);
  await add.getByRole("button", { name: "Detect new profiles" }).click();
  const register = page.getByRole("dialog", {
    name: "Register detected profile",
  });
  await register.getByLabel(/Alias/u).fill("harbor reserve");
  await register.getByRole("button", { name: "Register alias" }).click();
  const card = page.locator(".acct-card").filter({ hasText: "harbor reserve" });
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: "Rename alias" }).click();
  await page
    .getByRole("dialog", { name: "Rename alias" })
    .getByLabel("New alias")
    .fill("night reserve");
  await page.getByRole("button", { name: "Save alias" }).click();
  const renamed = page
    .locator(".acct-card")
    .filter({ hasText: "night reserve" });
  await renamed.getByRole("button", { name: "Disconnect" }).click();
  const disconnect = page.getByRole("dialog", {
    name: /Disconnect “night reserve”/u,
  });
  await expect(disconnect).toContainText("not touched");
  await disconnect
    .getByRole("button", { name: "Disconnect from Crewdeck" })
    .click();
  await expect(
    page.locator(".acct-card").filter({ hasText: "night reserve" }),
  ).toHaveCount(0);
});

test("account overviews label best comparable windows and refuse incomparable merges", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "scenario mutation runs once");
  await page.getByRole("tab", { name: "Accounts" }).click();
  await expect(page.getByText(/best remaining per window/u)).toBeVisible();
  await expect(page.getByText(/best 96% · night-watch/u)).toBeVisible();
  await scenario(page, "incomparable");
  await expect(
    page.getByText(/merged number would be misleading/u),
  ).toBeVisible();
  await expect(page.getByText(/best remaining per window/u)).toHaveCount(0);
});

test("keyboard tabs, berth drawer, Escape, and focus restoration work", async ({
  page,
}) => {
  const deckTab = page.getByRole("tab", { name: "Deck" });
  await deckTab.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Accounts" })).toBeFocused();
  await page.keyboard.press("Home");
  await expect(deckTab).toBeFocused();
  const berth = page.getByRole("button", { name: /tern-hosting-move/u });
  await berth.focus();
  await page.keyboard.press("Enter");
  const drawer = page.getByRole("dialog", { name: /tern-hosting-move/u });
  await expect(drawer).toBeVisible();
  await expect(drawer).toContainText("blocker");
  await page.keyboard.press("Escape");
  await expect(drawer).toHaveCount(0);
  await expect(berth).toBeFocused();
});

test("layout is responsive without accidental page overflow", async ({
  page,
}) => {
  const dimensions = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.width);
  if (page.viewportSize()!.width <= 640) {
    const columnCount = await page
      .locator(".berth")
      .first()
      .evaluate(
        (element) =>
          getComputedStyle(element).gridTemplateColumns.split(" ").length,
      );
    expect(columnCount).toBe(1);
    await expect(page.locator(".provisions")).toHaveCSS("overflow-x", "auto");
  }
});

test("reduced motion removes beacon, skeleton, and running-check animation", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "reduced-motion",
    "forced reduced-motion project only",
  );
  expect(
    await page.evaluate(
      () => matchMedia("(prefers-reduced-motion: reduce)").matches,
    ),
  ).toBe(true);
  await expect(page.locator(".feedstate .dot")).toHaveCSS(
    "animation-name",
    "none",
  );
  await expect(page.locator(".tag.run")).toHaveCSS("animation-name", "none");
  await scenario(page, "loading");
  const skeletonAnimation = await page
    .locator(".skeleton")
    .first()
    .evaluate((element) => getComputedStyle(element, "::after").animationName);
  expect(skeletonAnimation).toBe("none");
});

test("production live mode renders current Claude windows on an isolated loopback server", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "live-mode smoke runs once");
  const fixture = await createSyntheticLiveFixture();
  const port = await isolatedPort();
  const origin = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ["server.mjs"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: "production",
      NEXT_TELEMETRY_DISABLED: "1",
      CREWDECK_DEMO: "0",
      CREWDECK_HOST: "127.0.0.1",
      CREWDECK_PORT: String(port),
      FM_HOME: fixture.config.fmHome!,
      CREWDECK_FLEET_COMMAND: fixture.config.fleetCommand!,
      CREWDECK_QUOTA_COMMAND: fixture.config.quotaCommand,
      CREWDECK_ACCOUNTS_FILE: fixture.config.accountsFile,
    },
    stdio: "ignore",
  });

  try {
    await waitForLiveServer(origin, child);
    const nonLoopback: string[] = [];
    page.on("request", (request) => {
      const hostname = new URL(request.url()).hostname;
      if (hostname !== "127.0.0.1" && hostname !== "::1")
        nonLoopback.push(request.url());
    });
    await page.goto(origin);
    await expect(page.getByText("CREWDECK", { exact: true })).toBeVisible();
    await expect(page.locator(".scenario-bar")).toHaveCount(0);
    await expect(
      page.getByRole("img", {
        name: /Claude session: 71 percent remaining/u,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("img", { name: /Claude week: 64 percent remaining/u }),
    ).toBeVisible();
    await expect(
      page.getByRole("img", {
        name: /Claude Fable week: 71 percent remaining/u,
      }),
    ).toBeVisible();
    await expect(
      page.locator(".gauge-card.limiting").filter({ hasText: "Claude" }),
    ).toContainText("week");
    await expect(
      page.getByRole("img", { name: /Codex week: 61 percent remaining/u }),
    ).toBeVisible();
    await expect(
      page.locator(".gauge-card").filter({ hasText: "Claude" }).first(),
    ).not.toContainText("reset unavailable");

    const quota = await page.evaluate(async () => {
      const response = await fetch("/api/quota");
      return (await response.json()) as {
        providers: Array<{
          provider: string;
          windows: Array<{
            id: string;
            percentRemaining: number | null;
            resetsAt: number | null;
          }>;
        }>;
      };
    });
    const claude = quota.providers.find(
      (provider) => provider.provider === "claude",
    );
    expect(
      claude?.windows.map((window) => ({
        id: window.id,
        remaining: window.percentRemaining,
        hasReset: window.resetsAt !== null,
      })),
    ).toEqual([
      { id: "five_hour", remaining: 71, hasReset: true },
      { id: "seven_day", remaining: 64, hasReset: true },
      { id: "model:fable", remaining: 71, hasReset: true },
    ]);

    const fleet = await page.evaluate(async () => {
      const response = await fetch("/api/fleet");
      return (await response.json()) as {
        workers: Array<{ runtime: string }>;
      };
    });
    expect(fleet.workers.every((worker) => worker.runtime !== "claude")).toBe(
      true,
    );

    await page.getByRole("tab", { name: "Accounts" }).click();
    await page.getByRole("button", { name: "+ Add account" }).click();
    const detectionNote = page.getByRole("note");
    const detectionControl = page.getByRole("button", {
      name: "Detection unavailable",
    });
    await expect(detectionNote).toContainText(
      "no stable masked profile identifiers",
    );
    await expect(detectionNote).toContainText("Safe next action");
    await expect(detectionControl).toHaveAttribute("aria-disabled", "true");
    await expect(detectionControl).toHaveAttribute(
      "aria-describedby",
      "profile-detection-note",
    );
    await detectionControl.focus();
    await expect(detectionControl).toBeFocused();

    expect(nonLoopback).toEqual([]);
    expect(JSON.stringify(quota)).not.toMatch(
      /(?:\/home\/|\/Users\/|[A-Z]:\\)/u,
    );
    expect(JSON.stringify(quota)).not.toMatch(
      /"(?:username|email|path|token|secret|cookie|credential|cost|credits?|price|amount)"\s*:/iu,
    );
  } finally {
    await stopLiveServer(child);
  }
});

test("every request stays loopback and every browser JSON payload is clean", async ({
  page,
}) => {
  const nonLoopback: string[] = [];
  const browserErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("request", (request) => {
    const hostname = new URL(request.url()).hostname;
    if (hostname !== "127.0.0.1" && hostname !== "::1")
      nonLoopback.push(request.url());
  });
  await page.reload();
  await page.getByRole("tab", { name: "Accounts" }).click();
  await page.getByRole("tab", { name: "Deck" }).click();
  await scenario(page, "partial");
  expect(nonLoopback).toEqual([]);
  expect(browserErrors).toEqual([]);

  const payloads = await page.evaluate(
    async () =>
      await Promise.all(
        ["/api/fleet", "/api/quota", "/api/accounts"].map(
          async (url) => await (await fetch(url)).text(),
        ),
      ),
  );
  const serialized = payloads.join("\n");
  expect(serialized).not.toMatch(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/iu);
  expect(serialized).not.toMatch(/(?:\/home\/|\/Users\/|[A-Z]:\\)/u);
  expect(serialized).not.toMatch(
    /"(?:prompt|conversation|terminal|output|username|email|path|worktree|pane|session|token|secret|cookie|credential|cost|price|amount)"\s*:/iu,
  );
});
