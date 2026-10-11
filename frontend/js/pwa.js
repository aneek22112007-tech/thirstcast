import { onLang, t } from "./i18n.js";

let savedAt = null;

function paint() {
  const banner = document.getElementById("offline-banner");
  if (!banner || savedAt == null) return;
  banner.hidden = false;
  banner.textContent = t("app.offline", { time: savedAt });
}

function remember(at) {
  savedAt = at || "";
  paint();
}

/** Register the service worker and show the offline banner when a saved response is used. */
export function initPwa() {
  if (!("serviceWorker" in navigator)) {
    window.__thirstWarm = "skipped";
    return;
  }
  navigator.serviceWorker.addEventListener("message", (event) => {
    if (event.data && event.data.type === "offline") remember(event.data.at);
  });
  const ask = (worker) => {
    if (!worker || navigator.onLine) return;
    const channel = new MessageChannel();
    channel.port1.onmessage = (event) => {
      const at = event.data && (event.data.offline || event.data.savedAt);
      if (at) remember(at);
    };
    worker.postMessage({ type: "status" }, [channel.port2]);
  };
  window.addEventListener("offline", () => ask(navigator.serviceWorker.controller));
  navigator.serviceWorker.register("sw.js").then((reg) => {
    ask(navigator.serviceWorker.controller || reg.active);
  }).catch(() => {
    window.__thirstWarm = "failed";
  });
  onLang(paint);
}

/** Ask the worker to store the files this page already loaded, so the next offline open can use them. */
export async function warmPwa() {
  if (!("serviceWorker" in navigator)) return;
  try {
    const ready = await navigator.serviceWorker.ready;
    const worker = navigator.serviceWorker.controller || ready.active;
    if (!worker) {
      window.__thirstWarm = "failed";
      return;
    }
    const urls = performance.getEntriesByType("resource").map((entry) => entry.name);
    urls.push(location.href.split("#")[0]);
    await new Promise((resolve) => {
      const channel = new MessageChannel();
      const timer = setTimeout(resolve, 8000);
      channel.port1.onmessage = () => {
        clearTimeout(timer);
        resolve();
      };
      worker.postMessage({ type: "warm", urls }, [channel.port2]);
    });
    window.__thirstWarm = "done";
  } catch (e) {
    window.__thirstWarm = "failed";
  }
}
