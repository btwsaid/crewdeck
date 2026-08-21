import { expect, test, type Page } from "@playwright/test";

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
