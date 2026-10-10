import { bindLangToggle, initI18n, initTheme, onLang, t } from "./i18n.js";

const SOURCES = [
  ["Kukal & Hobbins 2025, Earth's Future", "https://doi.org/10.1029/2024EF004870"],
  ["The Hindu, 24 June 2025", "https://www.thehindu.com/sci-tech/energy-and-environment/rising-evaporative-demand-spotlights-indias-data-and-research-gap/article69728191.ece"],
  ["FAO-56, Allen et al. 1998", "https://www.fao.org/4/x0490e/x0490e0b.htm"],
  ["IISc ETR-116, Bellandur and Varthur", "https://wgbis.ces.iisc.ac.in/energy/water/paper/ETR116/sec2.html"],
  ["IRJET 6(9) 2019, KRS", "https://irjet.net/archives/V6/i9/IRJET-V6I9196.pdf"],
  ["Open-Meteo", "https://doi.org/10.5281/ZENODO.7970649"],
  ["DataMeet district boundaries", "https://github.com/datameet/maps"],
  ["Project sources note", "https://github.com/aneek22112007-tech/thirstcast/blob/main/docs/sources.md"],
];

function slug(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

async function render() {
  const doc = document.getElementById("doc");
  const nav = document.getElementById("method-nav");
  try {
    const res = await fetch("content/methods.md");
    if (!res.ok) throw new Error(String(res.status));
    const markdown = await res.text();
    if (!window.marked) throw new Error("marked");
    doc.innerHTML = window.marked.parse(markdown);
    doc.querySelectorAll("img").forEach((img) => {
      if (!img.getAttribute("alt")) img.alt = "Chart from the methods note";
    });
    doc.querySelectorAll("table").forEach((table) => {
      const wrap = document.createElement("div");
      wrap.className = "table-scroll";
      table.parentNode.insertBefore(wrap, table);
      wrap.appendChild(table);
    });
    const links = [];
    doc.querySelectorAll("h2").forEach((heading) => {
      const id = slug(heading.textContent);
      heading.id = id;
      links.push(`<a href="#${id}">${heading.textContent}</a>`);
    });
    nav.innerHTML = `<strong>${t("methods.onThisPage")}</strong>${links.join("")}`;
  } catch (err) {
    doc.textContent = t("methods.fail", { message: err.message });
  }
}

async function boot() {
  bindLangToggle();
  await initI18n("meta.methodsTitle");
  initTheme();
  const desc = document.querySelector('meta[name="description"]');
  if (desc) desc.content = t("meta.methodsDescription");
  const list = document.getElementById("source-list");
  list.innerHTML = SOURCES.map(([label, href]) => `<a href="${href}">${label}</a>`).join("");
  onLang(() => {
    document.title = t("meta.methodsTitle");
    render();
  });
  await render();
}

boot();
