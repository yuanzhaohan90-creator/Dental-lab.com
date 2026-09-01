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

function renderCases(category = "") {
  const filtered = category ? publishedCases.filter((item) => item.category === category) : publishedCases;
  const featured = filtered.filter((item) => item.contentType === "case_study");
  const recent = filtered.filter((item) => item.contentType !== "case_study");
  if (featuredCaseSection) featuredCaseSection.hidden = featured.length === 0;
  if (featuredCaseList) featuredCaseList.innerHTML = featured.map((item) => `<article class="featured-public-case"><a href="/cases/${encodeURIComponent(item.slug)}"><img src="${escapeHtml(item.coverImage.url)}" alt="${escapeHtml(item.title)}" loading="lazy"><div><span class="case-category">Featured Case Study</span><h3>${escapeHtml(item.title)}</h3><p class="case-technical-line">${escapeHtml(technicalLine(item, true))}</p>${item.summary ? `<p>${escapeHtml(item.summary)}</p>` : ""}<span class="text-link">View Case Study</span></div></a></article>`).join("");
  if (!recent.length) {
    recentWorkList.innerHTML = `<p class="case-library-state">${publishedCases.length ? "No recent work in this category yet." : "No published work yet."}</p>`;
    return;
  }
  recentWorkList.innerHTML = recent.map((item) => `<article class="public-case-card"><a href="/cases/${encodeURIComponent(item.slug)}"><img src="${escapeHtml(item.coverImage.url)}" alt="${escapeHtml(item.title)}" loading="lazy"><div><span class="case-category">${escapeHtml(item.category)}</span><h3>${escapeHtml(item.title)}</h3><p class="case-technical-line">${escapeHtml(technicalLine(item))}</p>${item.shortNote ? `<p>${escapeHtml(item.shortNote)}</p>` : ""}<span class="text-link">View Work</span></div></a></article>`).join("");
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
