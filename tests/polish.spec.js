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

test("F-15 the map keeps its height and automated runs do not request tiles", async ({ page }) => {
  const tiles = [];
  page.on("request", (req) => {
    if (req.url().includes("tile.openstreetmap.org")) tiles.push(req.url());
  });
  await page.goto("/app.html");
  await expect(page.locator("#map")).toBeVisible({ timeout: 20000 });
  const box = await page.locator("#map").boundingBox();
  expect(box.height).toBeGreaterThan(200);
  await page.waitForTimeout(800);
  expect(tiles).toEqual([]);
  const source = await (await page.request.get("/js/dashboard.js")).text();
  expect(source).toContain("navigator.webdriver");
  expect(source).toContain("tile.openstreetmap.org");
});

test("U-11 arrow keys cycle districts while the map is focused", async ({ page }) => {
  await page.goto("/app.html");
  await expect(page.locator("#district-select")).toHaveValue("Mandya", { timeout: 20000 });
  await page.locator("#map").focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("#district-select")).toHaveValue("Bengaluru_Urban");
  await expect(page.locator("#map-live")).toContainText("Bengaluru Urban");
  await page.keyboard.press("ArrowLeft");
  await expect(page.locator("#district-select")).toHaveValue("Mandya");
  await expect(page.locator("#map-live")).toContainText("Mandya");
});

test("U-10 the bulletin is a single A4 page of the district on screen", async ({ page }) => {
  await page.goto("/app.html#d=Mandya&tab=overview");
  await expect(page.locator("#print-bulletin")).toBeVisible({ timeout: 20000 });
  await page.evaluate(() => { window.print = () => { window.__printed = true; }; });
  await page.locator("#print-bulletin").click();
  await expect(page.locator("#bulletin")).toContainText("Mandya");
  await expect(page.locator("#bulletin")).toContainText("ACTIVE");
  await expect(page.locator("#bulletin")).toContainText("District-centroid estimate (~10 km grid)");
  await expect(page.locator("#bulletin")).toContainText("2023-10-05");
  await expect(page.locator("#bulletin")).toContainText("2,972–3,633");
  await expect(page.locator("#bulletin svg")).toHaveCount(1);
  expect(await page.evaluate(() => window.__printed)).toBe(true);
  const css = await (await page.request.get("/styles/app.css")).text();
  expect(css).toContain("size: A4");
  await page.emulateMedia({ media: "print" });
  const height = await page.locator("#bulletin").evaluate((el) => el.scrollHeight);
  expect(height).toBeLessThan(1000);
});

test("U-9 the crop stage defaults to mid-season and can switch", async ({ page }) => {
  await page.goto("/app.html#d=Mandya&tab=farmers");
  await expect(page.locator("#farm-result")).toContainText("2,972–3,633", { timeout: 20000 });
  await expect(page.locator("#stage-select")).toHaveValue("mid");
  await page.locator("#stage-select").selectOption("end");
  await expect(page.locator("#farm-result")).toContainText("1,651–2,477");
  await expect(page.locator("#farm-result")).toContainText("0.6–0.9");
  const catalog = await (await page.request.get("/data/catalog.json")).json();
  const paddy = catalog.crops.find((crop) => crop.id === "paddy");
  expect(paddy.kc).toBe(1.2);
  expect(paddy.stages.mid.kc).toBe(1.2);
  expect(paddy.stages.end.kc).toEqual([0.6, 0.9]);
});

test("U-8 the app works from the saved copy when the network is down", async ({ page }) => {
  const manifest = await (await page.request.get("/manifest.webmanifest")).json();
  expect(manifest.icons[0].src).toBe("favicon.svg");
  const worker = await (await page.request.get("/sw.js")).text();
  expect(worker).toContain("tile.openstreetmap.org");
  expect(worker).toContain("86400000");
  expect(worker).not.toContain("prefetch");
  const methods = await (await page.request.get("/methods.html")).text();
  expect(methods).toContain("vendor/marked/marked.min.js");
  expect(methods).not.toContain("cdn.jsdelivr.net");
  await page.goto("/app.html");
  await expect(page.locator("#district-select")).toBeVisible({ timeout: 20000 });
  await page.waitForFunction(() => window.__thirstWarm === "done", null, { timeout: 20000 });
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller && window.__thirstWarm === "done", null, { timeout: 20000 });
  await page.context().setOffline(true);
  await page.reload();
  await expect(page.locator("#offline-banner")).toContainText(/Offline: showing saved data from/, { timeout: 20000 });
  await expect(page.locator("#tab-panel")).toContainText(/ACTIVE|WATCH|NONE/);
  await page.context().setOffline(false);
});

