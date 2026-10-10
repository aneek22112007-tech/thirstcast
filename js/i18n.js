/** UI strings. Hindi in hi.json is machine-assisted and needs a fluent review. */

const store = { lang: "en", dict: {}, listeners: [] };
const KEY = "thirstcast.lang";

function lookup(dict, key) {
  let node = dict;
  for (const part of key.split(".")) {
    if (node == null || typeof node !== "object") return undefined;
    node = node[part];
  }
  return typeof node === "string" ? node : undefined;
}

export function t(key, vars) {
  let text = lookup(store.dict, key);
  if (text == null) text = key;
  if (vars) text = text.replace(/\{(\w+)\}/g, (_, name) => (vars[name] == null ? "" : String(vars[name])));
  return text;
}

export function getLang() {
  return store.lang;
}

export function onLang(fn) {
  store.listeners.push(fn);
}

function apply(root) {
  root.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  root.querySelectorAll("[data-i18n-html]").forEach((el) => {
    el.innerHTML = t(el.dataset.i18nHtml);
  });
  root.querySelectorAll("[data-i18n-aria]").forEach((el) => {
    el.setAttribute("aria-label", t(el.dataset.i18nAria));
  });
  root.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    el.setAttribute("placeholder", t(el.dataset.i18nPlaceholder));
  });
  document.documentElement.lang = store.lang === "hi" ? "hi" : "en";
  document.querySelectorAll("[data-lang-pressed]").forEach((el) => {
    el.setAttribute("aria-pressed", String(el.dataset.langPressed === store.lang));
  });
  const dark = document.documentElement.dataset.theme === "dark";
  document.querySelectorAll("[data-theme-toggle]").forEach((btn) => {
    const label = btn.querySelector("[data-theme-label]");
    if (label) label.textContent = dark ? t("nav.themeLight") : t("nav.themeDark");
    btn.setAttribute("aria-label", dark ? t("nav.themeToLight") : t("nav.themeToDark"));
  });
}

export async function initI18n(defaultPageTitleKey) {
  const fromHash = new URLSearchParams(location.hash.replace(/^#/, "")).get("lang");
  let lang = fromHash || localStorage.getItem(KEY) || document.documentElement.lang || "en";
  if (lang !== "hi" && lang !== "en") lang = "en";
  await setLang(lang, { silentHash: true });
  if (defaultPageTitleKey) document.title = t(defaultPageTitleKey);
  return lang;
}

export async function setLang(lang, opts = {}) {
  if (lang !== "hi" && lang !== "en") lang = "en";
  const res = await fetch(`i18n/${lang}.json`);
  if (!res.ok) throw new Error(`i18n ${res.status}`);
  store.dict = await res.json();
  store.lang = lang;
  try { localStorage.setItem(KEY, lang); } catch (e) { /* private mode */ }
  document.documentElement.lang = lang === "hi" ? "hi" : "en";
  apply(document);
  store.listeners.forEach((fn) => fn(lang));
  if (!opts.silentHash) {
    const params = new URLSearchParams(location.hash.replace(/^#/, ""));
    params.set("lang", lang);
    const next = `#${params.toString()}`;
    if (location.hash !== next) history.replaceState(null, "", next);
  }
}

export function bindLangToggle() {
  document.querySelectorAll("[data-set-lang]").forEach((btn) => {
    btn.addEventListener("click", () => setLang(btn.dataset.setLang));
  });
}

const THEME_KEY = "thirstcast.theme";

export function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  const theme = saved === "dark" || saved === "light" ? saved : "light";
  applyTheme(theme);
  document.querySelectorAll("[data-theme-toggle]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
      applyTheme(next);
      try { localStorage.setItem(THEME_KEY, next); } catch (e) { /* ignore */ }
    });
  });
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  document.querySelectorAll("[data-theme-toggle]").forEach((btn) => {
    const dark = theme === "dark";
    btn.setAttribute("aria-pressed", String(dark));
    const label = btn.querySelector("[data-theme-label]");
    if (label) label.textContent = dark ? t("nav.themeLight") : t("nav.themeDark");
    btn.setAttribute("aria-label", dark ? t("nav.themeToLight") : t("nav.themeToDark"));
  });
}
