import { test, expect } from "@playwright/test";

async function topElementId(page, selector) {
  return page.locator(selector).evaluate((el) => {
    const rect = el.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return hit ? hit.id || hit.tagName : "";
  });
}

test("F-11 a stale forecast shows the cached badge", async ({ page }) => {
  await page.goto("/app.html#d=Mandya&tab=overview");
  await expect(page.locator("#tab-panel")).toBeVisible({ timeout: 20000 });
  await expect(page.locator("#stale-badge")).toHaveCount(0);
  await page.route("**/mock/thirstwave_Kolar.json", async (route) => {
    const body = await (await route.fetch()).json();
    body.stale = true;
    body.note = "Cached at 2023-10-04. Not a new forecast.";
    await route.fulfill({ json: body });
  });
  await page.goto("/app.html#d=Kolar&tab=overview");
  await expect(page.locator("#stale-badge")).toHaveText("Using cached forecast", { timeout: 20000 });
  await expect(page.locator("#forecast-note")).toContainText("Cached at 2023-10-04");
});

test("F-09 Hindi names crops and lakes, and marks English sources", async ({ page }) => {
  await page.goto("/app.html#d=Mandya&tab=farmers&lang=hi");
  await expect(page.locator("#crop-select")).toContainText("धान", { timeout: 20000 });
  await expect(page.locator("#crop-select")).not.toContainText("Paddy");
  await expect(page.locator("#info-banner")).toContainText("ऐतिहासिक");
  await expect(page.locator("#info-banner")).not.toContainText("evaluated as if");
  await page.goto("/app.html#d=Bengaluru_Urban&tab=lakes&lang=hi");
  await expect(page.getByRole("heading", { name: "बेल्लंदूर झील" })).toBeVisible({ timeout: 20000 });
  await expect(page.getByText("विस्तृत विधियाँ और स्रोत अंग्रेज़ी में हैं").first()).toBeVisible();
  await expect(page.locator(".english-source").first()).toContainText("Bellandur");
  const offenders = await page.locator("#tab-panel").evaluate((root) => {
    const out = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const parent = node.parentElement;
      if (!parent || parent.closest(".english-source, [hidden]")) continue;
      const text = node.textContent.replace(/\s+/g, " ").trim();
      if (text.length <= 15) continue;
      if (/[\u0900-\u097F]/.test(text)) continue;
      out.push(text);
    }
    return out;
  });
  expect(offenders).toEqual([]);
  await page.goto("/methods.html#lang=hi");
  await expect(page.locator("#english-notice")).toContainText("अंग्रेज़ी", { timeout: 20000 });
  await expect(page.locator("#doc .english-source")).toBeVisible();
});

test("F-08 the replay summary scrolls inside the panel", async ({ page }) => {
  async function endState() {
    return page.evaluate(() => {
      const panel = document.getElementById("panel");
      const card = document.getElementById("replay-summary");
      const shell = document.getElementById("shell");
      const topbar = document.querySelector(".topbar");
      return {
        doc: document.scrollingElement.scrollTop,
        panelScroll: panel.scrollTop,
        overflow: getComputedStyle(shell).overflowY,
        expanded: panel.classList.contains("expanded"),
        cardTop: card.getBoundingClientRect().top,
        panelTop: panel.getBoundingClientRect().top,
        topbarBottom: topbar.getBoundingClientRect().bottom,
      };
    });
  }
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto("/app.html#d=Bengaluru_Urban&replay=30");
  await expect(page.locator("#replay-summary")).toBeVisible({ timeout: 20000 });
  const mobile = await endState();
  expect(mobile.doc).toBe(0);
  expect(mobile.overflow).toBe("hidden");
  expect(mobile.expanded).toBe(true);
  expect(mobile.panelScroll).toBeGreaterThan(0);
  expect(Math.abs(mobile.cardTop - mobile.panelTop)).toBeLessThan(2);
  expect(mobile.cardTop).toBeGreaterThanOrEqual(mobile.topbarBottom - 1);

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/app.html#d=Bengaluru_Urban&replay=30");
  await expect(page.locator("#replay-summary")).toBeVisible({ timeout: 20000 });
  const desktop = await endState();
  expect(desktop.doc).toBe(0);
  expect(desktop.cardTop).toBeGreaterThanOrEqual(desktop.topbarBottom - 1);
});