test("U-6 a share card is a 1200 by 630 canvas with the caveat", async ({ page }) => {
  await page.goto("/app.html#d=Mandya&tab=overview");
  await expect(page.locator("#save-card")).toBeVisible({ timeout: 20000 });
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.locator("#save-card").click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/thirstcast-Mandya\.png$/);
  const meta = await page.locator("#share-canvas").evaluate((canvas) => ({
    w: canvas.width,
    h: canvas.height,
    lines: canvas.dataset.lines,
    px: Array.from(canvas.getContext("2d").getImageData(10, 10, 1, 1).data).slice(0, 3),
  }));
  expect(meta).toMatchObject({ w: 1200, h: 630, px: [12, 35, 64] });
  expect(meta.lines).toContain("District-centroid estimate (~10 km grid)");
  expect(meta.lines).toContain("2023-10-05");
  expect(meta.lines.toLowerCase()).toContain("mock");
  expect(meta.lines).toContain("app.html");
  await page.goto("/app.html#d=Bengaluru_Urban&replay=30");
  await expect(page.locator("#replay-card")).toBeVisible({ timeout: 20000 });
  await page.locator("#replay-card").click();
  await expect(page.locator("#share-canvas")).toHaveAttribute("data-lines", /historical/);
  const replayLines = await page.locator("#share-canvas").getAttribute("data-lines");
  expect(replayLines).toContain("22 / 30");
  expect(replayLines).toContain("District-centroid estimate (~10 km grid)");
});

test("U-5 compare shows the three districts from loaded data", async ({ page }) => {
  await page.goto("/app.html#view=compare");
  await expect(page.locator("#compare-grid [data-compare-col]")).toHaveCount(3, { timeout: 20000 });
  await expect(page.locator("[data-compare-col='Mandya']")).toContainText("+0.68");
  await expect(page.locator("[data-compare-col='Kolar']")).toContainText("0.0");
  await expect(page.locator("[data-compare-col='Bengaluru_Urban']")).toContainText("Bengaluru Urban");
  await expect(page.locator("#compare")).toContainText("District-centroid estimate");
  await page.locator("[data-compare-col='Bengaluru_Urban']").focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("[data-compare-col='Kolar']")).toBeFocused();
  await expect(page.locator("#compare-live")).toContainText("Kolar");
  await page.locator("#close-compare").click();
  await expect(page.locator("#compare")).toBeHidden();
  await expect(page.locator("#map")).toBeVisible();
  expect(page.url()).not.toContain("view=compare");
});

test("U-4 an answer is a text advisory preview with copy and share", async ({ page }) => {
  await page.goto("/app.html");
  await expect(page.locator("#open-chat")).toBeVisible({ timeout: 20000 });
  await page.locator("#open-chat").click();
  await page.locator("#suggest .chip").first().click();
  await expect(page.locator(".advisory-note").last()).toHaveText(
    "Preview of a text advisory; ThirstCast does not send WhatsApp messages.",
    { timeout: 15000 },
  );
  await expect(page.locator(".advisory").last()).toContainText(/Mandya|मंड्या/);
  await expect(page.locator("[data-share]").last()).toBeVisible();
  const canShare = await page.evaluate(() => typeof navigator.share === "function");
  if (!canShare) {
    await page.locator("[data-share]").last().click();
    await expect(page.locator("#toast")).toContainText("Copied");
  }
});

