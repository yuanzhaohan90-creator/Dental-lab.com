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

const routeAliases = { homepage: "home", "full-arch": "fullArch" };
function routePart() {
  const part = location.pathname.replace(/^\/admin\/?/, "").split("/")[0];
  return routeAliases[part] || part || "dashboard";
}

function currentView() {
  const part = routePart();
  if (["home", "implant", "fullArch", "about"].includes(part)) return "page";
  return ["submissions", "media", "settings"].includes(part) ? part : "dashboard";
}

function showShell() {
  loginPanel.hidden = true;
  shell.hidden = false;
  const view = currentView();
  const route = routePart();
  document.querySelectorAll("[data-view]").forEach((section) => { section.hidden = section.dataset.view !== view; });
  document.querySelectorAll("[data-admin-route]").forEach((link) => link.classList.toggle("active", link.dataset.adminRoute === route));
  if (view === "dashboard") loadDashboard();
  if (view === "page") loadPageEditor(route);
  if (view === "submissions") loadSubmissions();
  if (view === "media") loadMedia();
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
  } catch (error) { showMessage(loginMessage, error.message, "error"); }
});

document.getElementById("ownerLogout").addEventListener("click", async () => {
  await api("/api/admin-auth", { method: "DELETE" });
  location.assign("/admin");
});

navToggle.addEventListener("click", () => {
  const open = nav.classList.toggle("open");
  navToggle.setAttribute("aria-expanded", open ? "true" : "false");
});

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

async function loadDashboard() {
  const stats = document.getElementById("dashboardStats");
  try {
    const data = await api("/api/admin?module=dashboard");
    stats.innerHTML = `<div class="admin-stat"><strong>${data.counts.publishedCases}</strong><span>Published Cases</span></div><div class="admin-stat"><strong>${data.counts.draftCases}</strong><span>Draft Cases</span></div><div class="admin-stat"><strong>${data.counts.newSubmissions}</strong><span>New Submissions</span></div>`;
    document.getElementById("dashboardSubmissions").innerHTML = data.recentSubmissions.length ? data.recentSubmissions.map((item) => `<a href="/admin/submissions?case=${encodeURIComponent(item.caseId)}"><span><strong>${escapeHtml(item.caseId)}</strong><small>${escapeHtml(item.name || item.company || "Customer submission")}</small></span><small>${formatDate(item.submittedAt)}</small></a>`).join("") : '<p class="admin-empty">No submissions yet.</p>';
    document.getElementById("dashboardPublished").innerHTML = data.recentPublished.length ? data.recentPublished.map((item) => `<a href="/admin/cases?case=${encodeURIComponent(item.id)}"><span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.category)}</small></span><small>${formatDate(item.publishedAt)}</small></a>`).join("") : '<p class="admin-empty">No published work yet.</p>';
  } catch (error) { stats.innerHTML = `<p class="admin-empty">${escapeHtml(error.message)}</p>`; }
}

let submissions = [];
let currentSubmissionId = "";

