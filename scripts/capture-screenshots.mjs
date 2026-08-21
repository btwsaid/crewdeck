import { mkdir } from "node:fs/promises";
import { chromium } from "@playwright/test";

const target = new URL(
  process.env.CREWDECK_SCREENSHOT_URL ?? "http://127.0.0.1:4317",
);
if (
  target.protocol !== "http:" ||
  (target.hostname !== "127.0.0.1" && target.hostname !== "::1")
) {
  throw new Error("Screenshot target must be an explicit loopback HTTP URL");
}
await mkdir("public/screenshots", { recursive: true });
const browser = await chromium.launch();
try {
  for (const capture of [
    {
      name: "crewdeck-desktop.png",
      viewport: { width: 1440, height: 1000 },
      fullPage: true,
    },
    {
      name: "crewdeck-mobile.png",
      viewport: { width: 390, height: 844 },
      fullPage: true,
    },
  ]) {
    const page = await browser.newPage({
      viewport: capture.viewport,
      reducedMotion: "reduce",
    });
    const remote = [];
    page.on("request", (request) => {
      const hostname = new URL(request.url()).hostname;
      if (hostname !== "127.0.0.1" && hostname !== "::1")
        remote.push(request.url());
    });
    await page.goto(target.href, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: /tern-hosting-move/u }).waitFor();
    if (remote.length > 0)
      throw new Error("Non-loopback screenshot request refused");
    await page.screenshot({
      path: `public/screenshots/${capture.name}`,
      fullPage: capture.fullPage,
    });
    await page.close();
  }
} finally {
  await browser.close();
}