test("U-3 the landing timeline reads the hero event from the file", async ({ page }) => {
  await page.route("**/data/blindspot_timeline.json", async (route) => {
    const body = await (await route.fetch()).json();
    const hero = body.events.find((event) => event.district === body.hero.district && event.start === body.hero.start);
    hero.excess_mm = 9.99;
    await route.fulfill({ json: body });
  });
  await page.goto("/index.html");
  const order = await page.locator("main section").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("aria-labelledby") || node.className));
  expect(order.slice(0, 5)).toEqual(["hero", "evidence-title", "blind-title", "pilots-title", "try-title"]);
  await expect(page.locator("#story-blind")).toContainText("ET0 above its p90 while Tmax stayed below its own p90");
  await expect(page.locator("#timeline-hero")).toContainText("9.99", { timeout: 20000 });
  await expect(page.locator("#timeline-hero")).toContainText("36.2");
  await expect(page.locator("#timeline-hero")).toContainText("7 days");
  await page.locator("#timeline-filters").getByRole("button", { name: "Mandya", exact: true }).click();
  await page.locator("#timeline-filters").getByRole("button", { name: "Pre-monsoon" }).click();
  await expect(page.locator("#timeline-count")).not.toContainText("129 of 129");
  await page.locator("#timeline-list button").first().click();
  await expect(page.locator("#timeline-detail .chart-wrap")).toHaveCount(2);
});

test("U-2 thirty Aprils highlight 2024 on the map and the landing page", async ({ page }) => {
  await page.goto("/app.html#d=Bengaluru_Urban&tab=history");
  const bar = page.locator("#april-chart [data-year='2024']");
  await expect(bar).toBeVisible({ timeout: 20000 });
  await expect(bar).toHaveAttribute("aria-label", /rank 1 of 31/);
  await expect(bar).toHaveAttribute("aria-label", /22 days above p90/);
  await expect(bar).toHaveAttribute("aria-label", /13.27 mm/);
  await bar.focus();
  await expect(bar).toBeFocused();
  await expect(page.locator("#tab-panel")).toContainText("April only");
  await page.goto("/index.html");
  const landing = page.locator("#april-chart [data-year='2024']");
  await expect(landing).toBeVisible({ timeout: 20000 });
  await expect(landing).toHaveAttribute("aria-label", /rank 1 of 31/);
  await page.locator("#april-switch").getByRole("button", { name: "Kolar", exact: true }).click();
  await expect(page.locator("#april-chart [data-year='2024']")).toHaveAttribute("aria-label", /12.25 mm/);
});

test("U-1 why today compares ET0, Tmax, bias and the thirst percentile", async ({ page }) => {
  await page.goto("/app.html#d=Mandya&tab=overview");
  const box = page.locator("#why-today");
  await expect(box).toBeVisible({ timeout: 20000 });
  await expect(box).toContainText("5.46 vs 4.78 (+14%)");
  await expect(box).toContainText("31.1 vs 29.6 (+5%)");
  await expect(box).toContainText("1 day");
  await expect(box).toContainText("0.00");
  await expect(box).toContainText("+0.68");
  await expect(page.locator("#thirst-percentile")).toHaveText("99");
  await expect(box).not.toContainText(/\b(wind|humidity|shortwave|radiation)\b/i);
  await expect(box.locator("a")).toHaveAttribute("href", /thirst-percentile/);
});

test("F-20 mock alerts show a sample and collect no address", async ({ page }) => {
  await page.goto("/app.html");
  await expect(page.locator("#open-alerts")).toBeVisible({ timeout: 20000 });
  await page.locator("#open-alerts").click();
  await expect(page.locator("#alert-dialog")).toBeVisible();
  await expect(page.locator("#alert-email")).toBeHidden();
  await expect(page.locator("#alert-dialog")).not.toContainText("Coming soon");
  await expect(page.locator("#alert-dialog")).toContainText("06:00 IST");
  await expect(page.locator("#alert-dialog")).toContainText("SNS");
  await expect(page.locator("#alert-dialog")).toContainText("ACTIVE");
  await expect(page.locator("#alert-sample")).toContainText("ThirstCast alert: thirstwave in Mandya");
  await expect(page.locator("#alert-sample")).toContainText("status ACTIVE, day 4");
  await expect(page.locator("#alert-sample")).toContainText("2,972-3,633");
  await page.locator("#alert-submit").click();
  await expect(page.locator("#alert-email")).toHaveValue("");
  const stored = await page.evaluate(() => JSON.stringify(localStorage));
  expect(stored).not.toContain("@");
});

