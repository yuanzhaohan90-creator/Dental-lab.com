const caseFilters = document.getElementById("caseFilters");
const featuredCaseSection = document.getElementById("featuredCaseSection");
const featuredCaseList = document.getElementById("featuredCaseList");
const recentWorkList = document.getElementById("recentWorkList");
let publishedCases = [];

function escapeHtml(value) {
  const element = document.createElement("div");
  element.textContent = value || "";
  return element.innerHTML;
}

function technicalLine(item, includeCategory = false) {
  return [includeCategory ? item.category : "", item.restorationType, item.material, item.implantSystem, item.platform, item.shade]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .filter((value, index, all) => all.findIndex((other) => other.toLowerCase() === value.toLowerCase()) === index)
    .join(" · ");
}

function caseSummary(item) {
  return item.technicalSummary || item.shortNote || item.summary || "Technical restorative work reviewed for fit, material choice and production requirements.";
}

function cardMeta(item) {
  return [
    ["Material", item.material],
    ["Implant", item.implantSystem],
    ["Type", item.restorationType || item.category]
  ].filter(([, value]) => String(value || "").trim()).slice(0, 3)
    .map(([label, value]) => `<span><strong>${escapeHtml(label)}</strong>${escapeHtml(value)}</span>`).join("");
}

function renderCases(category = "") {
  const filtered = category ? publishedCases.filter((item) => item.category === category) : publishedCases;
  const featured = filtered.filter((item) => item.featured || item.contentType === "case_study");
  const recent = filtered;
  if (featuredCaseSection) featuredCaseSection.hidden = featured.length === 0;
  if (featuredCaseList) featuredCaseList.innerHTML = featured.map((item) => `<article class="featured-public-case case-portfolio-card"><a href="/cases/${encodeURIComponent(item.slug)}"><div class="case-card-media"><img src="${escapeHtml(item.coverImage.url)}" alt="${escapeHtml(item.title)}" loading="lazy"><div class="case-card-hover">${cardMeta(item)}<em>View Case</em></div></div><div><span class="case-category">Featured Case Study · ${escapeHtml(item.category)}</span><h3>${escapeHtml(item.title)}</h3><p class="case-technical-line">${escapeHtml(technicalLine(item, true))}</p><p>${escapeHtml(caseSummary(item))}</p><span class="text-link">View Case Study</span></div></a></article>`).join("");
  if (!recent.length) {
    recentWorkList.innerHTML = `<p class="case-library-state">${publishedCases.length ? "No recent work in this category yet." : "No published work yet."}</p>`;
    return;
  }
  recentWorkList.innerHTML = recent.map((item) => `<article class="public-case-card case-portfolio-card"><a href="/cases/${encodeURIComponent(item.slug)}"><div class="case-card-media"><img src="${escapeHtml(item.coverImage.url)}" alt="${escapeHtml(item.title)}" loading="lazy"><div class="case-card-hover">${cardMeta(item)}<em>View Case</em></div></div><div><span class="case-category">${escapeHtml(item.category)}</span><h3>${escapeHtml(item.title)}</h3><p class="case-technical-line">${escapeHtml(technicalLine(item))}</p><p>${escapeHtml(caseSummary(item))}</p><span class="text-link">View Case</span></div></a></article>`).join("");
}

caseFilters?.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-category]");
  if (!button) return;
  caseFilters.querySelectorAll("button").forEach((item) => item.classList.toggle("active", item === button));
  renderCases(button.dataset.category);
});

const serverCaseData = document.getElementById("publicCaseData");
if (serverCaseData) {
  try { publishedCases = JSON.parse(serverCaseData.textContent || "[]"); } catch { publishedCases = []; }
  const requestedCategory = new URLSearchParams(location.search).get("category") || "";
  const requestedButton = [...(caseFilters?.querySelectorAll("button[data-category]") || [])]
    .find((button) => button.dataset.category === requestedCategory);
  if (requestedButton) {
    caseFilters.querySelectorAll("button").forEach((button) => button.classList.toggle("active", button === requestedButton));
    renderCases(requestedCategory);
  }
} else {
  fetch("/api/cases")
    .then((response) => response.json().then((data) => ({ response, data })))
    .then(({ response, data }) => {
      if (!response.ok || !data.ok) throw new Error(data.error || "Could not load cases.");
      publishedCases = data.cases;
      renderCases();
    })
    .catch(() => { if (featuredCaseSection) featuredCaseSection.hidden = true; recentWorkList.innerHTML = '<p class="case-library-state error">The case library could not be loaded. Please try again.</p>'; });
}
