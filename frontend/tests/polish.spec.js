import { test, expect } from "@playwright/test";

async function topElementId(page, selector) {
  return page.locator(selector).evaluate((el) => {
    const rect = el.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return hit ? hit.id || hit.tagName : "";
  });
}

test("F-01 chat and alerts sit above the map at 360px", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto("/app.html");
  await expect(page.locator("#open-chat")).toBeVisible({ timeout: 20000 });
  await expect(page.locator("#legend span").first()).toBeVisible();
  await page.locator("#open-chat").click();
  await expect(page.locator("#chat")).toBeVisible();
  expect(await topElementId(page, "#ask-btn")).toBe("ask-btn");
  await page.locator("#suggest .chip").first().click();
  await expect(page.locator(".msg.bot").last()).toContainText(/answer|estimate|Estimates|MOCK|Mandya|मंड्या/i, { timeout: 15000 });
  await page.keyboard.press("Tab");
  const focusInside = await page.evaluate(() => document.getElementById("chat").contains(document.activeElement));
  expect(focusInside).toBe(true);
  await page.keyboard.press("Escape");
  await expect(page.locator("#chat")).toBeHidden();

  await page.locator("#open-alerts").click();
  await expect(page.locator("#alert-dialog")).toBeVisible();
  expect(await topElementId(page, "#alert-submit")).toBe("alert-submit");
  await page.locator("#alert-submit").click();
  await expect(page.locator("#alert-result")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("#alert-dialog")).toBeHidden();
});

test("F-07 theme follows the system until the user chooses", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.addInitScript(() => localStorage.removeItem("thirstcast.theme"));
  await page.goto("/app.html");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator(".chart-wrap").first()).toBeVisible({ timeout: 20000 });
  const darkBg = await page.locator(".chart-wrap").first().evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(darkBg).not.toBe("rgb(255, 255, 255)");
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.locator("[data-theme-toggle]").click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("F-14 Leaflet is loaded from the vendored copy", async ({ page }) => {
  const urls = [];
  page.on("request", (req) => urls.push(req.url()));
  await page.goto("/app.html");
  await expect(page.locator("#district-select")).toBeVisible({ timeout: 20000 });
  expect(urls.some((url) => url.includes("/vendor/leaflet/leaflet.js"))).toBe(true);
  expect(urls.some((url) => url.includes("unpkg.com"))).toBe(false);
});

test("F-03 each suggested question returns a real template answer", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/app.html");
  await expect(page.locator("#mock-badge")).toBeVisible({ timeout: 20000 });
  await page.locator("#open-chat").click();
  const chips = page.locator("#suggest .chip");
  await expect(chips).toHaveCount(4);
  const count = await chips.count();
  for (let i = 0; i < count; i += 1) {
    const question = await chips.nth(i).innerText();
    await chips.nth(i).click();
    const bot = page.locator(".msg.bot").last();
    await expect(bot).toContainText(/Template advisory|estimate|Estimates|अनुमान/, { timeout: 15000 });
    await expect(bot).not.toContainText("MOCK answer");
    await expect(bot).not.toContainText("Connect the live API");
    const hindi = /[\u0900-\u097F]/.test(question);
    if (/Kolar|कोलार/.test(question)) await expect(bot).toContainText(hindi ? "कोलार" : "Kolar");
    if (/Mandya|मंड्या/.test(question)) await expect(bot).toContainText(hindi ? "मंड्या" : "Mandya");
  }
  await page.locator("#question").fill("What is the rainfall in Atlantis tomorrow please");
  await page.locator("#ask-btn").click();
  await expect(page.locator(".msg.bot").last()).toContainText(
    "Offline demo: try one of the suggested questions; the live agent answers anything.",
  );
});
