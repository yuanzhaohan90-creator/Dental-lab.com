const caseFilters = document.getElementById("caseFilters");
const featuredCaseSection = document.getElementById("featuredCaseSection");
const featuredCaseList = document.getElementById("featuredCaseList");
const recentWorkSection = document.getElementById("recentWorkSection");
const recentWorkList = document.getElementById("recentWorkList");
if (![caseFilters, featuredCaseSection, featuredCaseList, recentWorkSection, recentWorkList].every(Boolean)) {
  throw new Error("Cases template is missing a required portfolio container.");
}
let publishedCases = [];

function escapeHtml(value) {
  const element = document.createElement("div");
  element.textContent = value || "";
  return element.innerHTML;
}
function technicalLine(item) {
  return [item.restorationType, item.material, item.implantSystem, item.platform, item.shade]
    .map((value) => String(value || "").trim()).filter(Boolean)
    .filter((value, index, all) => all.findIndex((other) => other.toLowerCase() === value.toLowerCase()) === index)
    .filter((value) => value.toLowerCase() !== String(item.category || "").toLowerCase()).join(" · ");
}
function cardMarkup(item, featured) {
  const meta = [["Material", item.material], ["Implant", item.implantSystem], ["Type", item.restorationType || item.category]]
    .filter(([, value]) => String(value || "").trim()).slice(0, 3)
    .map(([label, value]) => `<span><strong>${escapeHtml(label)}</strong>${escapeHtml(value)}</span>`).join("");
  const line = technicalLine(item);
  const summary = item.technicalSummary || item.shortNote || item.summary || "Technical restorative work reviewed for fit, material choice and production requirements.";
  return `<article class="${featured ? "featured-public-case" : "public-case-card"} case-portfolio-card"><a href="/cases/${encodeURIComponent(item.slug)}"><div class="case-card-media"><img src="${escapeHtml(item.coverImage?.url || "/assets/real/anterior-crown-model-12.jpg")}" alt="${escapeHtml(item.title)}" width="1200" height="900" loading="lazy" decoding="async"><div class="case-card-hover">${meta}<em>View Case</em></div></div><div><span class="case-category">${escapeHtml(featured ? "Featured Case Study · " + item.category : item.category)}</span><h3>${escapeHtml(item.title)}</h3>${line ? `<p class="case-technical-line">${escapeHtml(line)}</p>` : ""}<p>${escapeHtml(summary)}</p><span class="text-link">${featured ? "View Case Study" : "View Case"}</span></div></a></article>`;
}
function renderCases(category = "") {
  const { filtered, featured, recent } = CasePortfolio.select(publishedCases, category);
  featuredCaseSection.hidden = !featured.length;
  recentWorkSection.hidden = !recent.length && featured.length > 0;
  featuredCaseList.innerHTML = featured.map((item) => cardMarkup(item, true)).join("");
  recentWorkList.innerHTML = recent.length
    ? recent.map((item) => cardMarkup(item, false)).join("")
    : `<p class="case-library-state">${category ? "No published work in this category yet." : "No published work yet."}</p>`;
  recentWorkList.classList.toggle("single-case-grid", recent.length === 1);
  featuredCaseList.classList.toggle("single-case-grid", featured.length === 1);
  caseFilters.querySelectorAll("button[data-category]").forEach((button) => {
    const active = button.dataset.category === category;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  caseFilters.dataset.resultCount = String(filtered.length);
}
function renderLocation() {
  renderCases(new URLSearchParams(location.search).get("category") || "");
}
caseFilters.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-category]");
  if (!button || !caseFilters.contains(button)) return;
  const url = new URL(location.href);
  if (button.dataset.category) url.searchParams.set("category", button.dataset.category);
  else url.searchParams.delete("category");
  if (url.href !== location.href) history.pushState({}, "", url);
  renderLocation();
});
window.addEventListener("popstate", renderLocation);
const serverCaseData = document.getElementById("publicCaseData");
if (serverCaseData) {
  publishedCases = JSON.parse(serverCaseData.textContent || "[]");
  renderLocation();
} else {
  fetch("/api/cases").then(async (response) => {
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error("Could not load cases.");
    publishedCases = data.cases;
    renderLocation();
  }).catch(() => {
    featuredCaseSection.hidden = true;
    recentWorkSection.hidden = false;
    recentWorkList.innerHTML = '<p class="case-library-state error">The case library could not be loaded. Please try again.</p>';
  });
}