async function loadSubmissions() {
  try {
    const data = await api("/api/admin?module=submissions");
    submissions = data.submissions;
    renderSubmissions();
    const requested = new URLSearchParams(location.search).get("case");
    if (requested && submissions.some((item) => item.caseId === requested)) openSubmission(requested);
  } catch (error) { document.getElementById("submissionList").innerHTML = `<p class="admin-empty">${escapeHtml(error.message)}</p>`; }
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
    const { submission } = await api(`/api/admin?module=submissions&id=${encodeURIComponent(id)}`);
    const fields = submission.fields || {};
    const detailItems = [["Customer", fields.name], ["Company", fields.company], ["Email", fields.email], ["WhatsApp", fields.whatsapp], ["Country", fields.country], ["Case Type", fields.case_type], ["Implant Brand", fields.implant_brand], ["Implant System", fields.implant_system], ["Platform", fields.platform], ["Restoration Type", fields.restoration_type], ["Material", fields.material], ["Shade", fields.shade], ["Quantity", fields.quantity], ["Due Date", fields.due_date], ["Submitted", formatDate(submission.submittedAt)]];
    detail.innerHTML = `<div class="admin-detail-head"><div><p class="eyebrow">Customer Submission</p><h2>${escapeHtml(submission.caseId)}</h2></div><select id="submissionStatus"><option ${submission.status === "New" ? "selected" : ""}>New</option><option ${submission.status === "Reviewed" ? "selected" : ""}>Reviewed</option><option ${submission.status === "Archived" ? "selected" : ""}>Archived</option></select></div><dl class="admin-detail-grid">${detailItems.map(([label, value]) => `<div><dt>${label}</dt><dd>${escapeHtml(value || "-")}</dd></div>`).join("")}</dl><div class="admin-instructions"><strong>Instructions</strong><br>${escapeHtml(fields.instructions || "No instructions provided.")}</div><h3>Files</h3><div class="admin-file-list">${submission.files.length ? submission.files.map((file) => `<div class="admin-file"><span><strong>${escapeHtml(file.originalName || file.filename)}</strong><br><small>${formatBytes(file.size)} · ${escapeHtml(file.contentType)}</small></span><a class="btn btn-secondary" href="${file.downloadUrl}">Download</a></div>`).join("") : '<p class="admin-empty">No files uploaded.</p>'}</div><div class="admin-copy-actions"><button class="btn btn-secondary" type="button" data-copy-value="${escapeHtml(fields.email)}">Copy Email</button><button class="btn btn-secondary" type="button" data-copy-value="${escapeHtml(fields.whatsapp)}">Copy WhatsApp</button></div><div class="admin-message" id="submissionMessage" role="status"></div>`;
    document.getElementById("submissionStatus").addEventListener("change", async (event) => {
      try {
        await api("/api/admin?module=submissions", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ caseId: id, status: event.target.value }) });
        const item = submissions.find((entry) => entry.caseId === id); if (item) item.status = event.target.value; renderSubmissions(); showMessage(document.getElementById("submissionMessage"), "Status updated.", "success");
      } catch (error) { showMessage(document.getElementById("submissionMessage"), error.message, "error"); }
    });
    detail.querySelectorAll("[data-copy-value]").forEach((button) => button.addEventListener("click", async () => { await copyText(button.dataset.copyValue); showMessage(document.getElementById("submissionMessage"), "Copied.", "success"); }));
  } catch (error) { detail.innerHTML = `<p class="admin-empty">${escapeHtml(error.message)}</p>`; }
}

let mediaItems = [];
let mediaTypeFilter = "";

async function loadMedia() {
  try {
    const data = await api("/api/admin?module=media");
    mediaItems = data.media;
    renderMedia();
  } catch (error) { document.getElementById("mediaList").innerHTML = `<p class="admin-empty">${escapeHtml(error.message)}</p>`; }
}

function mediaPreview(item, className = "") {
  if (item.mediaType === "video") return `<video class="${className}" src="${item.url}" muted playsinline preload="metadata"></video>`;
  return `<img class="${className}" src="${item.url}" alt="${escapeHtml(item.altText || item.displayName)}">`;
}

function renderMedia() {
  const category = document.getElementById("mediaCategoryFilter").value;
  const filtered = mediaItems.filter((item) => (!mediaTypeFilter || item.mediaType === mediaTypeFilter) && (!category || item.category === category));
  document.getElementById("mediaList").innerHTML = filtered.length ? filtered.map((item) => `<article class="admin-media-item" data-media-id="${item.id}">${mediaPreview(item)}<div class="admin-media-fields"><p class="media-type-label">${item.mediaType === "video" ? "MP4 Video" : "Image"} · ${formatBytes(item.size)}</p><label class="field">Display Name<input data-media-key="displayName" value="${escapeHtml(item.displayName)}"></label><label class="field">Alt Text<input data-media-key="altText" value="${escapeHtml(item.altText)}"></label><label class="field">Category<select data-media-key="category">${["Cases", "Homepage", "Implant", "Full-Arch", "Lab", "Products", "Other"].map((value) => `<option ${value === item.category ? "selected" : ""}>${value}</option>`).join("")}</select></label><p class="admin-media-usage"><strong>Used In:</strong> ${item.usedIn.length ? escapeHtml(item.usedIn.join(", ")) : "Not currently used"}</p><div class="admin-media-actions"><button class="btn btn-secondary" type="button" data-media-use>Use</button><button class="btn btn-secondary" type="button" data-media-save>Save</button><button class="btn admin-danger" type="button" data-media-delete>Delete</button></div><div class="media-use-menu" hidden><a href="/admin/home">Home</a><a href="/admin/implant">Implant</a><a href="/admin/full-arch">Full-Arch</a><a href="/admin/about">About</a></div><div class="admin-message" role="status"></div></div></article>`).join("") : '<p class="admin-empty">No media matches this filter.</p>';
}