test("F-06 zero excess hides the tanker line", async ({ page }) => {
  const sentence = "No day in the next 7 days is above the local p90, so there is no extra demand to estimate";
  await page.goto("/app.html#d=Kolar&tab=farmers");
  await expect(page.locator("#farm-result")).toContainText(sentence, { timeout: 20000 });
  await expect(page.locator("#farm-result")).not.toContainText("10,000-litre");

  await page.route("**/mock/thirstwave_Bengaluru_Urban.json", async (route) => {
    const body = await (await route.fetch()).json();
    body.extra_litres_lakes.Bellandur.value = 0;
    await route.fulfill({ json: body });
  });
  await page.goto("/app.html#d=Bengaluru_Urban&tab=lakes");
  const bellandur = page.locator(".lake-card", { has: page.getByRole("heading", { name: "Bellandur Lake" }) });
  await expect(bellandur).toContainText(sentence, { timeout: 20000 });
  await expect(bellandur).not.toContainText("11,94,227");
  await expect(page.locator(".lake-card", { has: page.getByRole("heading", { name: "Varthur Lake" }) })).toContainText("5,88,504");
});

test("F-05 acres are validated in place and never replaced with 1", async ({ page }) => {
  await page.goto("/app.html#d=Mandya&tab=farmers");
  const input = page.locator("#acres");
  await expect(input).toBeVisible({ timeout: 20000 });
  await expect(page.locator("#farm-result")).toContainText("for 1 acres");
  await expect(page.locator("#farm-result")).toContainText("2,972");

  for (const bad of ["", "0", "-5", "100000", "abc", "1.11"]) {
    await input.fill(bad);
    await expect(page.locator("#acres-error")).toBeVisible();
    await expect(page.locator("#acres-error")).toContainText("0.1");
    await expect(page.locator("#farm-result")).toHaveClass(/is-invalid/);
    await expect(page.locator("#farm-result")).not.toContainText("2,972");
  }

  await input.fill("2,5");
  await expect(page.locator("#acres-error")).toBeHidden();
  await expect(page.locator("#farm-result")).toContainText("for 2.5 acres");
  await expect(page.locator("#farm-result")).toContainText("7,430");
  await expect(page.locator("#farm-result")).toContainText("9,083");
  await input.focus();
  await input.press("End");
  await page.keyboard.type("0");
  await expect(input).toHaveValue("2,50");
  await expect(page.locator("#farm-result")).toContainText("for 2.5 acres");

  await input.fill("10000");
  await expect(page.locator("#acres-error")).toBeHidden();
  await input.fill("0.1");
  await expect(page.locator("#acres-error")).toBeHidden();
  await expect(page.locator("#farm-result")).toContainText("for 0.1 acres");
});

