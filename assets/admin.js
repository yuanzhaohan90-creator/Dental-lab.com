const loginPanel = document.getElementById("adminLogin");
const shell = document.getElementById("adminShell");
const loginForm = document.getElementById("ownerLoginForm");
const loginMessage = document.getElementById("ownerLoginMessage");
const nav = document.getElementById("adminNav");
const navToggle = document.getElementById("adminNavToggle");

function escapeHtml(value) {
  const node = document.createElement("div");
  node.textContent = value || "";
  return node.innerHTML;
}

function showMessage(element, message, type = "") {
  if (!element) return;
  element.className = `admin-message ${type}`;
  element.textContent = message;
}

async function api(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (response.status === 401 && location.pathname !== "/admin") {
    location.replace(`/admin?next=${encodeURIComponent(location.pathname + location.search)}`);
    throw new Error("Authentication required.");
  }
  if (!response.ok || data.ok === false) {
    const error = new Error(data.error || "Request failed.");
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}

function currentView() {
  const part = location.pathname.replace(/^\/admin\/?/, "").split("/")[0];
  return ["submissions", "media", "homepage", "settings"].includes(part) ? part : "dashboard";
}

function showShell() {
  loginPanel.hidden = true;
  shell.hidden = false;
  const view = currentView();
  document.querySelectorAll("[data-view]").forEach((section) => { section.hidden = section.dataset.view !== view; });
  document.querySelectorAll("[data-admin-route]").forEach((link) => link.classList.toggle("active", link.dataset.adminRoute === view));
  document.title = `${view[0].toUpperCase()}${view.slice(1)} | YZH Admin`;
  if (view === "dashboard") loadDashboard();
  if (view === "submissions") loadSubmissions();
  if (view === "media") loadMedia();
  if (view === "homepage") loadHomepage();
  if (view === "settings") loadSettings();
}

async function initialize() {
  try {
    const auth = await api("/api/admin-auth");
    if (auth.authenticated) return showShell();
    if (location.pathname !== "/admin") return location.replace(`/admin?next=${encodeURIComponent(location.pathname + location.search)}`);
    loginPanel.hidden = false;
  } catch {
    loginPanel.hidden = false;
  }
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  showMessage(loginMessage, "Signing in...");
  try {
    await api("/api/admin-auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: loginForm.elements.password.value }) });
    loginForm.reset();
    const next = new URLSearchParams(location.search).get("next");
    if (next?.startsWith("/admin") && next !== "/admin") return location.assign(next);
    showShell();
  } catch (error) {
    showMessage(loginMessage, error.message, "error");
  }
});

document.getElementById("ownerLogout").addEventListener("click", async () => {
  await api("/api/admin-auth", { method: "DELETE" });
  location.assign("/admin");
});

navToggle.addEventListener("click", () => {
  const open = nav.classList.toggle("open");
  navToggle.setAttribute("aria-expanded", open ? "true" : "false");
});

async function loadDashboard() {
  const stats = document.getElementById("dashboardStats");
  try {
    const data = await api("/api/admin-dashboard");
    stats.innerHTML = `<div class="admin-stat"><strong>${data.counts.publishedCases}</strong><span>Published Cases</span></div><div class="admin-stat"><strong>${data.counts.draftCases}</strong><span>Draft Cases</span></div><div class="admin-stat"><strong>${data.counts.newSubmissions}</strong><span>New Case Submissions</span></div>`;
    document.getElementById("dashboardSubmissions").innerHTML = data.recentSubmissions.length ? data.recentSubmissions.map((item) => `<a href="/admin/submissions?case=${encodeURIComponent(item.caseId)}"><span><strong>${escapeHtml(item.caseId)}</strong><small>${escapeHtml(item.name || item.company || "Customer submission")}</small></span><small>${formatDate(item.submittedAt)}</small></a>`).join("") : '<p class="admin-empty">No submissions yet.</p>';
    document.getElementById("dashboardPublished").innerHTML = data.recentPublished.length ? data.recentPublished.map((item) => `<a href="/admin/cases?case=${encodeURIComponent(item.id)}"><span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.category)}</small></span><small>${formatDate(item.publishedAt)}</small></a>`).join("") : '<p class="admin-empty">No published work yet.</p>';
  } catch (error) {
    stats.innerHTML = `<p class="admin-empty">${escapeHtml(error.message)}</p>`;
  }
}

function formatDate(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en", { year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function formatBytes(value) {
  const size = Number(value) || 0;
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(2)} MB`;
}

let submissions = [];
let currentSubmissionId = "";

async function loadSubmissions() {
  const list = document.getElementById("submissionList");
  try {
    const data = await api("/api/admin-submissions");
    submissions = data.submissions;
    renderSubmissions();
    const requested = new URLSearchParams(location.search).get("case");
    if (requested && submissions.some((item) => item.caseId === requested)) openSubmission(requested);
  } catch (error) {
    list.innerHTML = `<p class="admin-empty">${escapeHtml(error.message)}</p>`;
  }
}

function renderSubmissions() {
  const filter = document.getElementById("submissionFilter").value;
  const filtered = submissions.filter((item) => !filter || item.status === filter);
  document.getElementById("submissionList").innerHTML = filtered.length ? filtered.map((item) => `<button class="admin-record-button ${item.caseId === currentSubmissionId ? "active" : ""}" type="button" data-submission-id="${escapeHtml(item.caseId)}"><strong>${escapeHtml(item.caseId)}</strong><span>${escapeHtml(item.fields.name || "Unnamed customer")} · ${escapeHtml(item.fields.company || "No company")}</span><span class="admin-record-meta"><span>${formatDate(item.submittedAt)}</span><span class="admin-status-pill">${escapeHtml(item.status)} · ${item.fileCount} files</span></span></button>`).join("") : '<p class="admin-empty">No submissions in this status.</p>';
}

document.getElementById("submissionFilter").addEventListener("change", renderSubmissions);
document.getElementById("submissionList").addEventListener("click", (event) => {
  const button = event.target.closest("[data-submission-id]");
  if (button) openSubmission(button.dataset.submissionId);
});

async function copyText(value) {
  try { await navigator.clipboard.writeText(value || ""); } catch {
    const input = document.createElement("textarea"); input.value = value || ""; document.body.appendChild(input); input.select(); document.execCommand("copy"); input.remove();
  }
}

async function openSubmission(id) {
  currentSubmissionId = id;
  renderSubmissions();
  const detail = document.getElementById("submissionDetail");
  detail.innerHTML = '<p class="admin-loading">Loading...</p>';
  try {
    const { submission } = await api(`/api/admin-submissions?id=${encodeURIComponent(id)}`);
    const fields = submission.fields || {};
    const detailItems = [["Customer Name", fields.name], ["Company", fields.company], ["Email", fields.email], ["WhatsApp", fields.whatsapp], ["Country", fields.country], ["Case Type", fields.case_type], ["Implant Brand", fields.implant_brand], ["Implant System", fields.implant_system], ["Platform", fields.platform], ["Restoration Type", fields.restoration_type], ["Material", fields.material], ["Shade", fields.shade], ["Quantity", fields.quantity], ["Due Date", fields.due_date], ["Submitted", formatDate(submission.submittedAt)]];
    detail.innerHTML = `<div class="admin-detail-head"><div><p class="eyebrow">Customer Submission</p><h2>${escapeHtml(submission.caseId)}</h2></div><select id="submissionStatus"><option ${submission.status === "New" ? "selected" : ""}>New</option><option ${submission.status === "Reviewed" ? "selected" : ""}>Reviewed</option><option ${submission.status === "Archived" ? "selected" : ""}>Archived</option></select></div><dl class="admin-detail-grid">${detailItems.map(([label, value]) => `<div><dt>${label}</dt><dd>${escapeHtml(value || "-")}</dd></div>`).join("")}</dl><div class="admin-instructions"><strong>Case Instructions</strong><br>${escapeHtml(fields.instructions || "No instructions provided.")}</div><h3>Uploaded Files</h3><div class="admin-file-list">${submission.files.length ? submission.files.map((file) => `<div class="admin-file"><span><strong>${escapeHtml(file.originalName || file.filename)}</strong><br><small>${formatBytes(file.size)} · ${escapeHtml(file.contentType)}</small></span><a class="btn btn-secondary" href="${file.downloadUrl}">Download</a></div>`).join("") : '<p class="admin-empty">No files uploaded.</p>'}</div><div class="admin-copy-actions"><button class="btn btn-secondary" type="button" data-copy-value="${escapeHtml(fields.email)}">Copy Customer Email</button><button class="btn btn-secondary" type="button" data-copy-value="${escapeHtml(fields.whatsapp)}">Copy WhatsApp Number</button></div><div class="admin-message" id="submissionMessage" role="status"></div>`;
    document.getElementById("submissionStatus").addEventListener("change", async (event) => {
      try {
        await api("/api/admin-submissions", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ caseId: id, status: event.target.value }) });
        const item = submissions.find((entry) => entry.caseId === id); if (item) item.status = event.target.value; renderSubmissions(); showMessage(document.getElementById("submissionMessage"), "Status updated.", "success");
      } catch (error) { showMessage(document.getElementById("submissionMessage"), error.message, "error"); }
    });
    detail.querySelectorAll("[data-copy-value]").forEach((button) => button.addEventListener("click", async () => { await copyText(button.dataset.copyValue); showMessage(document.getElementById("submissionMessage"), "Copied.", "success"); }));
  } catch (error) {
    detail.innerHTML = `<p class="admin-empty">${escapeHtml(error.message)}</p>`;
  }
}

let mediaItems = [];

async function loadMedia() {
  try {
    const data = await api("/api/admin-media");
    mediaItems = data.media;
    renderMedia();
  } catch (error) {
    document.getElementById("mediaList").innerHTML = `<p class="admin-empty">${escapeHtml(error.message)}</p>`;
  }
}

function renderMedia() {
  document.getElementById("mediaList").innerHTML = mediaItems.length ? mediaItems.map((item) => `<article class="admin-media-item" data-media-id="${item.id}"><img src="${item.url}" alt="${escapeHtml(item.altText || item.displayName)}"><div class="admin-media-fields"><label class="field">Display Name<input data-media-key="displayName" value="${escapeHtml(item.displayName)}"></label><label class="field">Alt Text<input data-media-key="altText" value="${escapeHtml(item.altText)}"></label><label class="field">Category<select data-media-key="category">${["Cases", "Products", "Lab", "Homepage", "Other"].map((category) => `<option ${category === item.category ? "selected" : ""}>${category}</option>`).join("")}</select></label><p class="admin-media-usage"><strong>Used In:</strong> ${item.usedIn.length ? escapeHtml(item.usedIn.join(", ")) : "Not currently used"}</p><div class="admin-media-actions"><button class="btn btn-secondary" type="button" data-media-save>Save</button><button class="btn admin-danger" type="button" data-media-delete>Delete</button></div><div class="admin-message" role="status"></div></div></article>`).join("") : '<p class="admin-empty">No public media uploaded yet.</p>';
}

document.getElementById("mediaUploadForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const message = document.getElementById("mediaMessage");
  showMessage(message, "Uploading...");
  try {
    const form = event.currentTarget;
    const data = new FormData();
    data.append("image", form.elements.image.files[0]);
    data.append("category", form.elements.category.value);
    data.append("displayName", form.elements.displayName.value || form.elements.image.files[0].name.replace(/\.[^.]+$/, ""));
    data.append("altText", form.elements.altText.value);
    await api("/api/admin-media", { method: "POST", body: data });
    form.reset(); showMessage(message, "Media uploaded.", "success"); await loadMedia();
  } catch (error) { showMessage(message, error.message, "error"); }
});

document.getElementById("mediaList").addEventListener("click", async (event) => {
  const card = event.target.closest("[data-media-id]"); if (!card) return;
  const message = card.querySelector(".admin-message");
  try {
    if (event.target.closest("[data-media-save]")) {
      const body = { id: card.dataset.mediaId };
      card.querySelectorAll("[data-media-key]").forEach((field) => { body[field.dataset.mediaKey] = field.value; });
      await api("/api/admin-media", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      showMessage(message, "Media details saved.", "success"); await loadMedia();
    }
    if (event.target.closest("[data-media-delete]")) {
      if (!confirm("Delete this unused public media item?")) return;
      await api(`/api/admin-media?id=${encodeURIComponent(card.dataset.mediaId)}`, { method: "DELETE" });
      await loadMedia();
    }
  } catch (error) {
    showMessage(message, error.status === 409 ? `This image is currently in use: ${(error.data.usedIn || []).join(", ")}` : error.message, "error");
  }
});

function mediaOptions(items, selected, fallbackLabel) {
  return `<option value="">${escapeHtml(fallbackLabel)}</option>${items.map((item) => `<option value="${item.id}" ${item.id === selected ? "selected" : ""}>${escapeHtml(item.displayName || item.originalFilename)} · ${escapeHtml(item.category)}</option>`).join("")}`;
}

function caseOptions(items, selected) {
  return `<option value="">Empty slot</option>${items.map((item) => `<option value="${item.id}" ${item.id === selected ? "selected" : ""}>${escapeHtml(item.title)} · ${escapeHtml(item.category)}</option>`).join("")}`;
}

let homepageData;
async function loadHomepage() {
  const form = document.getElementById("homepageForm");
  try {
    const [home, media] = await Promise.all([api("/api/admin-homepage"), api("/api/admin-media")]);
    homepageData = home;
    const draft = home.config.draft;
    form.elements.heroEyebrow.value = draft.hero.eyebrow;
    form.elements.heroHeading.value = draft.hero.heading;
    form.elements.heroDescription.value = draft.hero.description;
    form.elements.heroImageMediaId.innerHTML = mediaOptions(media.media, draft.hero.imageMediaId, "Use current approved hero image");
    form.elements.primaryLabel.value = draft.hero.primaryLabel;
    form.elements.primaryDestination.value = draft.hero.primaryDestination;
    form.elements.secondaryLabel.value = draft.hero.secondaryLabel;
    form.elements.secondaryDestination.value = draft.hero.secondaryDestination;
    [1, 2, 3].forEach((slot, index) => { form.elements[`caseSlot${slot}`].innerHTML = caseOptions(home.publishedCases, draft.selectedWork.caseIds[index] || ""); });
    form.elements.workEyebrow.value = draft.selectedWork.eyebrow;
    form.elements.workHeading.value = draft.selectedWork.heading;
    form.elements.workDescription.value = draft.selectedWork.description;
    document.getElementById("restoreHomepage").disabled = !home.config.previous;
    document.getElementById("homepageState").textContent = home.config.publishedAt ? `Published ${formatDate(home.config.publishedAt)}` : "Using approved defaults";
  } catch (error) { showMessage(document.getElementById("homepageMessage"), error.message, "error"); }
}

function homepagePayload() {
  const form = document.getElementById("homepageForm");
  const caseIds = [form.elements.caseSlot1.value, form.elements.caseSlot2.value, form.elements.caseSlot3.value].filter(Boolean);
  if (new Set(caseIds).size !== caseIds.length) throw new Error("Each Selected Work slot must use a different case.");
  return { hero: { eyebrow: form.elements.heroEyebrow.value, heading: form.elements.heroHeading.value, description: form.elements.heroDescription.value, imageMediaId: form.elements.heroImageMediaId.value, imagePath: homepageData.config.draft.hero.imagePath, primaryLabel: form.elements.primaryLabel.value, primaryDestination: form.elements.primaryDestination.value, secondaryLabel: form.elements.secondaryLabel.value, secondaryDestination: form.elements.secondaryDestination.value }, selectedWork: { eyebrow: form.elements.workEyebrow.value, heading: form.elements.workHeading.value, description: form.elements.workDescription.value, caseIds } };
}

async function saveHomepageDraft() {
  const data = await api("/api/admin-homepage", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(homepagePayload()) });
  homepageData = data;
  showMessage(document.getElementById("homepageMessage"), "Homepage draft saved.", "success");
  return data;
}

document.getElementById("homepageForm").addEventListener("submit", async (event) => { event.preventDefault(); try { await saveHomepageDraft(); } catch (error) { showMessage(document.getElementById("homepageMessage"), error.message, "error"); } });
document.getElementById("previewHomepage").addEventListener("click", async () => { try { await saveHomepageDraft(); window.open("/?adminPreview=homepage", "_blank", "noopener"); } catch (error) { showMessage(document.getElementById("homepageMessage"), error.message, "error"); } });
document.getElementById("publishHomepage").addEventListener("click", async () => { if (!confirm("Publish this homepage draft to the live website?")) return; try { await saveHomepageDraft(); await api("/api/admin-homepage?action=publish", { method: "POST" }); showMessage(document.getElementById("homepageMessage"), "Homepage published.", "success"); await loadHomepage(); } catch (error) { showMessage(document.getElementById("homepageMessage"), error.message, "error"); } });
document.getElementById("restoreHomepage").addEventListener("click", async () => { if (!confirm("Restore the immediately previous published homepage version?")) return; try { await api("/api/admin-homepage?action=restore", { method: "POST" }); showMessage(document.getElementById("homepageMessage"), "Previous homepage version restored.", "success"); await loadHomepage(); } catch (error) { showMessage(document.getElementById("homepageMessage"), error.message, "error"); } });

let settingsData;
async function loadSettings() {
  const form = document.getElementById("settingsForm");
  try {
    const [settings, media] = await Promise.all([api("/api/admin-settings"), api("/api/admin-media")]);
    settingsData = settings;
    const draft = settings.settings.draft;
    ["companyName", "publicEmail", "whatsapp", "whatsappUrl", "phone", "location", "defaultSeoTitle", "defaultSeoDescription"].forEach((name) => { form.elements[name].value = draft[name]; });
    form.elements.defaultOgMediaId.innerHTML = mediaOptions(media.media, draft.defaultOgMediaId, "Use current approved OG image");
    document.getElementById("settingsState").textContent = settings.settings.publishedAt ? `Published ${formatDate(settings.settings.publishedAt)}` : "Using approved defaults";
  } catch (error) { showMessage(document.getElementById("settingsMessage"), error.message, "error"); }
}

function settingsPayload() {
  const form = document.getElementById("settingsForm");
  const payload = {};
  ["companyName", "publicEmail", "whatsapp", "whatsappUrl", "phone", "location", "defaultSeoTitle", "defaultSeoDescription", "defaultOgMediaId"].forEach((name) => { payload[name] = form.elements[name].value; });
  payload.defaultOgImagePath = settingsData.settings.draft.defaultOgImagePath;
  return payload;
}

async function saveSettingsDraft() {
  settingsData = await api("/api/admin-settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(settingsPayload()) });
  showMessage(document.getElementById("settingsMessage"), "Settings draft saved.", "success");
}

document.getElementById("settingsForm").addEventListener("submit", async (event) => { event.preventDefault(); try { await saveSettingsDraft(); } catch (error) { showMessage(document.getElementById("settingsMessage"), error.message, "error"); } });
document.getElementById("previewSettings").addEventListener("click", async () => { try { await saveSettingsDraft(); window.open("/?adminPreview=settings", "_blank", "noopener"); } catch (error) { showMessage(document.getElementById("settingsMessage"), error.message, "error"); } });
document.getElementById("publishSettings").addEventListener("click", async () => { if (!confirm("Publish these public settings?")) return; try { await saveSettingsDraft(); await api("/api/admin-settings?action=publish", { method: "POST" }); showMessage(document.getElementById("settingsMessage"), "Settings published.", "success"); await loadSettings(); } catch (error) { showMessage(document.getElementById("settingsMessage"), error.message, "error"); } });

initialize();
