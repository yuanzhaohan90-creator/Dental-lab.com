const caseList = document.getElementById("caseList");
const caseFilters = document.getElementById("caseFilters");
let publishedCases = [];

function escapeHtml(value) {
  const element = document.createElement("div");
  element.textContent = value || "";
  return element.innerHTML;
}

function renderCases(category = "") {
  const filtered = category ? publishedCases.filter((item) => item.category === category) : publishedCases;
  if (!filtered.length) {
    caseList.innerHTML = `<p class="case-library-state">${publishedCases.length ? "No published cases in this category yet." : "No published cases yet."}</p>`;
    return;
  }
  caseList.innerHTML = filtered.map((item) => `<article class="public-case-card"><a href="/cases/${encodeURIComponent(item.slug)}"><img src="${escapeHtml(item.coverImage.url)}" alt="${escapeHtml(item.title)}" loading="lazy"><div><span class="case-category">${escapeHtml(item.category)}</span><h2>${escapeHtml(item.title)}</h2>${item.material ? `<p class="case-material">${escapeHtml(item.material)}</p>` : ""}<p>${escapeHtml(item.summary)}</p><span class="text-link">View Case</span></div></a></article>`).join("");
}

caseFilters?.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-category]");
  if (!button) return;
  caseFilters.querySelectorAll("button").forEach((item) => item.classList.toggle("active", item === button));
  renderCases(button.dataset.category);
});

fetch("/api/cases")
  .then((response) => response.json().then((data) => ({ response, data })))
  .then(({ response, data }) => {
    if (!response.ok || !data.ok) throw new Error(data.error || "Could not load cases.");
    publishedCases = data.cases;
    renderCases();
  })
  .catch(() => { caseList.innerHTML = '<p class="case-library-state error">The case library could not be loaded. Please try again.</p>'; });