document.getElementById("mediaTypeTabs").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-type]");
  if (!button) return;
  mediaTypeFilter = button.dataset.type;
  document.querySelectorAll("#mediaTypeTabs button").forEach((item) => item.classList.toggle("active", item === button));
  renderMedia();
});
document.getElementById("mediaCategoryFilter").addEventListener("change", renderMedia);
document.getElementById("showMediaUpload").addEventListener("click", () => document.getElementById("mediaUploadForm").scrollIntoView({ behavior: "smooth", block: "start" }));

async function uploadMediaFile(file, metadata, onProgress) {
  if (!window.yzhUploadMedia) throw new Error("Media uploader is not ready. Refresh and try again.");
  const blob = await window.yzhUploadMedia(file, { ...metadata, originalFilename: file.name, size: file.size }, onProgress);
  const result = await api("/api/admin?module=media-finalize", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ blob, metadata: { ...metadata, originalFilename: file.name, size: file.size } }) });
  return result.media;
}

document.getElementById("mediaUploadForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const file = form.elements.file.files[0];
  const message = document.getElementById("mediaMessage");
  const progress = document.getElementById("mediaUploadProgress");
  showMessage(message, "Uploading..."); progress.hidden = false;
  try {
    await uploadMediaFile(file, { category: form.elements.category.value, displayName: form.elements.displayName.value || file.name.replace(/\.[^.]+$/, ""), altText: form.elements.altText.value }, (percentage) => { progress.querySelector("span").style.width = `${percentage}%`; });
    form.reset(); progress.hidden = true; progress.querySelector("span").style.width = "0"; showMessage(message, "Media uploaded.", "success"); await loadMedia();
  } catch (error) { progress.hidden = true; showMessage(message, error.message, "error"); }
});