test("F-04 back and forward restore district, tab, replay and chat", async ({ page }) => {
  await page.goto("/app.html");
  await expect(page.locator("#district-select")).toBeVisible({ timeout: 20000 });
  await expect(page.locator("#district-select")).toHaveValue("Mandya");
  const startLen = await page.evaluate(() => history.length);

  await page.locator("#district-list button", { hasText: "Kolar" }).click();
  await expect(page).toHaveURL(/d=Kolar/);
  expect(await page.evaluate(() => history.length)).toBe(startLen + 1);

  await page.getByRole("tab", { name: "Farmers" }).click();
  await expect(page).toHaveURL(/tab=farmers/);
  await expect(page.locator("#tab-farmers")).toHaveAttribute("aria-selected", "true");
  await page.goBack();
  await expect(page).toHaveURL(/tab=overview/);
  await expect(page.locator("#tab-overview")).toHaveAttribute("aria-selected", "true");
  await page.goBack();
  await expect(page.locator("#district-select")).toHaveValue("Mandya");
  await page.goForward();
  await expect(page.locator("#district-select")).toHaveValue("Kolar");

  await page.locator("#open-chat").click();
  await expect(page.locator("#chat")).toBeVisible();
  await expect(page).toHaveURL(/chat=1/);
  await page.goBack();
  await expect(page.locator("#chat")).toBeHidden();
  await page.goForward();
  await expect(page.locator("#chat")).toBeVisible();
  await page.locator("#close-chat").click();
  await expect(page.locator("#chat")).toBeHidden();

  const beforeReplay = await page.evaluate(() => history.length);
  await page.getByRole("button", { name: "Replay April 2024" }).click();
  await expect(page.locator("#replay-slider")).toBeVisible();
  await page.getByRole("button", { name: "Pause" }).click();
  await expect(page).toHaveURL(/replay=/);
  expect(await page.evaluate(() => history.length)).toBe(beforeReplay + 1);
  await page.locator("#replay-slider").evaluate((el) => {
    el.value = "10";
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await expect(page).toHaveURL(/replay=10/);
  expect(await page.evaluate(() => history.length)).toBe(beforeReplay + 1);
  await page.goBack();
  await expect(page.locator("#replay-panel")).toBeHidden();

  await page.goto("/app.html#d=Atlantis&tab=overview");
  await expect(page.locator("#toast")).toContainText("not in this pilot", { timeout: 20000 });
  await expect(page).not.toHaveURL(/Atlantis/);

  await page.goto("/app.html#d=Mandya&tab=nope");
  await expect(page.locator("#toast")).toContainText("not available", { timeout: 20000 });
  await expect(page).toHaveURL(/tab=overview/);
  await expect(page.locator("#tab-overview")).toHaveAttribute("aria-selected", "true");

  await page.goto("/app.html#d=Kolar&replay=99");
  await expect(page.locator("#replay-slider")).toHaveValue("30", { timeout: 20000 });
  await expect(page).toHaveURL(/replay=30/);
  await expect(page.locator("#replay-summary")).toBeVisible();

  await page.goto("/app.html#d=Kolar&replay=0");
  await expect(page.locator("#replay-slider")).toBeVisible({ timeout: 20000 });
  await expect(page).not.toHaveURL(/replay=0/);
  const day = await page.evaluate(() => Number(new URLSearchParams(location.hash.slice(1)).get("replay")));
  expect(day).toBeGreaterThanOrEqual(1);
  expect(day).toBeLessThanOrEqual(30);
});

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

test("F-19 small excesses keep two decimals", async ({ page }) => {
  await page.goto("/app.html");
  const values = await page.evaluate(async () => {
    const format = await import("/js/format.js");
    return { small: format.formatMm(0.03), large: format.formatMm(13.27), zero: format.formatMm(0) };
  });
  expect(values.small).toBe("+0.03");
  expect(values.large).toBe("+13.3");
  expect(values.zero).toBe("0.0");
});

test("F-13 day counts use plural rules", async ({ page }) => {
  await page.goto("/app.html");
  await expect(page.locator("#district-select")).toBeVisible({ timeout: 20000 });
  const words = await page.evaluate(async () => {
    const i18n = await import("/js/i18n.js");
    return { one: i18n.plural("app.day", 1), many: i18n.plural("app.day", 2) };
  });
  expect(words.one).toBe("1 day");
  expect(words.many).toBe("2 days");
  await page.getByRole("tab", { name: "Heat vs thirst" }).click();
  await expect(page.locator("#tab-panel")).not.toContainText("1 days");
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