test("F-17 the landing quotes the thirstwave abstract", async ({ page }) => {
  const sentence = "Statistically significant trends appear across 17%, 7%, and 23% of cropland area for intensity, frequency, and duration.";
  await page.goto("/index.html");
  const paper = page.locator("blockquote[data-i18n='why.paper']");
  await expect(paper).toContainText(sentence, { timeout: 15000 });
  await expect(paper).toContainText("0.06 mm");
  await expect(page.locator("body")).not.toContainText("23% frequency");
  await expect(page.locator("body")).not.toContainText("7% for frequency");
  await page.getByRole("button", { name: "हिंदी", exact: true }).click();
  await expect(paper).toContainText(sentence);
  await expect(page.locator("body")).not.toContainText("23% frequency");
});

test("F-16 litre units are not called tankers", async ({ page }) => {
  await page.goto("/app.html#d=Mandya&tab=farmers");
  await expect(page.locator("#farm-result")).toContainText("10,000-litre units", { timeout: 20000 });
  await expect(page.locator("#tab-panel")).not.toContainText(/tanker/i);
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

test("U-7 Kannada uses the same keys and district names", async ({ page }) => {
  const en = await (await page.request.get("/i18n/en.json")).json();
  const kn = await (await page.request.get("/i18n/kn.json")).json();
  function leaves(obj, path = "") {
    const out = [];
    if (obj && typeof obj === "object" && !Array.isArray(obj)) {
      for (const [key, value] of Object.entries(obj)) {
        out.push(...leaves(value, path ? `${path}.${key}` : key));
      }
    } else if (typeof obj === "string") out.push(path);
    return out;
  }
  function get(obj, path) {
    return path.split(".").reduce((current, key) => (current == null ? undefined : current[key]), obj);
  }
  for (const path of leaves(en)) {
    if (path === "_comment") continue;
    expect(typeof get(kn, path), path).toBe("string");
  }
  expect(kn._comment).toMatch(/needs a native review/);
  expect(kn._comment).toMatch(/ಸ್ಥಳೀಯ ಪರಿಶೀಲನೆ/);
  expect(kn.districts).toEqual({
    Bengaluru_Urban: "ಬೆಂಗಳೂರು",
    Kolar: "ಕೋಲಾರ",
    Mandya: "ಮಂಡ್ಯ",
  });
  expect(kn.why.quote).toBe(en.why.quote);
  expect(kn.why.paper).toBe(en.why.paper);

  await page.goto("/app.html");
  await expect(page.locator("#district-list")).toContainText("Mandya", { timeout: 20000 });
  await page.getByRole("button", { name: "ಕನ್ನಡ", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "kn");
  await expect(page.locator("#district-list")).toContainText("ಮಂಡ್ಯ");
  await expect(page.locator("#district-list")).toContainText("ಬೆಂಗಳೂರು");
  await expect(page.locator("#district-select")).toContainText("ಮಂಡ್ಯ");
  await page.locator("#open-chat").click();
  const note = page.locator("#chat-lang-note");
  await expect(note).toBeVisible();
  await expect(note).toContainText("ಇಂಗ್ಲಿಷ್");
  await expect(note).toContainText("ಹಿಂದಿ");
  await expect(page.locator("#question")).toHaveAttribute("placeholder", /ಇಂಗ್ಲಿಷ್/);
  const font = await page.request.get("/vendor/fonts/NotoSansKannada.woff2");
  expect(font.ok()).toBeTruthy();
  const css = await (await page.request.get("/styles/tokens.css")).text();
  expect(css).toContain("Noto Sans Kannada");
  expect(css).not.toContain("fonts.gstatic.com");
});