document.getElementById("mediaList").addEventListener("click", async (event) => {
  const card = event.target.closest("[data-media-id]"); if (!card) return;
  const message = card.querySelector(".admin-message");
  try {
    if (event.target.closest("[data-media-use]")) card.querySelector(".media-use-menu").hidden = !card.querySelector(".media-use-menu").hidden;
    if (event.target.closest("[data-media-save]")) {
      const body = { id: card.dataset.mediaId };
      card.querySelectorAll("[data-media-key]").forEach((field) => { body[field.dataset.mediaKey] = field.value; });
      await api("/api/admin?module=media", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      showMessage(message, "Name and alt text saved.", "success"); await loadMedia();
    }
    if (event.target.closest("[data-media-delete]")) {
      if (!confirm("Delete this public media item? Used media cannot be deleted.")) return;
      await api(`/api/admin?module=media&id=${encodeURIComponent(card.dataset.mediaId)}`, { method: "DELETE" });
      await loadMedia();
    }
  } catch (error) { showMessage(message, error.status === 409 ? `Currently used in: ${(error.data.usedIn || []).join(", ")}` : error.message, "error"); }
});

function getPath(object, path) {
  return path.split(".").reduce((value, key) => value?.[key], object);
}

function setPath(object, path, value) {
  const keys = path.split(".");
  const last = keys.pop();
  const target = keys.reduce((current, key) => current[key] ??= {}, object);
  target[last] = value;
}

const PAGE_META = {
  home: { title: "Home", intro: "Edit the homepage from top to bottom.", publicPath: "/", category: "Homepage" },
  implant: { title: "Implant Restorations", intro: "Choose strong real implant work for every position.", publicPath: "/implant-restorations", category: "Implant" },
  fullArch: { title: "Full-Arch / All-on-X", intro: "Manage full-arch cases, restoration options, framework and workflow media.", publicPath: "/full-arch-all-on-x", category: "Full-Arch" },
  about: { title: "About / Our Lab", intro: "Use real laboratory, technician, equipment and QC media only.", publicPath: "/about", category: "Lab" }
};

const PAGE_SECTIONS = {
  home: [
    { key: "hero", label: "01 Hero", hint: "Recommended: strongest real Full-Arch restoration.", media: true, video: true, eyebrow: true, cta: true, secondaryCta: true },
    { key: "selectedWork", label: "02 Selected Work", hint: "Choose up to 3 Published Cases. Public images open the selected case.", selectedCases: true, eyebrow: true },
    { key: "technicalProof", label: "03 Technical Proof", hint: "Recommended: real CAD, framework, model seating or QC photo.", media: true, video: true, eyebrow: true },
    { key: "workflow", label: "04 Workflow", hint: "Optional images for Files, CAD / Design, Production and QC.", workflow: true, eyebrow: true },
    { key: "finalCta", label: "05 Final CTA", hint: "Use a relevant background image or short MP4 video.", media: true, video: true, eyebrow: true, cta: true }
  ],
  implant: [
    { key: "hero", label: "01 Hero", hint: "Recommended: strongest screw-retained implant bridge or implant restoration.", media: true, eyebrow: true, cta: true },
    { key: "featuredWork", label: "02 Featured Implant Work", hint: "Choose from real Published Cases.", featuredCase: true },
    { key: "customAbutments", label: "03 Custom Abutments", hint: "Recommended: real custom abutment / crown assembly.", media: true },
    { key: "implantBridge", label: "04 Screw-Retained / Implant Bridge", hint: "Recommended: real screw-retained bridge, interfaces or assembly.", media: true },
    { key: "qc", label: "05 QC", hint: "Recommended: interface, model seating, screw access or inspection photo.", media: true },
    { key: "cta", label: "06 CTA", hint: "Final route to Submit Case.", media: true, eyebrow: true, cta: true }
  ],
  fullArch: [
    { key: "hero", label: "01 Hero", hint: "Recommended: strongest real Full-Arch final restoration.", media: true, video: true, eyebrow: true, cta: true },
    { key: "featuredCase", label: "02 Featured Full-Arch Case", hint: "Choose from Published Featured Case Studies.", featuredCase: true, caseStudyOnly: true },
    { key: "restorationOptions", label: "03 Restoration Options", hint: "PMMA, monolithic zirconia and zirconia with titanium bar.", restorationOptions: true },
    { key: "framework", label: "04 Titanium Framework / Bar", hint: "Recommended: real titanium bar/framework or manufacturing footage.", media: true, video: true },
    { key: "workflow", label: "05 Workflow", hint: "Use a real full-arch process image or short MP4.", media: true, video: true },
    { key: "qc", label: "06 QC", hint: "Recommended: interface, fit, model seating or final inspection.", media: true },
    { key: "cta", label: "07 CTA", hint: "Final route to Submit Case.", media: true, eyebrow: true, cta: true }
  ],
  about: [
    { key: "hero", label: "01 Hero", hint: "Use real laboratory or CAD workstation media.", media: true, video: true, eyebrow: true, cta: true },
    { key: "laboratory", label: "02 Laboratory", hint: "Upload a real laboratory working-area photo/video.", media: true, video: true },
    { key: "cad", label: "03 CAD / Design", hint: "Upload real CAD workstation photo/video.", media: true, video: true },
    { key: "production", label: "04 Production", hint: "Upload real milling/production photo/video.", media: true, video: true },
    { key: "finishing", label: "05 Finishing", hint: "Upload real technician working photo/video.", media: true, video: true },
    { key: "qc", label: "06 QC", hint: "Upload real QC inspection photo/video.", media: true, video: true },
    { key: "packing", label: "07 Packing / Shipping", hint: "Upload real packing or dispatch photo/video. Leave empty until real media is available.", media: true, video: true }
  ]
};

let pageKey = "";
let pageData;

function mediaOptions(selected, type = "") {
  const items = mediaItems.filter((item) => !type || item.mediaType === type);
  return `<option value="">Use current page media</option>${items.map((item) => `<option value="${item.id}" ${item.id === selected ? "selected" : ""}>${escapeHtml(item.displayName || item.originalFilename)} · ${escapeHtml(item.category)} · ${item.mediaType}</option>`).join("")}`;
}

function caseOptions(selected, caseStudyOnly = false) {
  const cases = (pageData?.publishedCases || []).filter((item) => !caseStudyOnly || item.contentType === "case_study");
  return `<option value="">No case selected</option>${cases.map((item) => `<option value="${item.id}" ${item.id === selected ? "selected" : ""}>${escapeHtml(item.title)} · ${escapeHtml(item.category)}</option>`).join("")}`;
}

function currentMedia(slot) {
  return mediaItems.find((item) => item.id === slot?.mediaId);
}

function editorMediaPreview(slot) {
  const item = currentMedia(slot);
  if (item) return mediaPreview(item, "editor-media-preview");
  if (slot?.fallbackPath) return `<img class="editor-media-preview" src="${escapeHtml(slot.fallbackPath)}" alt="${escapeHtml(slot.altText || "Current page media")}">`;
  return '<div class="editor-media-empty">No public media selected</div>';
}

function renderMediaEditor(path, slot, allowVideo, hint) {
  const isVideo = slot?.mediaType === "video" || currentMedia(slot)?.mediaType === "video";
  return `<div class="media-position" data-media-position="${path}"><div class="media-position-preview">${editorMediaPreview(slot)}</div><div class="media-position-controls"><p class="admin-helper">${escapeHtml(hint)}</p><label class="field">Choose from Media<select data-path="${path}.mediaId">${mediaOptions(slot?.mediaId)}</select></label><div class="media-action-row"><button class="btn btn-secondary" type="button" data-choose-upload="image" data-media-path="${path}">Replace Image</button>${allowVideo ? `<button class="btn btn-secondary" type="button" data-choose-upload="video" data-media-path="${path}">Upload Video</button>` : ""}<a class="btn btn-secondary" href="/admin/media">Media Library</a></div><input class="visually-hidden" type="file" data-media-upload="${path}" accept="image/jpeg,image/png,image/webp,video/mp4"><div class="video-options" ${isVideo ? "" : "hidden"}><label class="field">Poster Image<select data-path="${path}.posterMediaId">${mediaOptions(slot?.posterMediaId, "image")}</select></label><label class="check-field"><input type="checkbox" data-path="${path}.autoplay" ${slot?.autoplay ? "checked" : ""}> Autoplay</label><label class="check-field"><input type="checkbox" data-path="${path}.muted" checked disabled> Muted</label><label class="check-field"><input type="checkbox" data-path="${path}.loop" ${slot?.loop ? "checked" : ""}> Loop</label></div></div></div>`;
}

function textFields(path, value, section) {
  return `${section.eyebrow ? `<label class="field">Eyebrow<input data-path="${path}.eyebrow" maxlength="160" value="${escapeHtml(value.eyebrow)}"></label>` : ""}<label class="field">Title<input data-path="${path}.heading" maxlength="200" value="${escapeHtml(value.heading)}"></label><label class="field">Copy<textarea data-path="${path}.description" maxlength="800">${escapeHtml(value.description)}</textarea></label>${section.cta ? `<div class="form-grid"><label class="field">Button Text<input data-path="${path}.primaryLabel" maxlength="80" value="${escapeHtml(value.primaryLabel)}"></label><label class="field">Button Destination<select data-path="${path}.primaryDestination"><option value="/submit-case" ${value.primaryDestination === "/submit-case" ? "selected" : ""}>Submit Case</option><option value="/cases" ${value.primaryDestination === "/cases" ? "selected" : ""}>Cases</option></select></label></div>` : ""}${section.secondaryCta ? `<div class="form-grid"><label class="field">Second Button Text<input data-path="${path}.secondaryLabel" maxlength="80" value="${escapeHtml(value.secondaryLabel)}"></label><label class="field">Second Button Destination<select data-path="${path}.secondaryDestination"><option value="https://wa.me/8613714730109">WhatsApp Technical Team</option><option value="/cases" ${value.secondaryDestination === "/cases" ? "selected" : ""}>Cases</option></select></label></div>` : ""}`;
}

function selectedWorkEditor(value) {
  const ids = [...(value.caseIds || [])]; while (ids.length < 3) ids.push("");
  return `<div class="selected-work-editor">${ids.map((id, index) => { const item = pageData.publishedCases.find((entry) => entry.id === id); return `<div class="selected-work-slot" data-case-index="${index}">${item?.coverImage ? `<img src="${item.coverImage.url}" alt="${escapeHtml(item.title)}">` : '<div class="case-slot-empty">Empty slot</div>'}<label class="field">Slot ${index + 1}<select data-case-slot="${index}">${caseOptions(id)}</select></label><div class="slot-actions"><button type="button" class="btn btn-secondary" data-case-move="up" ${index === 0 ? "disabled" : ""}>Move Up</button><button type="button" class="btn btn-secondary" data-case-move="down" ${index === 2 ? "disabled" : ""}>Move Down</button></div></div>`; }).join("")}</div>`;
}

function workflowEditor(value, section) {
  return `${textFields("workflow", value, section)}<div class="workflow-media-grid">${(value.items || []).map((item, index) => `<div><label class="field">Stage<input data-path="workflow.items.${index}.label" value="${escapeHtml(item.label)}"></label>${renderMediaEditor(`workflow.items.${index}.media`, item.media, false, `Optional ${item.label} image.`)}</div>`).join("")}</div>`;
}

function restorationOptionsEditor(value) {
  return `<div class="restoration-option-editor">${value.map((option, index) => `<div class="restoration-option"><h3>Option ${index + 1}</h3>${textFields(`restorationOptions.${index}`, option, {})}${renderMediaEditor(`restorationOptions.${index}.media`, option.media, false, "Use a real restoration image.")}<label class="field">Optional Linked Case<select data-path="restorationOptions.${index}.caseId">${caseOptions(option.caseId)}</select></label></div>`).join("")}</div>`;
}

function renderPageEditor() {
  const draft = pageData.config.draft;
  const sections = PAGE_SECTIONS[pageKey];
  document.getElementById("pageSections").innerHTML = sections.map((section) => {
    const value = draft[section.key];
    let content = "";
    if (section.selectedCases) content = `${textFields(section.key, value, section)}${selectedWorkEditor(value)}`;
    else if (section.workflow) content = workflowEditor(value, section);
    else if (section.restorationOptions) content = restorationOptionsEditor(value);
    else if (section.featuredCase) content = `${textFields(section.key, value, section)}<label class="field">Choose Featured Case<select data-path="${section.key}.caseId">${caseOptions(value.caseId, section.caseStudyOnly)}</select></label>`;
    else content = `${textFields(section.key, value, section)}${section.media ? renderMediaEditor(`${section.key}.media`, value.media, section.video, section.hint) : ""}`;
    return `<section class="page-section-editor"><div class="page-section-heading"><span>${escapeHtml(section.label.split(" ")[0])}</span><div><h2>${escapeHtml(section.label.replace(/^\d+\s/, ""))}</h2><p>${escapeHtml(section.hint)}</p></div></div>${content}</section>`;
  }).join("");
}

function collectPageDraft() {
  const draft = structuredClone(pageData.config.draft);
  document.querySelectorAll("#pageSections [data-path]").forEach((field) => {
    let value = field.type === "checkbox" ? field.checked : field.value;
    setPath(draft, field.dataset.path, value);
  });
  if (pageKey === "home") {
    const ids = [...document.querySelectorAll("[data-case-slot]")].sort((a, b) => Number(a.dataset.caseSlot) - Number(b.dataset.caseSlot)).map((field) => field.value).filter(Boolean);
    if (new Set(ids).size !== ids.length) throw new Error("Each Selected Work slot must use a different case.");
    draft.selectedWork.caseIds = ids;
  }
  return draft;
}

async function loadPageEditor(key) {
  pageKey = key;
  const meta = PAGE_META[key];
  document.getElementById("pageEditorTitle").textContent = meta.title;
  document.getElementById("pageEditorIntro").textContent = meta.intro;
  document.title = `${meta.title} | YZH Website Manager`;
  try {
    const [page, media] = await Promise.all([api(`/api/admin?module=page-editor&page=${encodeURIComponent(key)}`), api("/api/admin?module=media")]);
    pageData = page; mediaItems = media.media;
    document.getElementById("pageDraftState").textContent = page.config.updatedAt ? `DRAFT · ${formatDate(page.config.updatedAt)}` : "DRAFT";
    document.getElementById("restorePage").disabled = !page.config.previous;
    renderPageEditor();
  } catch (error) { document.getElementById("pageSections").innerHTML = `<p class="admin-empty">${escapeHtml(error.message)}</p>`; }
}

document.getElementById("pageSections").addEventListener("change", (event) => {
  if (event.target.matches("select[data-path$='.mediaId']")) {
    const path = event.target.dataset.path.replace(/\.mediaId$/, "");
    const item = mediaItems.find((entry) => entry.id === event.target.value);
    setPath(pageData.config.draft, `${path}.mediaId`, event.target.value);
    setPath(pageData.config.draft, `${path}.mediaType`, item?.mediaType || "image");
    pageData.config.draft = collectPageDraft();
    renderPageEditor();
  }
  if (event.target.matches("[data-case-slot]")) {
    pageData.config.draft = collectPageDraft();
    renderPageEditor();
  }
});

document.getElementById("pageSections").addEventListener("click", (event) => {
  const choose = event.target.closest("[data-choose-upload]");
  if (choose) {
    const input = document.querySelector(`[data-media-upload="${choose.dataset.mediaPath}"]`);
    input.accept = choose.dataset.chooseUpload === "video" ? "video/mp4" : "image/jpeg,image/png,image/webp";
    input.click();
  }
  const move = event.target.closest("[data-case-move]");
  if (move) {
    pageData.config.draft = collectPageDraft();
    const index = Number(move.closest("[data-case-index]").dataset.caseIndex);
    const next = move.dataset.caseMove === "up" ? index - 1 : index + 1;
    const ids = [...pageData.config.draft.selectedWork.caseIds]; while (ids.length < 3) ids.push("");
    [ids[index], ids[next]] = [ids[next], ids[index]];
    pageData.config.draft.selectedWork.caseIds = ids.filter(Boolean);
    renderPageEditor();
  }
});

document.getElementById("pageSections").addEventListener("change", async (event) => {
  const input = event.target.closest("[data-media-upload]");
  if (!input?.files?.[0]) return;
  const file = input.files[0];
  const message = document.getElementById("pageEditorMessage");
  showMessage(message, `Uploading ${file.name}...`);
  try {
    pageData.config.draft = collectPageDraft();
    const media = await uploadMediaFile(file, { category: PAGE_META[pageKey].category, displayName: file.name.replace(/\.[^.]+$/, ""), altText: "" });
    mediaItems.unshift(media);
    setPath(pageData.config.draft, `${input.dataset.mediaUpload}.mediaId`, media.id);
    setPath(pageData.config.draft, `${input.dataset.mediaUpload}.mediaType`, media.mediaType);
    renderPageEditor();
    showMessage(message, "Media uploaded and selected. Save Draft when ready.", "success");
  } catch (error) { showMessage(message, error.message, "error"); }
});

async function savePageDraft() {
  const draft = collectPageDraft();
  const data = await api(`/api/admin?module=page-editor&page=${encodeURIComponent(pageKey)}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft) });
  pageData.config = data.config;
  showMessage(document.getElementById("pageEditorMessage"), "Draft saved. The live website has not changed.", "success");
  return data;
}

document.getElementById("pageEditorForm").addEventListener("submit", async (event) => { event.preventDefault(); try { await savePageDraft(); } catch (error) { showMessage(document.getElementById("pageEditorMessage"), error.message, "error"); } });
document.getElementById("previewPage").addEventListener("click", async () => { try { await savePageDraft(); window.open(`${PAGE_META[pageKey].publicPath}?adminPreview=${encodeURIComponent(pageKey)}`, "_blank", "noopener"); } catch (error) { showMessage(document.getElementById("pageEditorMessage"), error.message, "error"); } });
document.getElementById("publishPage").addEventListener("click", async () => { if (!confirm(`Publish the ${PAGE_META[pageKey].title} draft to the live website?`)) return; try { await savePageDraft(); await api(`/api/admin?module=page-editor&page=${encodeURIComponent(pageKey)}&action=publish`, { method: "POST" }); showMessage(document.getElementById("pageEditorMessage"), "Published successfully.", "success"); await loadPageEditor(pageKey); } catch (error) { showMessage(document.getElementById("pageEditorMessage"), error.message, "error"); } });
document.getElementById("restorePage").addEventListener("click", async () => { if (!confirm("Restore the previous published version?")) return; try { await api(`/api/admin?module=page-editor&page=${encodeURIComponent(pageKey)}&action=restore`, { method: "POST" }); showMessage(document.getElementById("pageEditorMessage"), "Previous version restored.", "success"); await loadPageEditor(pageKey); } catch (error) { showMessage(document.getElementById("pageEditorMessage"), error.message, "error"); } });

function mediaOptionsSimple(items, selected, fallbackLabel) {
  return `<option value="">${escapeHtml(fallbackLabel)}</option>${items.filter((item) => item.mediaType === "image").map((item) => `<option value="${item.id}" ${item.id === selected ? "selected" : ""}>${escapeHtml(item.displayName || item.originalFilename)} · ${escapeHtml(item.category)}</option>`).join("")}`;
}

let settingsData;
async function loadSettings() {
  const form = document.getElementById("settingsForm");
  try {
    const [settings, media] = await Promise.all([api("/api/admin?module=settings"), api("/api/admin?module=media")]);
    settingsData = settings; mediaItems = media.media;
    const draft = settings.settings.draft;
    ["companyName", "publicEmail", "whatsapp", "whatsappUrl", "phone", "location", "defaultSeoTitle", "defaultSeoDescription"].forEach((name) => { form.elements[name].value = draft[name]; });
    form.elements.defaultOgMediaId.innerHTML = mediaOptionsSimple(media.media, draft.defaultOgMediaId, "Use current social image");
    document.getElementById("settingsState").textContent = settings.settings.publishedAt ? `LIVE · ${formatDate(settings.settings.publishedAt)}` : "DRAFT";
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
  settingsData = await api("/api/admin?module=settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(settingsPayload()) });
  showMessage(document.getElementById("settingsMessage"), "Settings draft saved.", "success");
}

document.getElementById("settingsForm").addEventListener("submit", async (event) => { event.preventDefault(); try { await saveSettingsDraft(); } catch (error) { showMessage(document.getElementById("settingsMessage"), error.message, "error"); } });
document.getElementById("previewSettings").addEventListener("click", async () => { try { await saveSettingsDraft(); window.open("/?adminPreview=settings", "_blank", "noopener"); } catch (error) { showMessage(document.getElementById("settingsMessage"), error.message, "error"); } });
document.getElementById("publishSettings").addEventListener("click", async () => { if (!confirm("Publish these public settings?")) return; try { await saveSettingsDraft(); await api("/api/admin?module=settings&action=publish", { method: "POST" }); showMessage(document.getElementById("settingsMessage"), "Settings published.", "success"); await loadSettings(); } catch (error) { showMessage(document.getElementById("settingsMessage"), error.message, "error"); } });

initialize();
