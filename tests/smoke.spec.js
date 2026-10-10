import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const here = path.dirname(fileURLToPath(import.meta.url));
const shots = path.resolve(here, "../../docs/screenshots");
const widths = [360, 768, 1280, 1920];

function watchConsole(page, bucket) {
  page.on("pageerror", (err) => bucket.push(`pageerror: ${err.message}`));
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    if (/Failed to load resource|net::ERR|favicon/i.test(text)) return;
    bucket.push(`console: ${text}`);
  });
}

async function noOverflow(page) {
  const extra = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(extra).toBeLessThanOrEqual(1);
}

test.beforeAll(() => {
  fs.mkdirSync(shots, { recursive: true });
});

test("landing numbers, language, and screenshots", async ({ page }) => {
  const errors = [];
  watchConsole(page, errors);
  await page.goto("/");
  await expect(page.locator("#stat-days")).toContainText("22 of 30", { timeout: 15000 });
  await expect(page.locator("#stat-mm")).toContainText("+13.3");
  await expect(page.locator("body")).toContainText("We don't claim thirstwaves caused it");
  const text = await page.locator("body").innerText();
  expect(text).not.toContain("26.9");
  expect(text).not.toContain("27/30");
  expect(text).not.toContain("27 of 30");
  expect(text).not.toContain("1.1 lakh");
  expect(text).not.toContain("world's first");
  expect(text).toContain("District-centroid estimate (~10 km grid)");
  await page.getByRole("button", { name: "हिंदी" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "hi");
  await expect(page.locator("h1")).toContainText("थर्स्टवेव");
  await page.getByRole("button", { name: "EN" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator("#stat-days")).toContainText("22 of 30");
  await expect(page.locator("#stat-mm")).toContainText("+13.3");
  for (const width of widths) {
    await page.setViewportSize({ width, height: width < 800 ? 780 : 1000 });
    await noOverflow(page);
    await page.screenshot({
      path: path.join(shots, `landing-${width}.jpg`),
      fullPage: true,
      type: "jpeg",
      quality: 62,
    });
  }
  expect(errors).toEqual([]);
});

test("dashboard districts, replay, chat, and screenshots", async ({ page }) => {
  test.setTimeout(120000);
  const errors = [];
  watchConsole(page, errors);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/app.html");
  await expect(page.locator("#mock-badge")).toBeVisible();
  await expect(page.locator("#district-select")).toBeVisible({ timeout: 20000 });
  for (const id of ["Bengaluru_Urban", "Kolar", "Mandya"]) {
    await page.locator("#district-select").selectOption(id);
    await expect(page.locator("#tab-panel")).toContainText(/ACTIVE|WATCH|NONE/);
    await page.getByRole("tab", { name: "Farmers" }).click();
    await page.getByRole("tab", { name: "Lakes & reservoirs" }).click();
    await page.getByRole("tab", { name: "Heat vs thirst" }).click();
    await expect(page.locator("#tab-panel")).toContainText("36.2");
    await page.getByRole("tab", { name: "History" }).click();
    await page.getByRole("tab", { name: "Overview" }).click();
  }
  await page.locator("#district-list button", { hasText: "Kolar" }).click();
  await expect(page.locator("#district-select")).toHaveValue("Kolar");
  await page.locator("#district-select").selectOption("Bengaluru_Urban");
  await page.getByRole("button", { name: "Replay April 2024" }).click();
  await expect(page.locator("#replay-slider")).toBeVisible();
  await expect(page.locator("#replay-banner")).toContainText(/historical/i);
  await page.locator("#replay-slider").evaluate((el) => {
    el.value = el.max;
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await expect(page.locator("#replay-summary")).toBeVisible();
  await expect(page.locator("#replay-summary")).toContainText("22 / 30");
  await page.getByRole("button", { name: "Back to live map" }).click();
  await page.locator("#open-chat").click();
  await page.locator("#question").fill("Will Mandya face a thirstwave this week?");
  await page.locator("#ask-form").getByRole("button", { name: "Ask" }).click();
  await expect(page.locator(".msg.bot").last()).toContainText(/MOCK answer|estimate|Estimates/i);
  await page.locator("#close-chat").click();
  await page.getByRole("button", { name: "हिंदी", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "hi");
  await page.getByRole("button", { name: "EN", exact: true }).click();
  for (const width of widths) {
    await page.setViewportSize({ width, height: width < 800 ? 780 : 1000 });
    await page.goto("/app.html#d=Mandya&tab=farmers");
    await expect(page.locator("#tab-panel")).toBeVisible({ timeout: 20000 });
    await noOverflow(page);
    await page.screenshot({
      path: path.join(shots, `dashboard-${width}.jpg`),
      fullPage: false,
      type: "jpeg",
      quality: 62,
    });
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/app.html#d=Bengaluru_Urban&replay=30");
  await expect(page.locator("#replay-summary")).toBeVisible({ timeout: 20000 });
  await page.screenshot({
    path: path.join(shots, "dashboard-replay-1280.jpg"),
    fullPage: false,
    type: "jpeg",
    quality: 62,
  });
  expect(errors).toEqual([]);
});

test("methods page renders the note and charts", async ({ page }) => {
  const errors = [];
  watchConsole(page, errors);
  await page.goto("/methods.html");
  await expect(page.locator("#doc h2").first()).toBeVisible({ timeout: 15000 });
  await expect(page.locator("#doc img").first()).toBeVisible();
  await expect(page.locator("#source-list a").first()).toBeVisible();
  await page.getByRole("button", { name: "हिंदी" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "hi");
  for (const width of widths) {
    await page.setViewportSize({ width, height: width < 800 ? 780 : 1000 });
    await noOverflow(page);
    await page.screenshot({
      path: path.join(shots, `methods-${width}.jpg`),
      fullPage: true,
      type: "jpeg",
      quality: 60,
    });
  }
  expect(errors).toEqual([]);
});

test("write the open graph png from the svg", async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 630 });
  await page.goto("/og.svg");
  const svg = page.locator("svg");
  await expect(svg).toBeVisible();
  await svg.screenshot({ path: path.resolve(here, "../og.png") });
});
