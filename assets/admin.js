const loginPanel = document.getElementById("adminLogin");
const shell = document.getElementById("adminShell");
const loginForm = document.getElementById("ownerLoginForm");
const loginMessage = document.getElementById("ownerLoginMessage");
const nav = document.getElementById("adminNav");
const navToggle = document.getElementById("adminNavToggle");
const ADMIN_SESSION_KEY = "yzh_admin_session";
const isAdminRoot = /^\/admin\/?$/.test(location.pathname);

function readStoredAdminSession() {
  return sessionStorage.getItem(ADMIN_SESSION_KEY) || localStorage.getItem(ADMIN_SESSION_KEY) || "";
}

function storeAdminSession(token) {
  if (!token) return;
  sessionStorage.setItem(ADMIN_SESSION_KEY, token);
  localStorage.setItem(ADMIN_SESSION_KEY, token);
}

function clearStoredAdminSession() {
  sessionStorage.removeItem(ADMIN_SESSION_KEY);
  localStorage.removeItem(ADMIN_SESSION_KEY);
}

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

function adminErrorMessage(message) {
  const translations = {
    "Invalid password.": "密码错误，请重新输入。",
    "Authentication required.": "请先登录管理员后台。",
    "Authentication is temporarily unavailable.": "登录服务暂时不可用，请稍后重试。",
    "Invalid request origin.": "请求来源无效，请刷新页面后重试。",
    "Request failed.": "请求失败，请稍后重试。",
    "Media item not found.": "未找到该媒体。",
    "This image is currently in use.": "该媒体正在被页面使用。",
    "This media is currently in use.": "该媒体正在被页面使用，请先替换或移除引用。",
    "A published section requires replacement media.": "已上线区块没有备用图，必须选择替换媒体。",
    "Branding and social images must use an active image from Media Library.": "品牌和社交分享图片必须选择媒体库中的有效图片。",
    "Move media to Trash before permanent deletion.": "请先把媒体移入回收站，再永久删除。",
    "Move the submission to Trash before permanent deletion.": "请先把客户提交移入回收站，再永久删除。",
    "Submission not found.": "未找到该客户提交。",
    "Method not allowed.": "当前操作不受支持。"
  };
  return translations[message] || message;
}

async function api(url, options = {}) {
  const headers = new Headers(options.headers || {});
  const sessionToken = readStoredAdminSession();
  if (sessionToken) headers.set("Authorization", `Bearer ${sessionToken}`);
  const response = await fetch(url, { ...options, headers, credentials: "same-origin" });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401 && !isAdminRoot) {
    clearStoredAdminSession();
    location.replace(`/admin?next=${encodeURIComponent(location.pathname + location.search)}`);
    throw new Error("请先登录管理员后台。");
  }
  if (!response.ok || data.ok === false) {
    const error = new Error(adminErrorMessage(data.error || "Request failed."));
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}

const routeAliases = { homepage: "home", "full-arch": "fullArch", "submit-case": "submitCase" };
const websitePageAliases = { home: "home", implant: "implant", "full-arch": "fullArch", about: "about", "submit-case": "submitCase" };
function adminRouteSegments() {
  return location.pathname.replace(/^\/admin\/?/, "").split("/").filter(Boolean);
}

function routePart() {
  const [part] = adminRouteSegments();
  return routeAliases[part] || part || "dashboard";
}

function websitePageKey() {
  const segments = adminRouteSegments();
  if (segments[0] !== "website") return "";
  return websitePageAliases[segments[1]] || "";
}

function currentView() {
  const part = routePart();
  if (part === "website") return websitePageKey() ? "page" : "website";
  if (["home", "implant", "fullArch", "about"].includes(part)) return "page";
  return ["cases", "submissions", "media", "settings", "seo", "advanced"].includes(part) ? part : "dashboard";
}

function showShell() {
  loginPanel.hidden = true;
  shell.hidden = false;
  window.scrollTo({ top: 0, left: 0 });
  const view = currentView();
  const route = currentView() === "page" ? "website" : routePart();
  const editorKey = websitePageKey() || routePart();
  document.querySelectorAll("[data-view]").forEach((section) => { section.hidden = section.dataset.view !== view; });
  document.querySelectorAll("[data-admin-route]").forEach((link) => {
    const active = link.dataset.adminRoute === route;
    link.classList.toggle("active", active);
    if (active) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
  if (view === "dashboard") loadDashboard();
  if (view === "cases") loadCaseCenter();
  if (view === "page") loadPageEditor(editorKey);
  if (view === "submissions") loadSubmissions();
  if (view === "media") loadMedia();
  if (view === "settings") loadSettings();
}

async function applyAdminBranding() {
  try {
    const response = await fetch("/api/admin?module=public-site", { cache: "no-store" });
    const data = await response.json();
    const settings = data.settings || {};
    document.querySelectorAll(".brand").forEach((brand) => {
      const mark = brand.querySelector(".brand-mark");
      let logo = brand.querySelector(".brand-logo");
      if (!settings.primaryLogoUrl) return;
      if (!logo) { logo = document.createElement("img"); logo.className = "brand-logo"; brand.prepend(logo); }
      logo.src = settings.primaryLogoUrl;
      logo.alt = settings.companyName || "YZH Dental Lab";
      if (mark) mark.hidden = true;
    });
  } catch {}
}

async function initialize() {
  applyAdminBranding();
  try {
    const auth = await api("/api/admin-auth");
    if (auth.authenticated) return showShell();
    if (!isAdminRoot) return location.replace(`/admin?next=${encodeURIComponent(location.pathname + location.search)}`);
    loginPanel.hidden = false;
  } catch {
    loginPanel.hidden = false;
  }
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  showMessage(loginMessage, "正在登录...");
  try {
    const auth = await api("/api/admin-auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: loginForm.elements.password.value }) });
    if (auth.sessionToken) storeAdminSession(auth.sessionToken);
    loginForm.reset();
    const next = new URLSearchParams(location.search).get("next");
    if (next?.startsWith("/admin") && next !== "/admin") return location.assign(next);
    showShell();
  } catch (error) { showMessage(loginMessage, error.message, "error"); }
});

document.getElementById("ownerLogout").addEventListener("click", async () => {
  try { await api("/api/admin-auth", { method: "DELETE" }); }
  finally { clearStoredAdminSession(); }
  location.assign("/admin");
});

function toggleAdminNavigation() {
  const open = nav.classList.toggle("open");
  navToggle.setAttribute("aria-expanded", open ? "true" : "false");
}
navToggle.addEventListener("click", toggleAdminNavigation);
navToggle.addEventListener("keydown", (event) => {
  if (!["Enter", " "].includes(event.key)) return;
  event.preventDefault();
  toggleAdminNavigation();
});
nav.addEventListener("click", (event) => {
  if (!event.target.closest("a")) return;
  nav.classList.remove("open");
  navToggle.setAttribute("aria-expanded", "false");
});
document.addEventListener("click", (event) => {
  if (!nav.classList.contains("open") || event.target.closest("#adminNav,#adminNavToggle")) return;
  nav.classList.remove("open");
  navToggle.setAttribute("aria-expanded", "false");
});
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape" || !nav.classList.contains("open")) return;
  nav.classList.remove("open");
  navToggle.setAttribute("aria-expanded", "false");
  navToggle.focus();
});

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  const pad = (number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatBytes(value) {
  const size = Number(value) || 0;
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(2)} MB`;
}

const CATEGORY_LABELS = { Cases: "案例", Homepage: "网站首页", Implant: "种植修复", "Full-Arch": "全口修复", Lab: "实验室", Products: "产品", Other: "其他" };
const STATUS_LABELS = {
  New: "新提交",
  Reviewing: "审核中",
  "Quotation Sent": "已发报价",
  "Waiting for Confirmation": "等待确认",
  "In Progress": "制作中",
  QC: "质检中",
  Completed: "已完成",
  Closed: "已关闭",
  Reviewed: "已查看",
  Archived: "已归档",
  Trash: "回收站",
  draft: "草稿",
  published: "已发布",
  hidden: "未发布",
  trash: "回收站"
};
function categoryLabel(value) { return CATEGORY_LABELS[value] || value || "-"; }
function statusLabel(value) { return STATUS_LABELS[value] || value || "-"; }

async function loadDashboard() {
  const stats = document.getElementById("dashboardStats");
  try {
    const data = await api("/api/admin?module=dashboard");
    stats.innerHTML = `<div class="admin-stat"><strong>${data.counts.newSubmissions}</strong><span>新提交</span></div><div class="admin-stat"><strong>${data.counts.draftCases}</strong><span>草稿案例</span></div><div class="admin-stat"><strong>${data.counts.publishedCases}</strong><span>已发布案例</span></div><div class="admin-stat"><strong>${data.counts.totalMedia}</strong><span>素材总数</span></div><div class="admin-stat"><strong>${data.counts.contentHealth}</strong><span>待处理事项</span></div>`;
    document.getElementById("dashboardHealth").innerHTML = data.contentHealth?.length ? data.contentHealth.map((item) => `<a href="${escapeHtml(item.href)}"><span><strong>${escapeHtml(item.label)}</strong><small>点击进入对应编辑位置</small></span><b>处理</b></a>`).join("") : '<p class="admin-empty">内容健康良好，没有需要立即处理的问题。</p>';
    document.getElementById("dashboardActivity").innerHTML = data.recentActivity?.length ? data.recentActivity.map((item) => `<a href="${escapeHtml(item.href)}"><span><strong>${escapeHtml(item.type)} · ${escapeHtml(item.label)}</strong><small>${escapeHtml(item.detail || "")}</small></span><small>${formatDate(item.at)}</small></a>`).join("") : '<p class="admin-empty">暂无近期活动。</p>';
    document.getElementById("dashboardPublished").innerHTML = data.recentPublished.length ? data.recentPublished.map((item) => `<a href="/admin/cases?case=${encodeURIComponent(item.id)}"><span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(categoryLabel(item.category))}</small></span><small>${formatDate(item.publishedAt)}</small></a>`).join("") : '<p class="admin-empty">暂无已发布作品。</p>';
    document.getElementById("dashboardMedia").innerHTML = data.recentMedia?.length ? data.recentMedia.map((item) => `<a href="/admin/media#media-${encodeURIComponent(item.id)}"><span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(categoryLabel(item.category))}</small></span><small>${formatDate(item.createdAt)}</small></a>`).join("") : '<p class="admin-empty">暂无媒体。</p>';
  } catch (error) { stats.innerHTML = `<p class="admin-empty">${escapeHtml(error.message)}</p>`; }
}

let submissions = [];
let currentSubmissionId = "";
let submissionFilter = "New";

async function loadSubmissions() {
  try {
    const data = await api("/api/admin?module=submissions");
    submissions = data.submissions;
    document.getElementById("submissionStorage").textContent = `私密客户文件：${formatBytes(data.storage?.privateCustomerFiles)} · 回收站：${formatBytes(data.storage?.trash)}`;
    renderSubmissions();
    const requested = new URLSearchParams(location.search).get("case");
    if (requested && submissions.some((item) => item.caseId === requested)) openSubmission(requested);
  } catch (error) { document.getElementById("submissionList").innerHTML = `<p class="admin-empty">${escapeHtml(error.message)}</p>`; }
}

function renderSubmissions() {
  const filtered = submissions.filter((item) => item.status === submissionFilter);
  document.getElementById("submissionList").innerHTML = filtered.length ? filtered.map((item) => `<button class="admin-record-button ${item.caseId === currentSubmissionId ? "active" : ""}" type="button" data-submission-id="${escapeHtml(item.caseId)}"><strong>${escapeHtml(item.caseId)}</strong><span>${escapeHtml(item.fields.name || "未填写姓名")} · ${escapeHtml(item.fields.company || "未填写公司")}</span><span class="admin-record-meta"><span>${formatDate(item.submittedAt)}</span><span class="admin-status-pill">${escapeHtml(statusLabel(item.status))} · ${item.fileCount} 个文件</span></span></button>`).join("") : '<p class="admin-empty">此状态下暂无提交记录。</p>';
}

document.getElementById("submissionTabs").addEventListener("click", (event) => {
  const button = event.target.closest("[data-submission-filter]");
  if (!button) return;
  submissionFilter = button.dataset.submissionFilter;
  document.querySelectorAll("[data-submission-filter]").forEach((item) => item.classList.toggle("active", item === button));
  renderSubmissions();
});
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
  detail.innerHTML = '<p class="admin-loading">正在加载...</p>';
  try {
    const { submission } = await api(`/api/admin?module=submissions&id=${encodeURIComponent(id)}`);
    const fields = submission.fields || {};
    const detailItems = [["客户姓名", fields.name], ["公司", fields.company], ["邮箱", fields.email], ["WhatsApp", fields.whatsapp], ["国家", fields.country], ["案例类型", fields.case_type], ["种植体品牌", fields.implant_brand], ["种植系统", fields.implant_system], ["平台", fields.platform], ["修复类型", fields.restoration_type], ["材料", fields.material], ["色号", fields.shade], ["数量", fields.quantity], ["要求日期", fields.due_date], ["提交时间", formatDate(submission.submittedAt)], ["附件总大小", formatBytes(submission.totalFileSize)]];
    const trashActions = submission.status === "Trash"
      ? `<button class="btn btn-secondary" type="button" data-submission-action="restore">恢复提交</button><button class="btn admin-danger" type="button" data-submission-action="permanent-delete">永久删除</button>`
      : `<button class="btn btn-secondary" type="button" data-submission-action="archive">归档</button><button class="btn admin-danger" type="button" data-submission-action="delete-files" ${submission.fileCount ? "" : "disabled"}>删除附件</button><button class="btn admin-danger" type="button" data-submission-action="trash">删除提交</button>`;
    const statusOptions = ["New", "Reviewing", "Quotation Sent", "Waiting for Confirmation", "In Progress", "QC", "Completed", "Closed", "Reviewed", "Archived"].map((status) => `<option value="${escapeHtml(status)}" ${submission.status === status ? "selected" : ""}>${escapeHtml(statusLabel(status))}</option>`).join("");
    detail.innerHTML = `<div class="admin-detail-head"><div><p class="eyebrow">客户提交</p><h2>${escapeHtml(submission.caseId)}</h2></div>${submission.status === "Trash" ? '<span class="admin-status-pill">回收站</span>' : `<select id="submissionStatus">${statusOptions}</select>`}</div>${submission.trashedAt ? `<p class="admin-trash-meta">删除时间：${formatDate(submission.trashedAt)} · 30 天后自动清理</p>` : ""}<dl class="admin-detail-grid">${detailItems.map(([label, value]) => `<div><dt>${label}</dt><dd>${escapeHtml(value || "-")}</dd></div>`).join("")}</dl><div class="admin-instructions"><strong>客户说明</strong><br>${escapeHtml(fields.instructions || "客户未填写说明。")}</div><h3>附件</h3><div class="admin-file-list">${submission.files.length ? submission.files.map((file) => `<div class="admin-file"><span><strong>${escapeHtml(file.originalName || file.filename)}</strong><br><small>${formatBytes(file.size)} · ${escapeHtml(file.contentType)}</small></span><a class="btn btn-secondary" href="${file.downloadUrl}">下载</a></div>`).join("") : '<p class="admin-empty">没有上传文件，或附件已永久删除。</p>'}</div><div class="admin-copy-actions"><button class="btn btn-secondary" type="button" data-copy-value="${escapeHtml(fields.email)}">复制邮箱</button><button class="btn btn-secondary" type="button" data-copy-value="${escapeHtml(fields.whatsapp)}">复制 WhatsApp</button></div><div class="admin-destructive-actions">${trashActions}</div><div class="admin-message" id="submissionMessage" role="status"></div>`;
    document.getElementById("submissionStatus")?.addEventListener("change", async (event) => {
      try {
        await api("/api/admin?module=submissions", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ caseId: id, status: event.target.value }) });
        const item = submissions.find((entry) => entry.caseId === id); if (item) item.status = event.target.value; renderSubmissions(); showMessage(document.getElementById("submissionMessage"), "状态已更新。", "success");
      } catch (error) { showMessage(document.getElementById("submissionMessage"), error.message, "error"); }
    });
    detail.querySelectorAll("[data-copy-value]").forEach((button) => button.addEventListener("click", async () => { await copyText(button.dataset.copyValue); showMessage(document.getElementById("submissionMessage"), "已复制。", "success"); }));
    detail.querySelectorAll("[data-submission-action]").forEach((button) => button.addEventListener("click", async () => {
      const action = button.dataset.submissionAction;
      const confirmations = {
        archive: `将 ${submission.caseId} 归档？附件会保留。`,
        "delete-files": `永久删除客户附件？\n\nCase ID：${submission.caseId}\n客户：${fields.name || fields.company || "未填写"}\n附件：${submission.fileCount} 个\n总大小：${formatBytes(submission.totalFileSize)}\n\n提交记录和客户说明会保留，此操作无法撤销。`,
        trash: `删除这条客户提交？\n\nCase ID：${submission.caseId}\n客户：${fields.name || fields.company || "未填写"}\n日期：${formatDate(submission.submittedAt)}\n附件：${submission.fileCount} 个（${formatBytes(submission.totalFileSize)}）\n\n提交将进入回收站，30 天内可以恢复。`,
        restore: `恢复客户提交 ${submission.caseId}？`,
        "permanent-delete": `永久删除这条客户提交？\n\nCase ID：${submission.caseId}\n附件：${submission.fileCount} 个（${formatBytes(submission.totalFileSize)}）\n\n记录和所有私密附件将永久删除，无法恢复。`
      };
      if (!confirm(confirmations[action])) return;
      const message = document.getElementById("submissionMessage");
      showMessage(message, "正在处理...");
      try {
        await api("/api/admin?module=submission-manage", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ caseId: id, action }) });
        if (action === "permanent-delete") { currentSubmissionId = ""; detail.innerHTML = '<p class="admin-empty">提交已永久删除。</p>'; }
        await loadSubmissions();
        if (action !== "permanent-delete") {
          submissionFilter = submissions.find((item) => item.caseId === id)?.status || submissionFilter;
          document.querySelectorAll("[data-submission-filter]").forEach((item) => item.classList.toggle("active", item.dataset.submissionFilter === submissionFilter));
          renderSubmissions();
          await openSubmission(id);
        }
      } catch (error) { showMessage(message, error.message, "error"); }
    }));
  } catch (error) { detail.innerHTML = `<p class="admin-empty">${escapeHtml(error.message)}</p>`; }
}

let mediaItems = [];
let mediaTypeFilter = "";
let mediaTrashView = false;
let mediaSort = "newest";
let mediaSearch = "";
let mediaTagFilter = "";
let mediaCollectionFilter = "";
const selectedMediaIds = new Set();
const VIDEO_ACCEPT = "video/*,.mp4,.mov,.m4v";
const processingLabels = { uploading: "正在上传", processing: "处理中", ready: "可使用", failed: "处理失败" };

function formatDuration(seconds) {
  if (!Number(seconds)) return "未知";
  const total = Math.round(Number(seconds));
  const minutes = Math.floor(total / 60);
  return `${minutes}:${String(total % 60).padStart(2, "0")}`;
}

function mediaFileDetails(item) {
  const status = item.mediaType === "video" ? ` · ${processingLabels[item.processingStatus] || "处理中"}` : "";
  const duration = item.mediaType === "video" ? ` · ${formatDuration(item.duration)}` : "";
  return `${escapeHtml(item.originalFilename || item.displayName)}<br><small>${escapeHtml(item.format || item.contentType)} · ${formatBytes(item.size)}${duration}${status}</small>`;
}

async function loadMedia() {
  try {
    const data = await api(`/api/admin?module=media${mediaTrashView ? "&view=trash" : ""}`);
    mediaItems = data.media;
    selectedMediaIds.clear();
    document.getElementById("mediaSelectAll").checked = false;
    document.getElementById("mediaStorage").textContent = `公开媒体：${formatBytes(data.storage?.publicMedia)} · 回收站：${formatBytes(data.storage?.trash)}`;
    renderMedia();
    const target = location.hash ? document.getElementById(decodeURIComponent(location.hash.slice(1))) : null;
    if (target) requestAnimationFrame(() => target.scrollIntoView({ block: "center" }));
  } catch (error) { document.getElementById("mediaList").innerHTML = `<p class="admin-empty">${escapeHtml(error.message)}</p>`; }
}

function mediaPreview(item, className = "") {
  if (item.mediaType === "video" && item.posterUrl) return `<img class="${className}" src="${item.posterUrl}" alt="${escapeHtml(item.displayName || "Video poster")}">`;
  if (item.mediaType === "video" && item.processingStatus !== "ready") return `<div class="admin-video-placeholder ${className}"><strong>${escapeHtml(item.format || "Video")}</strong><span>${escapeHtml(processingLabels[item.processingStatus] || "处理中")}</span></div>`;
  if (item.mediaType === "video") return `<video class="${className}" src="${item.url}" muted playsinline preload="metadata"></video>`;
  return `<img class="${className}" src="${item.url}" alt="${escapeHtml(item.altText || item.displayName)}">`;
}

function renderMedia() {
  const category = document.getElementById("mediaCategoryFilter").value;
  const needle = mediaSearch.trim().toLowerCase();
  const tagNeedle = mediaTagFilter.trim().toLowerCase();
  const collectionNeedle = mediaCollectionFilter.trim().toLowerCase();
  const filtered = mediaItems.filter((item) => {
    const haystack = [item.displayName, item.originalFilename, item.altText, item.category, item.collection, ...(Array.isArray(item.tags) ? item.tags : [])].join(" ").toLowerCase();
    const tags = (Array.isArray(item.tags) ? item.tags : []).join(" ").toLowerCase();
    const collection = String(item.collection || "").toLowerCase();
    return (!mediaTypeFilter || item.mediaType === mediaTypeFilter) && (!category || item.category === category) && (!needle || haystack.includes(needle)) && (!tagNeedle || tags.includes(tagNeedle)) && (!collectionNeedle || collection.includes(collectionNeedle));
  }).sort((a, b) => {
    if (mediaSort === "largest") return (Number(b.size) || 0) - (Number(a.size) || 0);
    if (mediaSort === "name") return String(a.displayName || a.originalFilename || "").localeCompare(String(b.displayName || b.originalFilename || ""), "zh-CN");
    return new Date(b.createdAt || b.uploadedAt || 0) - new Date(a.createdAt || a.uploadedAt || 0);
  });
  document.getElementById("mediaBulkActions").hidden = mediaTrashView;
  document.getElementById("showMediaUpload").hidden = mediaTrashView;
  document.getElementById("mediaUploadForm").hidden = mediaTrashView;
  document.getElementById("mediaSelectedCount").textContent = `已选择 ${selectedMediaIds.size} 项`;
  document.getElementById("mediaList").innerHTML = filtered.length ? filtered.map((item) => {
    const usedIn = item.usedIn || [];
    const usage = usedIn.length
      ? `<ul class="admin-used-in">${usedIn.map((place) => `<li><a href="${escapeHtml(place.editorUrl)}">${escapeHtml(place.label)}</a>${place.required ? "<small>需要替换</small>" : ""}</li>`).join("")}</ul>`
      : '<p class="admin-media-usage">当前未使用</p>';
    if (mediaTrashView) return `<article class="admin-media-item" id="media-${item.id}" data-media-id="${item.id}">${mediaPreview(item)}<div class="admin-media-fields"><p class="media-type-label">${mediaFileDetails(item)}</p><p class="admin-trash-meta">删除时间：${formatDate(item.trashedAt)}<br>原分类：${escapeHtml(categoryLabel(item.originalLocation || item.category))}<br>${item.originalUsage?.length ? `原使用位置：${item.originalUsage.map(escapeHtml).join("；")}<br>` : ""}30 天后自动清理</p><div class="admin-media-actions"><button class="btn btn-secondary" type="button" data-media-restore>恢复</button><button class="btn admin-danger" type="button" data-media-permanent>永久删除</button></div><div class="admin-message" role="status"></div></div></article>`;
    return `<article class="admin-media-item" id="media-${item.id}" data-media-id="${item.id}"><label class="admin-media-select"><input type="checkbox" data-media-select ${selectedMediaIds.has(item.id) ? "checked" : ""}> 选择</label>${mediaPreview(item)}<div class="admin-media-fields"><p class="media-type-label">${mediaFileDetails(item)}</p><label class="field">显示名称<input data-media-key="displayName" value="${escapeHtml(item.displayName)}"></label><label class="field">图片说明（ALT）<input data-media-key="altText" value="${escapeHtml(item.altText)}"></label><label class="field">分类<select data-media-key="category">${["Cases", "Homepage", "Implant", "Full-Arch", "Lab", "Products", "Other"].map((value) => `<option value="${value}" ${value === item.category ? "selected" : ""}>${categoryLabel(value)}</option>`).join("")}</select></label><label class="field">Collection<input data-media-key="collection" value="${escapeHtml(item.collection || "")}"></label><label class="field">Tags<input data-media-key="tags" value="${escapeHtml((item.tags || []).join(", "))}"></label>${item.mediaType === "video" ? `<label class="field">视频海报<select data-media-key="posterMediaId">${mediaOptions(item.posterMediaId, "image")}</select></label>${item.processingMessage ? `<p class="admin-helper">${escapeHtml(item.processingMessage)}</p>` : ""}` : ""}<div class="admin-media-usage"><strong>Used On</strong>${usage}</div><div class="admin-media-actions"><button class="btn btn-secondary" type="button" data-media-use ${item.mediaType === "video" && item.processingStatus !== "ready" ? "disabled" : ""}>使用到页面</button>${item.mediaType === "video" && item.processingStatus === "failed" ? '<button class="btn btn-secondary" type="button" data-media-retry>重试视频处理</button>' : ""}<button class="btn btn-secondary" type="button" data-media-replace>替换文件</button><button class="btn btn-secondary" type="button" data-media-save>保存信息</button><button class="btn admin-danger" type="button" data-media-delete>删除</button></div><input class="visually-hidden" type="file" data-media-replace-file accept="image/jpeg,image/png,image/webp,image/svg+xml,${VIDEO_ACCEPT}"><div class="media-use-menu" hidden><a href="/admin/website/home">网站首页</a><a href="/admin/website/implant">种植修复</a><a href="/admin/website/full-arch">全口修复</a><a href="/admin/website/about">关于我们</a></div><div class="admin-message" role="status"></div></div></article>`;
  }).join("") : `<p class="admin-empty">${mediaTrashView ? "回收站为空。" : "没有符合当前筛选条件的媒体。"}</p>`;
}

document.getElementById("mediaTypeTabs").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-type]");
  if (!button) return;
  mediaTypeFilter = button.dataset.type;
  document.querySelectorAll("#mediaTypeTabs button").forEach((item) => item.classList.toggle("active", item === button));
  renderMedia();
});
document.getElementById("mediaViewTabs").addEventListener("click", async (event) => {
  const button = event.target.closest("[data-media-view]");
  if (!button) return;
  mediaTrashView = button.dataset.mediaView === "trash";
  document.querySelectorAll("[data-media-view]").forEach((item) => item.classList.toggle("active", item === button));
  await loadMedia();
});
document.getElementById("mediaCategoryFilter").addEventListener("change", renderMedia);
document.getElementById("mediaSort").addEventListener("change", (event) => { mediaSort = event.target.value; renderMedia(); });
document.getElementById("mediaSearch").addEventListener("input", (event) => { mediaSearch = event.target.value; renderMedia(); });
document.getElementById("mediaTagFilter")?.addEventListener("input", (event) => { mediaTagFilter = event.target.value; renderMedia(); });
document.getElementById("mediaCollectionFilter")?.addEventListener("input", (event) => { mediaCollectionFilter = event.target.value; renderMedia(); });
document.getElementById("showMediaUpload").addEventListener("click", () => document.getElementById("mediaUploadForm").scrollIntoView({ behavior: "smooth", block: "start" }));
document.getElementById("mediaSelectAll").addEventListener("change", (event) => {
  const category = document.getElementById("mediaCategoryFilter").value;
  const visible = mediaItems.filter((item) => (!mediaTypeFilter || item.mediaType === mediaTypeFilter) && (!category || item.category === category));
  visible.forEach((item) => event.target.checked ? selectedMediaIds.add(item.id) : selectedMediaIds.delete(item.id));
  renderMedia();
});
document.getElementById("mediaBulkTrash").addEventListener("click", async () => {
  if (!selectedMediaIds.size) return alert("请先选择媒体。");
  if (!confirm(`将选中的 ${selectedMediaIds.size} 项媒体移入回收站？正在使用的媒体会先进入冲突检查。`)) return;
  try {
    const result = await api("/api/admin?module=media-manage", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "bulk-trash", ids: [...selectedMediaIds] }) });
    await loadMedia();
    if (result.conflicts.length) {
      alert(`${result.moved.length} 项已移入回收站。${result.conflicts.length} 项仍在使用，需要逐项选择替换或移除。`);
      const first = mediaItems.find((item) => item.id === result.conflicts[0].id);
      if (first) openMediaDeleteReview(first);
    }
  } catch (error) { alert(error.message); }
});

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function processVideoAndWait(media, onStatus, retry = false) {
  if (media.mediaType !== "video" || media.processingStatus === "ready") return media;
  onStatus?.("视频已上传，正在生成 H.264 网页播放版本和海报...");
  await api("/api/video-process", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: media.id, action: retry ? "retry" : "start" }) });
  for (let attempt = 0; attempt < 105; attempt += 1) {
    await delay(3000);
    const data = await api("/api/admin?module=media");
    const current = data.media.find((item) => item.id === media.id);
    if (!current) throw new Error("视频记录不存在，请刷新媒体库。");
    if (current.processingStatus === "ready") return current;
    if (current.processingStatus === "failed") throw new Error(current.processingMessage || "视频转换失败。原文件已安全保留，可在媒体库中重试或删除。");
    onStatus?.("正在处理视频，请保持此页面打开...");
  }
  throw new Error("视频已上传，但仍在准备网页播放版本。请稍后在媒体库查看状态。");
}

async function uploadMediaFile(file, metadata, onProgress, onStatus) {
  if (!window.yzhUploadMedia) throw new Error("媒体上传组件尚未就绪，请刷新页面后重试。");
  const inspection = await window.yzhInspectMedia(file);
  const uploadResult = await window.yzhUploadMedia(file, { ...metadata, originalFilename: file.name, size: file.size, ...inspection }, onProgress, inspection);
  const result = await api("/api/admin?module=media-finalize", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ blob: uploadResult.blob, metadata: { ...metadata, originalFilename: file.name, size: file.size, ...inspection } }) });
  return processVideoAndWait(result.media, onStatus);
}

const mediaUploadForm = document.getElementById("mediaUploadForm");
const mediaFileInput = mediaUploadForm.elements.file;
mediaFileInput.accept = `image/jpeg,image/png,image/webp,image/svg+xml,${VIDEO_ACCEPT}`;
mediaFileInput.multiple = true;
const mediaFileInfo = document.createElement("div");
mediaFileInfo.className = "admin-file-selection";
mediaFileInfo.innerHTML = "<strong>最大视频大小：100 MB</strong><span>支持 MP4、MOV、M4V，包括从 iPhone 照片中选择的视频。</span>";
mediaFileInput.closest("label").append(mediaFileInfo);
mediaFileInput.addEventListener("change", async () => {
  const files = [...(mediaFileInput.files || [])];
  if (!files.length) return;
  if (files.length > 60) {
    mediaFileInfo.innerHTML = `<strong>一次最多选择 60 个文件</strong><span class="error">请分批上传。</span>`;
    mediaFileInput.value = "";
    return;
  }
  if (files.length > 1) {
    mediaFileInfo.innerHTML = `<strong>${files.length} 个文件已选择</strong><span>图片和 H.264/AAC MP4 会逐个上传，每个文件独立显示结果。</span>`;
    return;
  }
  const file = files[0];
  mediaFileInfo.innerHTML = `<strong>${escapeHtml(file.name)}</strong><span>${formatBytes(file.size)} · 正在读取媒体信息...</span>`;
  try {
    const info = await window.yzhInspectMedia(file);
    mediaFileInfo.innerHTML = `<strong>${escapeHtml(file.name)}</strong><span>${formatBytes(file.size)}${info.mediaType === "video" ? ` · ${escapeHtml(info.format)} · ${formatDuration(info.duration)}` : ""}</span>`;
  } catch (error) {
    mediaFileInfo.innerHTML = `<strong>${escapeHtml(file.name)}</strong><span class="error">${escapeHtml(error.message)}</span>`;
  }
});

mediaUploadForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const files = [...(form.elements.file.files || [])];
  const message = document.getElementById("mediaMessage");
  const progress = document.getElementById("mediaUploadProgress");
  const queue = document.getElementById("mediaUploadQueue");
  if (!files.length) return showMessage(message, "请选择要上传的文件。", "error");
  queue.innerHTML = files.map((file, index) => `<div class="bulk-upload-row" data-upload-index="${index}"><span>${escapeHtml(file.name)}</span><strong>等待上传</strong></div>`).join("");
  showMessage(message, `正在上传 ${files.length} 个文件...`); progress.hidden = false;
  try {
    const failed = [];
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      const row = queue.querySelector(`[data-upload-index="${index}"] strong`);
      row.textContent = "上传中";
      try {
        const media = await uploadMediaFile(file, { category: form.elements.category.value, displayName: file.name.replace(/\.[^.]+$/, ""), altText: form.elements.altText.value, tags: form.elements.bulkTags.value, collection: form.elements.collection.value }, (percentage) => { progress.querySelector("span").style.width = `${Math.round(((index + percentage / 100) / files.length) * 100)}%`; row.textContent = `${percentage}%`; }, (status) => { row.textContent = status; });
        row.textContent = media.processingStatus === "ready" ? "成功" : "处理中";
        row.className = "success";
      } catch (error) {
        failed.push(file.name);
        row.textContent = error.message || "失败";
        row.className = "error";
      }
    }
    showMessage(message, failed.length ? `${files.length - failed.length} 个成功，${failed.length} 个失败，可重试失败文件。` : "批量上传完成，媒体已进入媒体库。", failed.length ? "error" : "success");
    form.reset(); progress.hidden = true; progress.querySelector("span").style.width = "0"; mediaFileInfo.innerHTML = "<strong>最大视频大小：100 MB</strong><span>支持 MP4、MOV、M4V，包括从 iPhone 照片中选择的视频。</span>"; await loadMedia();
  } catch (error) { progress.hidden = true; showMessage(message, error.message || "上传中断，请重试。", "error"); await loadMedia(); }
});

document.getElementById("mediaBulkTag").addEventListener("click", async () => {
  const tag = document.getElementById("mediaBulkTagValue").value.trim();
  const ids = [...selectedMediaIds];
  if (!ids.length) return showMessage(document.getElementById("mediaMessage"), "请先选择媒体。", "error");
  if (!tag) return showMessage(document.getElementById("mediaMessage"), "请先输入批量标签。", "error");
  try {
    await api("/api/admin?module=media-manage", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "bulk-tag", ids, tag }) });
    selectedMediaIds.clear();
    document.getElementById("mediaBulkTagValue").value = "";
    showMessage(document.getElementById("mediaMessage"), "批量标签已保存。", "success");
    await loadMedia();
  } catch (error) {
    showMessage(document.getElementById("mediaMessage"), error.message, "error");
  }
});

document.getElementById("mediaBulkRemoveTag")?.addEventListener("click", async () => {
  const tag = document.getElementById("mediaBulkTagValue").value.trim();
  const ids = [...selectedMediaIds];
  if (!ids.length) return showMessage(document.getElementById("mediaMessage"), "请先选择媒体。", "error");
  if (!tag) return showMessage(document.getElementById("mediaMessage"), "请输入要移除的标签。", "error");
  try {
    await api("/api/admin?module=media-manage", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "bulk-remove-tag", ids, tag }) });
    selectedMediaIds.clear();
    showMessage(document.getElementById("mediaMessage"), "批量标签已移除。", "success");
    await loadMedia();
  } catch (error) {
    showMessage(document.getElementById("mediaMessage"), error.message, "error");
  }
});

document.getElementById("mediaBulkCollection")?.addEventListener("click", async () => {
  const collection = document.getElementById("mediaBulkCollectionValue").value.trim();
  const ids = [...selectedMediaIds];
  if (!ids.length) return showMessage(document.getElementById("mediaMessage"), "请先选择媒体。", "error");
  if (!collection) return showMessage(document.getElementById("mediaMessage"), "请输入 Collection。", "error");
  try {
    await api("/api/admin?module=media-manage", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "bulk-collection", ids, collection }) });
    selectedMediaIds.clear();
    document.getElementById("mediaBulkCollectionValue").value = "";
    showMessage(document.getElementById("mediaMessage"), "批量 Collection 已保存。", "success");
    await loadMedia();
  } catch (error) {
    showMessage(document.getElementById("mediaMessage"), error.message, "error");
  }
});

document.getElementById("mediaRetryFailed").addEventListener("click", () => {
  showMessage(document.getElementById("mediaMessage"), "请选择失败文件重新上传。系统不会重复上传已经成功的文件。");
  mediaFileInput.click();
});

function closeAdminModal(modal) {
  modal?.remove();
}

function openMediaDeleteReview(item) {
  item.usedIn = item.usedIn || [];
  const required = item.usedIn.some((place) => place.required);
  const replacements = mediaItems.filter((candidate) => candidate.id !== item.id && !candidate.trashedAt && (candidate.mediaType !== "video" || candidate.processingStatus === "ready"));
  const modal = document.createElement("div");
  modal.className = "admin-modal-backdrop";
  modal.innerHTML = `<section class="admin-modal" role="dialog" aria-modal="true" aria-labelledby="mediaDeleteTitle"><h2 id="mediaDeleteTitle">处理正在使用的媒体</h2><p><strong>${escapeHtml(item.displayName || item.originalFilename)}</strong> 当前用于：</p><div class="admin-conflict-list">${item.usedIn.map((place) => `<label><input type="checkbox" data-usage-id="${escapeHtml(place.id)}" checked> <span><a href="${escapeHtml(place.editorUrl)}">${escapeHtml(place.label)}</a>${place.required ? "<small>该已上线位置没有备用图，必须替换。</small>" : ""}</span></label>`).join("")}</div><label class="field">替换为<select id="replacementMedia"><option value="">请选择另一项媒体</option>${replacements.map((candidate) => `<option value="${candidate.id}">${escapeHtml(candidate.displayName || candidate.originalFilename)} · ${candidate.mediaType === "video" ? "视频" : "图片"}</option>`).join("")}</select></label>${required ? '<p class="admin-warning">至少有一个已上线位置没有备用图，不能直接移除，必须选择替换媒体。</p>' : ""}<div class="admin-modal-actions"><button class="btn btn-primary" type="button" data-delete-mode="replace-delete">替换并删除</button><button class="btn admin-danger" type="button" data-delete-mode="remove-delete" ${required ? "disabled" : ""}>从页面移除并删除</button><button class="btn btn-secondary" type="button" data-delete-cancel>取消</button></div><div class="admin-message" role="status"></div></section>`;
  document.body.append(modal);
  modal.querySelector("[data-delete-cancel]").addEventListener("click", () => closeAdminModal(modal));
  modal.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-delete-mode]");
    if (!button) return;
    const usageIds = [...modal.querySelectorAll("[data-usage-id]:checked")].map((input) => input.dataset.usageId);
    const action = button.dataset.deleteMode;
    const replacementId = modal.querySelector("#replacementMedia").value;
    const message = modal.querySelector(".admin-message");
    if (usageIds.length !== item.usedIn.length) return showMessage(message, "要将旧媒体移入回收站，必须处理全部使用位置。", "error");
    if (action === "replace-delete" && !replacementId) return showMessage(message, "请选择替换媒体。", "error");
    if (!confirm(action === "replace-delete" ? "确认替换全部列出的使用位置，并把旧媒体移入回收站？" : "确认从全部列出的位置移除媒体，并把旧媒体移入回收站？")) return;
    showMessage(message, "正在更新引用...");
    try {
      await api("/api/admin?module=media-manage", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, id: item.id, replacementId, usageIds }) });
      closeAdminModal(modal);
      await loadMedia();
    } catch (error) { showMessage(message, error.message, "error"); }
  });
}

document.getElementById("mediaList").addEventListener("click", async (event) => {
  const card = event.target.closest("[data-media-id]"); if (!card) return;
  const item = mediaItems.find((entry) => entry.id === card.dataset.mediaId);
  const message = card.querySelector(".admin-message");
  try {
    if (event.target.closest("[data-media-select]")) {
      event.target.checked ? selectedMediaIds.add(card.dataset.mediaId) : selectedMediaIds.delete(card.dataset.mediaId);
      document.getElementById("mediaSelectedCount").textContent = `已选择 ${selectedMediaIds.size} 项`;
      return;
    }
    if (event.target.closest("[data-media-use]")) card.querySelector(".media-use-menu").hidden = !card.querySelector(".media-use-menu").hidden;
    if (event.target.closest("[data-media-retry]")) {
      showMessage(message, "正在重新处理视频...");
      await processVideoAndWait(item, (status) => showMessage(message, status), true);
      showMessage(message, "视频处理完成，可以用于网站。", "success");
      await loadMedia();
      return;
    }
    if (event.target.closest("[data-media-replace]")) card.querySelector("[data-media-replace-file]").click();
    if (event.target.closest("[data-media-save]")) {
      const body = { id: card.dataset.mediaId };
      card.querySelectorAll("[data-media-key]").forEach((field) => { body[field.dataset.mediaKey] = field.value; });
      await api("/api/admin?module=media", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      showMessage(message, "名称和图片说明已保存。", "success"); await loadMedia();
    }
    if (event.target.closest("[data-media-delete]")) {
      if ((item.usedIn || []).length) return openMediaDeleteReview(item);
      if (!confirm("将这项媒体移入回收站？30 天内可以恢复。")) return;
      try {
        await api("/api/admin?module=media-manage", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "trash", id: card.dataset.mediaId }) });
      } catch (error) {
        if (error.status === 409 && error.data?.usedIn?.length) return openMediaDeleteReview({ ...item, usedIn: error.data.usedIn });
        throw error;
      }
      await loadMedia();
    }
    if (event.target.closest("[data-media-restore]")) {
      if (!confirm("恢复这项媒体到媒体库？")) return;
      await api("/api/admin?module=media-manage", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "restore", id: card.dataset.mediaId }) });
      await loadMedia();
    }
    if (event.target.closest("[data-media-permanent]")) {
      if (!confirm(`永久删除 ${item.originalFilename || item.displayName}？文件和媒体记录将被删除，无法恢复。`)) return;
      await api("/api/admin?module=media-manage", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "permanent-delete", id: card.dataset.mediaId }) });
      await loadMedia();
    }
  } catch (error) { showMessage(message, error.message, "error"); }
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
  home: { title: "网站首页", intro: "从上到下编辑网站首页内容。", publicPath: "/", category: "Homepage" },
  implant: { title: "种植修复", intro: "为每个位置选择真实、有说服力的种植作品。", publicPath: "/implant-restorations", category: "Implant" },
  fullArch: { title: "全口修复 / All-on-X", intro: "管理全口案例、修复方案、支架和工作流程媒体。", publicPath: "/full-arch-all-on-x", category: "Full-Arch" },
  about: { title: "关于我们 / 实验室", intro: "这里只使用真实的实验室、技师、设备和质检媒体。", publicPath: "/about", category: "Lab" },
  submitCase: { title: "提交病例页面", intro: "当前提交表单由安全接口管理，公开联系方式在 Settings 中统一维护。", publicPath: "/submit-case", category: "Other", readonly: true }
};

const PAGE_SECTIONS = {
  home: [
    { key: "hero", label: "01 首屏主视觉", hint: "建议使用最有说服力的真实全口修复成品。", media: true, video: true, eyebrow: true, cta: true, secondaryCta: true, ratio: "16:9", mobileRatio: "4:5" },
    { key: "capabilities", label: "02 核心能力导航", hint: "客户可以点击整块能力卡进入对应页面或技术区段。", capabilityLinks: true },
    { key: "selectedWork", label: "03 精选作品", hint: "选择 6-9 个已发布案例，客户点击图片可进入案例详情。", selectedCases: true, eyebrow: true },
    { key: "technicalProof", label: "04 技术证明", hint: "建议使用真实 CAD、支架、模型就位或质检照片。", media: true, video: true, eyebrow: true, technicalTopics: true, ratio: "16:9", mobileRatio: "16:9" },
    { key: "workflow", label: "05 工作流程", hint: "可分别为文件、CAD / 设计、生产和质检添加图片与链接目标。", workflow: true, eyebrow: true },
    { key: "finalCta", label: "06 最终行动区", hint: "使用相关背景图或短 MP4 视频。", media: true, video: true, eyebrow: true, cta: true, ratio: "16:9", mobileRatio: "16:9" }
  ],
  implant: [
    { key: "hero", label: "01 首屏主视觉", hint: "建议使用最强的螺丝固位种植桥或种植修复作品。", media: true, eyebrow: true, cta: true, ratio: "16:9", mobileRatio: "4:5" },
    { key: "featuredWork", label: "02 精选种植作品", hint: "从真实的已发布案例中选择。", featuredCase: true },
    { key: "customAbutments", label: "03 个性化基台", hint: "建议使用真实个性化基台 / 牙冠组合照片。", media: true, linkable: true, ratio: "4:3", mobileRatio: "4:3" },
    { key: "implantBridge", label: "04 螺丝固位 / 种植桥", hint: "建议使用真实螺丝固位桥、接口或组装照片。", media: true, linkable: true, ratio: "4:3", mobileRatio: "4:3" },
    { key: "qc", label: "05 质量检查", hint: "建议使用接口、模型就位、螺丝通道或检查照片。", media: true, linkable: true, ratio: "4:3", mobileRatio: "4:3" },
    { key: "cta", label: "06 行动按钮", hint: "最终按钮跳转到提交案例页面。", media: true, eyebrow: true, cta: true, ratio: "16:9", mobileRatio: "16:9" }
  ],
  fullArch: [
    { key: "hero", label: "01 首屏主视觉", hint: "建议使用最强的真实全口最终修复成品。", media: true, video: true, eyebrow: true, cta: true, ratio: "16:9", mobileRatio: "4:5" },
    { key: "featuredCase", label: "02 精选全口案例", hint: "从已发布的重点案例研究中选择。", featuredCase: true, caseStudyOnly: true },
    { key: "restorationOptions", label: "03 修复方案", hint: "PMMA、整块氧化锆及钛杆氧化锆方案。", restorationOptions: true },
    { key: "framework", label: "04 钛支架 / 钛杆", hint: "建议使用真实钛杆、支架照片或加工视频。", media: true, video: true, linkable: true, ratio: "16:9", mobileRatio: "16:9" },
    { key: "workflow", label: "05 工作流程", hint: "使用真实全口制作流程图片或短 MP4。", media: true, video: true, linkable: true, ratio: "4:3", mobileRatio: "4:3" },
    { key: "qc", label: "06 质量检查", hint: "建议展示接口、适合度、模型就位或最终检查。", media: true, linkable: true, ratio: "4:3", mobileRatio: "4:3" },
    { key: "cta", label: "07 行动按钮", hint: "最终按钮跳转到提交案例页面。", media: true, eyebrow: true, cta: true, ratio: "16:9", mobileRatio: "16:9" }
  ],
  about: [
    { key: "hero", label: "01 首屏主视觉", hint: "使用真实实验室或 CAD 工作站媒体。", media: true, video: true, eyebrow: true, cta: true, ratio: "16:9", mobileRatio: "4:5" },
    { key: "laboratoryGallery", label: "02 Laboratory Gallery", hint: "批量管理真实实验室照片和视频。支持 100+ 项、拖拽排序、封面、精选、隐藏。", collection: true, uploadCategory: "Lab", ratio: "4:3", mobileRatio: "4:3", allowVideo: true },
    { key: "equipmentGallery", label: "03 Equipment Gallery", hint: "批量管理设备、工作站、生产线、质检区域媒体。", collection: true, uploadCategory: "Lab", ratio: "4:3", mobileRatio: "4:3", allowVideo: true },
    { key: "workflowSteps", label: "04 Workflow Steps", hint: "动态增加流程步骤，不再固定四步。每一步都可配图、视频、标题、说明和链接。", collection: true, uploadCategory: "Lab", ratio: "4:3", mobileRatio: "4:3", allowVideo: true, destination: true },
    { key: "qualityCollection", label: "05 Quality Control Collection", hint: "质检证明集合，可持续新增接口、模型就位、咬合、接触点、出货检查。", collection: true, uploadCategory: "Lab", ratio: "4:3", mobileRatio: "4:3", allowVideo: true },
    { key: "laboratory", label: "Legacy: 单张实验室图", hint: "旧版兼容字段。V3 请优先使用上面的 Laboratory Gallery。", media: true, video: true, ratio: "4:3", mobileRatio: "4:3" },
    { key: "cad", label: "Legacy: 单张 CAD 图", hint: "旧版兼容字段。后续会被动态 Gallery 替代。", media: true, video: true, ratio: "4:3", mobileRatio: "4:3" },
    { key: "production", label: "Legacy: 单张生产图", hint: "旧版兼容字段。后续会被动态 Gallery 替代。", media: true, video: true, ratio: "4:3", mobileRatio: "4:3" },
    { key: "finishing", label: "Legacy: 单张修整图", hint: "旧版兼容字段。后续会被动态 Gallery 替代。", media: true, video: true, ratio: "4:3", mobileRatio: "4:3" },
    { key: "qc", label: "Legacy: 单张质检图", hint: "旧版兼容字段。后续会被动态 Collection 替代。", media: true, video: true, ratio: "4:3", mobileRatio: "4:3" },
    { key: "packing", label: "Legacy: 单张包装 / 发货图", hint: "旧版兼容字段；没有真实媒体时请留空。", media: true, video: true, ratio: "4:3", mobileRatio: "4:3" }
  ],
  submitCase: [
    { key: "submitCaseStatus", label: "Submit Case Status", hint: "提交病例页面已连接客户提交、私密附件、邮件通知和后台 Submissions。", readonly: true }
  ]
};

let pageKey = "";
let pageData;

function mediaOptions(selected, type = "") {
  const items = mediaItems.filter((item) => (!type || item.mediaType === type) && (item.mediaType !== "video" || item.processingStatus === "ready"));
  return `<option value="">使用页面当前媒体</option>${items.map((item) => `<option value="${item.id}" ${item.id === selected ? "selected" : ""}>${escapeHtml(item.displayName || item.originalFilename)} · ${escapeHtml(categoryLabel(item.category))} · ${item.mediaType === "video" ? "视频" : "图片"}</option>`).join("")}`;
}

function caseOptions(selected, caseStudyOnly = false) {
  const cases = (pageData?.publishedCases || []).filter((item) => !caseStudyOnly || item.contentType === "case_study");
  return `<option value="">不选择案例</option>${cases.map((item) => `<option value="${item.id}" ${item.id === selected ? "selected" : ""}>${escapeHtml(item.title)} · ${escapeHtml(categoryLabel(item.category))}</option>`).join("")}`;
}

function linkDestinationOptions(selected = "") {
  const option = (value, label) => `<option value="${escapeHtml(value)}" ${value === selected ? "selected" : ""}>${escapeHtml(label)}</option>`;
  const cases = (pageData?.publishedCases || []).map((item) => option(`/cases/${item.slug}`, item.title)).join("");
  return `${option("", "不设置链接")}
    <optgroup label="页面">
      ${option("/", "首页")}${option("/implant-restorations", "种植修复")}${option("/full-arch-all-on-x", "全口修复 / All-on-X")}${option("/cases", "案例库")}${option("/digital-dentistry", "数字化工作流程")}${option("/crown-bridge", "牙冠与牙桥")}${option("/surgical-guides", "种植导板")}${option("/about", "关于我们")}
    </optgroup>
    <optgroup label="页面区段">
      ${option("/#technical-review", "首页：技术审核")}${option("/#workflow", "首页：工作流程")}${option("/implant-restorations#implant-case-information", "种植页：案例资料要求")}${option("/implant-restorations#implant-quality-control", "种植页：适合度与质检")}${option("/about#production", "关于我们：生产")}
    </optgroup>
    <optgroup label="提交病例">${option("/submit-case", "提交病例")}</optgroup>
    ${cases ? `<optgroup label="已发布案例">${cases}</optgroup>` : ""}
    <optgroup label="外部链接">${option("https://wa.me/8613714730109", "WhatsApp 技术团队")}</optgroup>`;
}

function linkDestinationEditor(path, value) {
  return `<label class="field">链接目标<select data-path="${path}">${linkDestinationOptions(value || "")}</select></label>`;
}

function capabilityLinksEditor(value) {
  return `<div class="workflow-media-grid">${(value || []).map((item, index) => `<div><label class="field">能力名称<input data-path="capabilities.${index}.label" maxlength="80" value="${escapeHtml(item.label)}"></label>${linkDestinationEditor(`capabilities.${index}.destination`, item.destination)}</div>`).join("")}</div>`;
}

function technicalTopicsEditor(value) {
  return `<div class="workflow-media-grid">${(value.items || []).map((item, index) => `<div><label class="field">技术主题<input data-path="technicalProof.items.${index}.label" maxlength="100" value="${escapeHtml(item.label)}"></label>${linkDestinationEditor(`technicalProof.items.${index}.destination`, item.destination)}</div>`).join("")}</div>`;
}

function currentMedia(slot) {
  return mediaItems.find((item) => item.id === slot?.mediaId);
}

function focusPosition(value) {
  return { center: "center center", top: "center top", bottom: "center bottom", left: "left center", right: "right center" }[value] || "center center";
}

function editorMediaPreview(slot) {
  const item = currentMedia(slot);
  if (item) return mediaPreview(item, "editor-media-preview");
  if (slot?.fallbackPath) return `<img class="editor-media-preview" src="${escapeHtml(slot.fallbackPath)}" alt="${escapeHtml(slot.altText || "页面当前媒体")}">`;
  return '<div class="editor-media-empty">尚未选择公开媒体</div>';
}

function ratioLabel(width, height) {
  width = Number(width) || 0; height = Number(height) || 0;
  if (!width || !height) return "读取中";
  const common = [[16, 9], [4, 3], [3, 4], [4, 5], [1, 1], [9, 16]];
  const match = common.find(([w, h]) => Math.abs(width / height - w / h) < 0.025);
  if (match) return `${match[0]}:${match[1]}`;
  return width >= height ? `${(width / height).toFixed(2)}:1` : `1:${(height / width).toFixed(2)}`;
}

function previewFrame(slot, ratio, mode) {
  const fit = slot?.fit === "contain" ? "contain" : "cover";
  const position = focusPosition(slot?.focalPosition);
  return `<div class="media-device-preview"><span>${mode}</span><div class="media-position-preview ${mode === "手机" ? "mobile" : "desktop"}" style="--preview-ratio:${escapeHtml(ratio.replace(":", " / "))};--media-fit:${fit};--media-position:${position}">${editorMediaPreview(slot)}</div></div>`;
}

function renderMediaEditor(path, slot, allowVideo, hint, rules = {}) {
  const isVideo = slot?.mediaType === "video" || currentMedia(slot)?.mediaType === "video";
  const item = currentMedia(slot);
  const desktopRatio = rules.ratio || "4:3";
  const mobileRatio = rules.mobileRatio || desktopRatio;
  const fileRatio = ratioLabel(item?.width, item?.height);
  const fit = slot?.fit === "contain" ? "contain" : "cover";
  const focal = ["center", "top", "bottom", "left", "right"].includes(slot?.focalPosition) ? slot.focalPosition : "center";
  return `<div class="media-position" data-media-position="${path}"><div class="media-preview-pair">${previewFrame(slot, desktopRatio, "桌面")}${previewFrame(slot, mobileRatio, "手机")}</div><div class="media-position-controls"><p class="admin-helper">${escapeHtml(hint)}</p><div class="media-ratio-summary"><span>推荐比例：<strong>${escapeHtml(desktopRatio)}</strong></span><span>当前文件比例：<strong data-current-ratio>${escapeHtml(fileRatio)}</strong></span><small>比例不同也可以使用，不会拉伸图片或视频。</small></div><label class="field">从媒体库选择<select data-path="${path}.mediaId">${mediaOptions(slot?.mediaId)}</select></label><div class="form-grid media-fit-controls"><label class="field">适配方式（Fit）<select data-path="${path}.fit"><option value="cover" ${fit === "cover" ? "selected" : ""}>Cover / 填满槽位</option><option value="contain" ${fit === "contain" ? "selected" : ""}>Contain / 显示完整内容</option></select></label><label class="field">焦点位置（Focus）<select data-path="${path}.focalPosition"><option value="center" ${focal === "center" ? "selected" : ""}>Center / 居中</option><option value="top" ${focal === "top" ? "selected" : ""}>Top / 顶部</option><option value="bottom" ${focal === "bottom" ? "selected" : ""}>Bottom / 底部</option><option value="left" ${focal === "left" ? "selected" : ""}>Left / 左侧</option><option value="right" ${focal === "right" ? "selected" : ""}>Right / 右侧</option></select></label></div><div class="media-action-row"><button class="btn btn-secondary" type="button" data-choose-upload="image" data-media-path="${path}">替换图片</button>${allowVideo ? `<button class="btn btn-secondary" type="button" data-choose-upload="video" data-media-path="${path}">上传视频</button>` : ""}<a class="btn btn-secondary" href="/admin/media">打开媒体库</a></div><input class="visually-hidden" type="file" data-media-upload="${path}" accept="image/jpeg,image/png,image/webp,${VIDEO_ACCEPT}"><div class="video-options" ${isVideo ? "" : "hidden"}><label class="field">视频封面图<select data-path="${path}.posterMediaId">${mediaOptions(slot?.posterMediaId, "image")}</select></label><label class="check-field"><input type="checkbox" data-path="${path}.autoplay" ${slot?.autoplay ? "checked" : ""}> 自动播放</label><label class="check-field"><input type="checkbox" data-path="${path}.muted" checked disabled> 静音</label><label class="check-field"><input type="checkbox" data-path="${path}.loop" ${slot?.loop ? "checked" : ""}> 循环播放</label></div></div></div>`;
}

function textFields(path, value, section) {
  return `${section.eyebrow ? `<label class="field">顶部小标题（Eyebrow）<input data-path="${path}.eyebrow" maxlength="160" value="${escapeHtml(value.eyebrow)}"></label>` : ""}<label class="field">主标题<input data-path="${path}.heading" maxlength="200" value="${escapeHtml(value.heading)}"></label><label class="field">正文<textarea data-path="${path}.description" maxlength="800">${escapeHtml(value.description)}</textarea></label>${section.cta ? `<div class="form-grid"><label class="field">按钮文字<input data-path="${path}.primaryLabel" maxlength="80" value="${escapeHtml(value.primaryLabel)}"></label><label class="field">按钮跳转位置<select data-path="${path}.primaryDestination"><option value="/submit-case" ${value.primaryDestination === "/submit-case" ? "selected" : ""}>提交案例</option><option value="/cases" ${value.primaryDestination === "/cases" ? "selected" : ""}>案例库</option></select></label></div>` : ""}${section.secondaryCta ? `<div class="form-grid"><label class="field">第二按钮文字<input data-path="${path}.secondaryLabel" maxlength="80" value="${escapeHtml(value.secondaryLabel)}"></label><label class="field">第二按钮跳转位置<select data-path="${path}.secondaryDestination"><option value="https://wa.me/8613714730109">WhatsApp 技术团队</option><option value="/cases" ${value.secondaryDestination === "/cases" ? "selected" : ""}>案例库</option></select></label></div>` : ""}`;
}

function selectedWorkEditor(value) {
  const ids = [...(value.caseIds || [])]; while (ids.length < 9) ids.push("");
  return `<div class="selected-work-editor">${ids.map((id, index) => { const item = pageData.publishedCases.find((entry) => entry.id === id); return `<div class="selected-work-slot" data-case-index="${index}">${item?.coverImage ? `<img src="${item.coverImage.url}" alt="${escapeHtml(item.title)}">` : '<div class="case-slot-empty">空位置</div>'}<label class="field">位置 ${index + 1}<select data-case-slot="${index}">${caseOptions(id)}</select></label><div class="slot-actions"><button type="button" class="btn btn-secondary" data-case-move="up" ${index === 0 ? "disabled" : ""}>上移</button><button type="button" class="btn btn-secondary" data-case-move="down" ${index === 8 ? "disabled" : ""}>下移</button></div></div>`; }).join("")}</div>`;
}

function workflowEditor(value, section) {
  return `${textFields("workflow", value, section)}<div class="workflow-media-grid">${(value.items || []).map((item, index) => `<div><label class="field">流程阶段<input data-path="workflow.items.${index}.label" value="${escapeHtml(item.label)}"></label>${linkDestinationEditor(`workflow.items.${index}.destination`, item.destination)}${renderMediaEditor(`workflow.items.${index}.media`, item.media, false, `${item.label} 阶段可选图片。`, { ratio: "4:3", mobileRatio: "4:3" })}</div>`).join("")}</div>`;
}

function restorationOptionsEditor(value) {
  return `<div class="restoration-option-editor">${value.map((option, index) => `<div class="restoration-option"><h3>方案 ${index + 1}</h3>${textFields(`restorationOptions.${index}`, option, {})}${renderMediaEditor(`restorationOptions.${index}.media`, option.media, false, "使用真实修复体图片。", { ratio: "4:3", mobileRatio: "4:3" })}<label class="field">链接目标：已发布案例（可选）<select data-path="restorationOptions.${index}.caseId">${caseOptions(option.caseId)}</select></label></div>`).join("")}</div>`;
}

function collectionEditor(key, value = [], section = {}) {
  const items = Array.isArray(value) ? value : [];
  return `<div class="collection-editor" data-collection="${key}">
    <div class="collection-toolbar">
      <button class="btn btn-primary" type="button" data-collection-add="${key}">新增项目</button>
      <button class="btn btn-secondary" type="button" data-collection-batch="${key}">批量上传</button>
      <button class="btn btn-secondary" type="button" data-collection-choose="${key}">从素材库选择</button>
      <input class="visually-hidden" type="file" data-collection-files="${key}" accept="image/jpeg,image/png,image/webp,${section.allowVideo ? VIDEO_ACCEPT : ""}" multiple>
      <span>${items.length} 个项目</span>
    </div>
    <div class="collection-list" data-collection-list="${key}">
      ${items.map((item, index) => collectionItemEditor(key, item, index, section)).join("")}
    </div>
  </div>`;
}

function collectionItemEditor(key, item, index, section) {
  const base = `${key}.${index}`;
  return `<article class="collection-item" draggable="true" data-collection-item="${key}" data-index="${index}">
    <div class="collection-item-head">
      <span class="drag-handle" aria-hidden="true">拖拽</span>
      <strong>${escapeHtml(item.title || `项目 ${index + 1}`)}</strong>
      <div class="collection-actions">
        <button class="btn btn-secondary" type="button" data-collection-move="up" data-collection-key="${key}" ${index === 0 ? "disabled" : ""}>上移</button>
        <button class="btn btn-secondary" type="button" data-collection-move="down" data-collection-key="${key}">下移</button>
        <button class="btn admin-danger" type="button" data-collection-remove="${key}">删除</button>
      </div>
    </div>
    <div class="collection-grid">
      ${renderMediaEditor(`${base}.media`, item.media, section.allowVideo, "选择或上传这个项目的图片/视频。", section)}
      <div>
        <label class="field">标题<input data-path="${base}.title" value="${escapeHtml(item.title || "")}" maxlength="160"></label>
        <label class="field">说明<textarea data-path="${base}.description" maxlength="800">${escapeHtml(item.description || "")}</textarea></label>
        <label class="field">图片说明<input data-path="${base}.caption" value="${escapeHtml(item.caption || "")}" maxlength="240"></label>
        <label class="field">Alt Text<input data-path="${base}.altText" value="${escapeHtml(item.altText || "")}" maxlength="240"></label>
        ${section.destination ? linkDestinationEditor(`${base}.destination`, item.destination) : ""}
        <div class="collection-flags">
          <label class="check-field"><input type="checkbox" data-path="${base}.featured" ${item.featured ? "checked" : ""}> 精选</label>
          <label class="check-field"><input type="checkbox" data-path="${base}.cover" ${item.cover ? "checked" : ""}> 封面</label>
          <label class="check-field"><input type="checkbox" data-path="${base}.hidden" ${item.hidden ? "checked" : ""}> 隐藏</label>
        </div>
      </div>
    </div>
  </article>`;
}

function renderPageEditor() {
  if (PAGE_META[pageKey]?.readonly) {
    document.getElementById("pageSections").innerHTML = `<section class="page-section-editor"><div class="page-section-heading"><span>信息</span><div><h2>Submit Case 表单已启用</h2><p>此页面的表单流程由 Submit Case 系统统一管理。联系信息、Logo 和社交链接请在网站设置修改；客户提交记录请在病例提交查看。</p></div></div><div class="admin-quick-actions"><a class="btn btn-primary" href="/submit-case" target="_blank" rel="noopener">打开公开提交页</a><a class="btn btn-secondary" href="/admin/settings">编辑联系信息</a><a class="btn btn-secondary" href="/admin/submissions">查看客户提交</a></div></section>`;
    return;
  }
  const draft = pageData.config.draft;
  const sections = PAGE_SECTIONS[pageKey];
  document.getElementById("pageSections").innerHTML = sections.map((section) => {
    const value = draft[section.key];
    let content = "";
    if (section.capabilityLinks) content = capabilityLinksEditor(value);
    else if (section.selectedCases) content = `${textFields(section.key, value, section)}${selectedWorkEditor(value)}`;
    else if (section.workflow) content = workflowEditor(value, section);
    else if (section.restorationOptions) content = restorationOptionsEditor(value);
    else if (section.collection) content = collectionEditor(section.key, value, section);
    else if (section.featuredCase) content = `${textFields(section.key, value, section)}<label class="field">选择精选案例<select data-path="${section.key}.caseId">${caseOptions(value.caseId, section.caseStudyOnly)}</select></label>`;
    else content = `${textFields(section.key, value, section)}${section.technicalTopics ? technicalTopicsEditor(value) : ""}${section.linkable ? linkDestinationEditor(`${section.key}.destination`, value.destination) : ""}${section.media ? renderMediaEditor(`${section.key}.media`, value.media, section.video, section.hint, section) : ""}`;
    return `<section class="page-section-editor" id="${escapeHtml(section.key)}"><div class="page-section-heading"><span>${escapeHtml(section.label.split(" ")[0])}</span><div><h2>${escapeHtml(section.label.replace(/^\d+\s/, ""))}</h2><p>${escapeHtml(section.hint)}</p></div></div>${content}</section>`;
  }).join("");
  document.querySelectorAll(".media-position").forEach((position) => {
    const output = position.querySelector("[data-current-ratio]");
    const media = position.querySelector("img,video");
    if (!output || !media) return;
    const update = () => {
      const width = media.videoWidth || media.naturalWidth;
      const height = media.videoHeight || media.naturalHeight;
      if (width && height) output.textContent = ratioLabel(width, height);
    };
    update();
    media.addEventListener(media.tagName === "VIDEO" ? "loadedmetadata" : "load", update, { once: true });
  });
  const target = location.hash ? document.getElementById(decodeURIComponent(location.hash.slice(1))) : null;
  if (target) requestAnimationFrame(() => target.scrollIntoView({ block: "start" }));
}

function collectPageDraft() {
  const draft = structuredClone(pageData.config.draft);
  document.querySelectorAll("#pageSections [data-path]").forEach((field) => {
    let value = field.type === "checkbox" ? field.checked : field.value;
    setPath(draft, field.dataset.path, value);
  });
  document.querySelectorAll("[data-collection]").forEach((collection) => {
    const key = collection.dataset.collection;
    const items = [...collection.querySelectorAll(`[data-collection-item="${key}"]`)].map((node, index) => {
      const previous = draft[key]?.[Number(node.dataset.index)] || {};
      return { ...previous, sortOrder: index };
    });
    draft[key] = items;
  });
  if (pageKey === "home") {
    const ids = [...document.querySelectorAll("[data-case-slot]")].sort((a, b) => Number(a.dataset.caseSlot) - Number(b.dataset.caseSlot)).map((field) => field.value).filter(Boolean);
    if (new Set(ids).size !== ids.length) throw new Error("每个精选作品位置必须选择不同的案例。");
    draft.selectedWork.caseIds = ids;
  }
  return draft;
}

function makeCollectionItem(title = "新项目", media = null) {
  return {
    id: `ITEM-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(16).slice(2, 8).toUpperCase()}`,
    title,
    description: "",
    caption: "",
    altText: "",
    featured: false,
    cover: false,
    hidden: false,
    sortOrder: 0,
    destination: "",
    media: {
      mediaId: media?.id || "",
      mediaType: media?.mediaType || "image",
      fallbackPath: "",
      altText: "",
      posterMediaId: "",
      fit: "cover",
      focalPosition: "center",
      autoplay: true,
      muted: true,
      loop: true
    }
  };
}

function moveCollectionItem(key, from, to) {
  pageData.config.draft = collectPageDraft();
  const items = Array.isArray(pageData.config.draft[key]) ? pageData.config.draft[key] : [];
  if (to < 0 || to >= items.length || from === to) return;
  const [item] = items.splice(from, 1);
  items.splice(to, 0, item);
  items.forEach((entry, index) => { entry.sortOrder = index; });
  pageData.config.draft[key] = items;
  renderPageEditor();
}

async function loadPageEditor(key) {
  pageKey = key;
  const meta = PAGE_META[key];
  document.getElementById("pageEditorTitle").textContent = meta.title;
  document.getElementById("pageEditorIntro").textContent = meta.intro;
  document.title = `${meta.title} | YZH 网站管理后台`;
  document.querySelector("#pageEditorForm button[type='submit']").disabled = false;
  document.getElementById("previewPage").disabled = false;
  document.getElementById("publishPage").disabled = false;
  document.getElementById("previewPage").onclick = null;
  if (meta.readonly) {
    document.getElementById("pageLiveState").textContent = "LIVE / 系统页面";
    document.getElementById("pageDraftState").textContent = "DRAFT / 不适用";
    document.querySelector("#pageEditorForm button[type='submit']").disabled = true;
    document.getElementById("restorePage").disabled = true;
    document.getElementById("previewPage").onclick = () => window.open(meta.publicPath, "_blank", "noopener");
    document.getElementById("publishPage").disabled = true;
    renderPageEditor();
    return;
  }
  try {
    const [page, media] = await Promise.all([api(`/api/admin?module=page-editor&page=${encodeURIComponent(key)}`), api("/api/admin?module=media")]);
    pageData = page; mediaItems = media.media;
    const hasDraftChanges = JSON.stringify(page.config.draft) !== JSON.stringify(page.config.published);
    document.getElementById("pageLiveState").textContent = page.config.publishedAt ? `LIVE / 已上线 · ${formatDate(page.config.publishedAt)}` : "LIVE / 使用默认内容";
    document.getElementById("pageDraftState").textContent = hasDraftChanges ? `DRAFT / 有未发布修改 · ${formatDate(page.config.updatedAt)}` : "DRAFT / 无未发布修改";
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
  if (event.target.matches("select[data-path$='.fit'], select[data-path$='.focalPosition']")) {
    pageData.config.draft = collectPageDraft();
    renderPageEditor();
  }
});

document.getElementById("pageSections").addEventListener("click", (event) => {
  const choose = event.target.closest("[data-choose-upload]");
  if (choose) {
    const input = document.querySelector(`[data-media-upload="${choose.dataset.mediaPath}"]`);
    input.accept = choose.dataset.chooseUpload === "video" ? VIDEO_ACCEPT : "image/jpeg,image/png,image/webp";
    input.click();
  }
  const move = event.target.closest("[data-case-move]");
  if (move) {
    pageData.config.draft = collectPageDraft();
    const index = Number(move.closest("[data-case-index]").dataset.caseIndex);
    const next = move.dataset.caseMove === "up" ? index - 1 : index + 1;
    const ids = [...pageData.config.draft.selectedWork.caseIds]; while (ids.length < 9) ids.push("");
    [ids[index], ids[next]] = [ids[next], ids[index]];
    pageData.config.draft.selectedWork.caseIds = ids.filter(Boolean);
    renderPageEditor();
  }
  const add = event.target.closest("[data-collection-add]");
  if (add) {
    pageData.config.draft = collectPageDraft();
    const key = add.dataset.collectionAdd;
    const items = Array.isArray(pageData.config.draft[key]) ? pageData.config.draft[key] : [];
    items.push({ ...makeCollectionItem("New Item"), sortOrder: items.length });
    pageData.config.draft[key] = items;
    renderPageEditor();
  }
  const batch = event.target.closest("[data-collection-batch]");
  if (batch) document.querySelector(`[data-collection-files="${batch.dataset.collectionBatch}"]`)?.click();
  const collectionChoose = event.target.closest("[data-collection-choose]");
  if (collectionChoose) openCollectionMediaPicker(collectionChoose.dataset.collectionChoose);
  const remove = event.target.closest("[data-collection-remove]");
  if (remove) {
    pageData.config.draft = collectPageDraft();
    const row = remove.closest("[data-collection-item]");
    const key = remove.dataset.collectionRemove;
    const index = Number(row?.dataset.index);
    pageData.config.draft[key] = (pageData.config.draft[key] || []).filter((_, itemIndex) => itemIndex !== index).map((item, itemIndex) => ({ ...item, sortOrder: itemIndex }));
    renderPageEditor();
  }
  const collectionMove = event.target.closest("[data-collection-move]");
  if (collectionMove) {
    const row = collectionMove.closest("[data-collection-item]");
    const index = Number(row?.dataset.index);
    moveCollectionItem(collectionMove.dataset.collectionKey, index, collectionMove.dataset.collectionMove === "up" ? index - 1 : index + 1);
  }
});

document.getElementById("pageSections").addEventListener("change", async (event) => {
  const input = event.target.closest("[data-media-upload]");
  if (!input?.files?.[0]) return;
  const file = input.files[0];
  const message = document.getElementById("pageEditorMessage");
  showMessage(message, `正在上传 ${file.name}...`);
  try {
    pageData.config.draft = collectPageDraft();
    const media = await uploadMediaFile(file, { category: PAGE_META[pageKey].category, displayName: file.name.replace(/\.[^.]+$/, ""), altText: "" });
    mediaItems.unshift(media);
    setPath(pageData.config.draft, `${input.dataset.mediaUpload}.mediaId`, media.id);
    setPath(pageData.config.draft, `${input.dataset.mediaUpload}.mediaType`, media.mediaType);
    renderPageEditor();
    showMessage(message, media.processingStatus === "ready" ? "媒体已上传并选中，确认后请保存草稿。" : "视频原文件已保存，网页播放版本仍在处理中，暂不能用于公开页面。", media.processingStatus === "ready" ? "success" : "");
  } catch (error) { showMessage(message, error.message, "error"); }
});

async function savePageDraft() {
  const draft = collectPageDraft();
  const data = await api(`/api/admin?module=page-editor&page=${encodeURIComponent(pageKey)}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft) });
  pageData.config = data.config;
  showMessage(document.getElementById("pageEditorMessage"), "草稿已保存，正式网站尚未改变。", "success");
  return data;
}

document.getElementById("pageEditorForm").addEventListener("submit", async (event) => { event.preventDefault(); if (PAGE_META[pageKey]?.readonly) return showMessage(document.getElementById("pageEditorMessage"), "这个系统页面不需要保存草稿。"); try { await savePageDraft(); } catch (error) { showMessage(document.getElementById("pageEditorMessage"), error.message, "error"); } });
document.getElementById("previewPage").addEventListener("click", async () => { try { if (PAGE_META[pageKey]?.readonly) return window.open(PAGE_META[pageKey].publicPath, "_blank", "noopener"); await savePageDraft(); window.open(`${PAGE_META[pageKey].publicPath}?adminPreview=${encodeURIComponent(pageKey)}`, "_blank", "noopener"); } catch (error) { showMessage(document.getElementById("pageEditorMessage"), error.message, "error"); } });
document.getElementById("publishPage").addEventListener("click", async () => { if (PAGE_META[pageKey]?.readonly) return showMessage(document.getElementById("pageEditorMessage"), "这个系统页面不需要发布。"); if (!confirm(`确定把“${PAGE_META[pageKey].title}”草稿发布到正式网站吗？`)) return; try { await savePageDraft(); await api(`/api/admin?module=page-editor&page=${encodeURIComponent(pageKey)}&action=publish`, { method: "POST" }); showMessage(document.getElementById("pageEditorMessage"), "发布成功。", "success"); await loadPageEditor(pageKey); } catch (error) { showMessage(document.getElementById("pageEditorMessage"), error.message, "error"); } });
document.getElementById("restorePage").addEventListener("click", async () => { if (PAGE_META[pageKey]?.readonly) return showMessage(document.getElementById("pageEditorMessage"), "这个系统页面没有可恢复版本。"); if (!confirm("确定恢复上一个已发布版本吗？")) return; try { await api(`/api/admin?module=page-editor&page=${encodeURIComponent(pageKey)}&action=restore`, { method: "POST" }); showMessage(document.getElementById("pageEditorMessage"), "已恢复上一版本。", "success"); await loadPageEditor(pageKey); } catch (error) { showMessage(document.getElementById("pageEditorMessage"), error.message, "error"); } });

function openCollectionMediaPicker(key) {
  pageData.config.draft = collectPageDraft();
  const section = PAGE_SECTIONS[pageKey].find((item) => item.key === key) || {};
  const allowed = mediaItems.filter((item) => !item.trashedAt && (section.allowVideo || item.mediaType !== "video"));
  const modal = document.createElement("div");
  modal.className = "admin-modal-backdrop";
  modal.innerHTML = `<div class="admin-modal media-picker-modal"><div class="admin-modal-head"><h2>选择素材</h2><button class="icon-command" type="button" data-close-modal>×</button></div><p class="admin-helper">选择现有媒体，一次加入 ${escapeHtml(key)}。不会重复上传资源。</p><input class="media-picker-search" placeholder="搜索素材"><div class="media-picker-grid">${allowed.map((item) => `<label class="media-picker-item" data-picker-search="${escapeHtml([item.displayName, item.originalFilename, item.category, item.collection, ...(item.tags || [])].join(" ").toLowerCase())}"><input type="checkbox" value="${escapeHtml(item.id)}">${mediaPreview(item, "media-picker-preview")}<span>${escapeHtml(item.displayName || item.originalFilename || item.id)}</span><small>${escapeHtml(item.collection || item.category || "")}</small></label>`).join("")}</div><div class="admin-form-actions"><button class="btn btn-primary" type="button" data-picker-add>添加已选择</button><button class="btn btn-secondary" type="button" data-close-modal>取消</button></div></div>`;
  document.body.append(modal);
  modal.querySelector("[data-close-modal]").focus();
  modal.addEventListener("input", (event) => {
    if (!event.target.matches(".media-picker-search")) return;
    const needle = event.target.value.trim().toLowerCase();
    modal.querySelectorAll("[data-picker-search]").forEach((item) => { item.hidden = needle && !item.dataset.pickerSearch.includes(needle); });
  });
  modal.addEventListener("click", (event) => {
    if (event.target.matches("[data-close-modal]") || event.target === modal) modal.remove();
    if (!event.target.matches("[data-picker-add]")) return;
    const selected = [...modal.querySelectorAll("input[type='checkbox']:checked")].map((input) => mediaItems.find((item) => item.id === input.value)).filter(Boolean);
    if (!selected.length) return;
    const items = Array.isArray(pageData.config.draft[key]) ? pageData.config.draft[key] : [];
    for (const media of selected) items.push({ ...makeCollectionItem(media.displayName || media.originalFilename || media.id, media), sortOrder: items.length });
    pageData.config.draft[key] = items;
    modal.remove();
    renderPageEditor();
    showMessage(document.getElementById("pageEditorMessage"), `${selected.length} 个媒体已加入，请保存草稿。`, "success");
  });
}

function mediaOptionsSimple(items, selected, fallbackLabel) {
  return `<option value="">${escapeHtml(fallbackLabel)}</option>${items.filter((item) => item.mediaType === "image").map((item) => `<option value="${item.id}" ${item.id === selected ? "selected" : ""}>${escapeHtml(item.displayName || item.originalFilename)} · ${escapeHtml(item.category)}</option>`).join("")}`;
}

let settingsData;

function brandingField(name, label, hint) {
  const selected = settingsData.settings.draft[name] || "";
  const item = mediaItems.find((entry) => entry.id === selected);
  return `<article class="branding-field" data-branding-field="${name}"><div class="branding-preview">${item ? `<img src="${item.url}" alt="${escapeHtml(label)}">` : '<span>使用当前文字品牌</span>'}</div><div><h3>${escapeHtml(label)}</h3><p>${escapeHtml(hint)}</p><label class="field">从媒体库选择<select name="${name}">${mediaOptionsSimple(mediaItems, selected, "使用文字品牌 / 当前图标")}</select></label><div class="media-action-row"><button class="btn btn-secondary" type="button" data-brand-upload="${name}">上传并选择</button><button class="btn btn-secondary" type="button" data-brand-remove="${name}" ${selected ? "" : "disabled"}>移除</button><a class="btn btn-secondary" href="/admin/media">打开媒体库</a></div><input class="visually-hidden" type="file" data-brand-file="${name}" accept="image/svg+xml,image/png,image/webp"></div></article>`;
}

function renderBrandingFields() {
  document.getElementById("brandingFields").innerHTML = [
    brandingField("primaryLogoMediaId", "主 Logo", "用于桌面、手机页头和后台。建议透明背景横版 Logo。"),
    brandingField("darkLogoMediaId", "深色背景 Logo（可选）", "用于页脚等深色背景；留空时使用主 Logo。"),
    brandingField("faviconMediaId", "Favicon", "用于浏览器标签页。建议方形 PNG、WebP 或 SVG。")
  ].join("");
}

async function loadSettings() {
  const form = document.getElementById("settingsForm");
  try {
    const [settings, media] = await Promise.all([api("/api/admin?module=settings"), api("/api/admin?module=media")]);
    settingsData = settings; mediaItems = media.media;
    const draft = settings.settings.draft;
    ["companyName", "publicEmail", "whatsapp", "whatsappUrl", "phone", "linkedinUrl", "location", "defaultSeoTitle", "defaultSeoDescription"].forEach((name) => { form.elements[name].value = draft[name] || ""; });
    form.elements.defaultOgMediaId.innerHTML = mediaOptionsSimple(media.media, draft.defaultOgMediaId, "使用当前社交分享图片");
    renderBrandingFields();
    const hasDraftChanges = JSON.stringify(settings.settings.draft) !== JSON.stringify(settings.settings.published);
    document.getElementById("settingsLiveState").textContent = settings.settings.publishedAt ? `LIVE / 已上线 · ${formatDate(settings.settings.publishedAt)}` : "LIVE / 使用默认设置";
    document.getElementById("settingsState").textContent = hasDraftChanges ? `DRAFT / 有未发布修改 · ${formatDate(settings.settings.updatedAt)}` : "DRAFT / 无未发布修改";
    document.getElementById("restoreSettings").disabled = !settings.settings.previous;
  } catch (error) { showMessage(document.getElementById("settingsMessage"), error.message, "error"); }
}

function settingsPayload() {
  const form = document.getElementById("settingsForm");
  const payload = {};
  ["companyName", "primaryLogoMediaId", "darkLogoMediaId", "faviconMediaId", "publicEmail", "whatsapp", "whatsappUrl", "phone", "linkedinUrl", "location", "defaultSeoTitle", "defaultSeoDescription", "defaultOgMediaId"].forEach((name) => { payload[name] = form.elements[name].value; });
  payload.defaultOgImagePath = settingsData.settings.draft.defaultOgImagePath;
  return payload;
}

async function saveSettingsDraft() {
  settingsData = await api("/api/admin?module=settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(settingsPayload()) });
  showMessage(document.getElementById("settingsMessage"), "设置草稿已保存。", "success");
}

document.getElementById("settingsForm").addEventListener("submit", async (event) => { event.preventDefault(); try { await saveSettingsDraft(); } catch (error) { showMessage(document.getElementById("settingsMessage"), error.message, "error"); } });
document.getElementById("brandingFields").addEventListener("click", (event) => {
  const upload = event.target.closest("[data-brand-upload]");
  if (upload) document.querySelector(`[data-brand-file="${upload.dataset.brandUpload}"]`).click();
  const remove = event.target.closest("[data-brand-remove]");
  if (remove) {
    settingsData.settings.draft[remove.dataset.brandRemove] = "";
    renderBrandingFields();
  }
});
document.getElementById("brandingFields").addEventListener("change", async (event) => {
  if (event.target.matches("select[name]")) {
    settingsData.settings.draft[event.target.name] = event.target.value;
    renderBrandingFields();
    return;
  }
  const input = event.target.closest("[data-brand-file]");
  if (!input?.files?.[0]) return;
  const file = input.files[0];
  const message = document.getElementById("settingsMessage");
  showMessage(message, `正在上传 ${file.name}...`);
  try {
    const media = await uploadMediaFile(file, { category: "Other", displayName: file.name.replace(/\.[^.]+$/, ""), altText: "YZH Dental Lab logo" });
    mediaItems.unshift(media);
    settingsData.settings.draft[input.dataset.brandFile] = media.id;
    renderBrandingFields();
    showMessage(message, "品牌图片已上传并选中，请保存草稿后预览。", "success");
  } catch (error) { showMessage(message, error.message, "error"); }
});

document.getElementById("pageSections").addEventListener("dragstart", (event) => {
  const row = event.target.closest("[data-collection-item]");
  if (!row) return;
  event.dataTransfer.setData("text/plain", `${row.dataset.collectionItem}:${row.dataset.index}`);
  event.dataTransfer.effectAllowed = "move";
});

document.getElementById("pageSections").addEventListener("dragover", (event) => {
  if (event.target.closest("[data-collection-item]")) event.preventDefault();
});

document.getElementById("pageSections").addEventListener("drop", (event) => {
  const target = event.target.closest("[data-collection-item]");
  if (!target) return;
  const [key, from] = event.dataTransfer.getData("text/plain").split(":");
  if (!key || key !== target.dataset.collectionItem) return;
  event.preventDefault();
  moveCollectionItem(key, Number(from), Number(target.dataset.index));
});

document.getElementById("pageSections").addEventListener("change", async (event) => {
  const input = event.target.closest("[data-collection-files]");
  if (!input?.files?.length) return;
  const key = input.dataset.collectionFiles;
  const section = PAGE_SECTIONS[pageKey].find((item) => item.key === key) || {};
  const message = document.getElementById("pageEditorMessage");
  pageData.config.draft = collectPageDraft();
  const items = Array.isArray(pageData.config.draft[key]) ? pageData.config.draft[key] : [];
  showMessage(message, `正在批量上传 ${input.files.length} 个文件...`);
  try {
    for (const file of [...input.files]) {
      const media = await uploadMediaFile(file, { category: section.uploadCategory || PAGE_META[pageKey].category, displayName: file.name.replace(/\.[^.]+$/, ""), altText: "" });
      mediaItems.unshift(media);
      items.push({ ...makeCollectionItem(file.name.replace(/\.[^.]+$/, ""), media), sortOrder: items.length });
    }
    pageData.config.draft[key] = items;
    renderPageEditor();
    showMessage(message, "批量上传完成。确认无误后请保存草稿。", "success");
  } catch (error) {
    showMessage(message, error.message, "error");
  } finally {
    input.value = "";
  }
});

document.getElementById("mediaList").addEventListener("change", async (event) => {
  const input = event.target.closest("[data-media-replace-file]");
  if (!input?.files?.[0]) return;
  const card = input.closest("[data-media-id]");
  const item = mediaItems.find((entry) => entry.id === card.dataset.mediaId);
  const file = input.files[0];
  const message = card.querySelector(".admin-message");
  if (!confirm(`用 ${file.name} 替换“${item.displayName || item.originalFilename}”？\n\n现有使用位置会更新，旧文件进入回收站。`)) { input.value = ""; return; }
  showMessage(message, `正在上传 ${file.name}...`);
  try {
    const replacement = await uploadMediaFile(file, { category: item.category, displayName: item.displayName || file.name.replace(/\.[^.]+$/, ""), altText: item.altText || "" }, (percentage) => showMessage(message, `正在上传 ${file.name} · ${percentage}%`));
    if ((item.usedIn || []).length) {
      await api("/api/admin?module=media-manage", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "replace-delete", id: item.id, replacementId: replacement.id, usageIds: item.usedIn.map((place) => place.id) }) });
    } else {
      await api("/api/admin?module=media-manage", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "trash", id: item.id }) });
    }
    await loadMedia();
  } catch (error) { showMessage(message, `${error.message} 新上传文件已保留在媒体库，旧文件和页面引用未删除。`, "error"); }
});
document.getElementById("previewSettings").addEventListener("click", async () => { try { await saveSettingsDraft(); window.open("/?adminPreview=settings", "_blank", "noopener"); } catch (error) { showMessage(document.getElementById("settingsMessage"), error.message, "error"); } });
document.getElementById("publishSettings").addEventListener("click", async () => { if (!confirm("确定发布这些公开网站设置吗？")) return; try { await saveSettingsDraft(); await api("/api/admin?module=settings&action=publish", { method: "POST" }); showMessage(document.getElementById("settingsMessage"), "网站设置已发布。", "success"); await loadSettings(); } catch (error) { showMessage(document.getElementById("settingsMessage"), error.message, "error"); } });
document.getElementById("restoreSettings").addEventListener("click", async () => { if (!confirm("确定恢复上一版已发布设置吗？")) return; try { await api("/api/admin?module=settings&action=restore", { method: "POST" }); showMessage(document.getElementById("settingsMessage"), "已恢复上一版设置。", "success"); await loadSettings(); } catch (error) { showMessage(document.getElementById("settingsMessage"), error.message, "error"); } });

const caseCenterState = { cases: [], categories: [], imageTypes: [], current: null, existing: [], newFiles: [], selectedMedia: [] };
const caseStatusLabels = { draft: "草稿", published: "已发布", hidden: "未发布", trash: "回收站" };
const caseStageLabels = { Before: "Before", Scan: "Scan", Planning: "Planning", Design: "Design", CAD: "CAD", Model: "Model", Framework: "Framework", "Ti-base": "Ti-base", PMMA: "PMMA", "Try-in": "Try-in", Final: "Final", QC: "QC", Delivery: "Delivery", Other: "Other" };

function caseMessage(message, type = "") {
  showMessage(document.getElementById("caseCenterMessage"), message, type);
}

function caseOptionMarkup(values, selected = "", labeler = (value) => value) {
  return values.map((value) => `<option value="${escapeHtml(value)}" ${value === selected ? "selected" : ""}>${escapeHtml(labeler(value))}</option>`).join("");
}

function casePreviewMarkup(item) {
  const src = item.url || item.preview || "";
  if (!src) return '<div class="case-media-empty">媒体</div>';
  if (item.mediaType === "video" || String(item.contentType || "").startsWith("video/")) return `<video src="${escapeHtml(src)}" muted playsinline controls preload="metadata"></video>`;
  return `<img src="${escapeHtml(src)}" alt="">`;
}

function renderCaseListCenter() {
  const list = document.getElementById("caseCenterList");
  const search = document.getElementById("caseSearch").value.trim().toLowerCase();
  const status = document.getElementById("caseStatusFilter").value;
  const category = document.getElementById("caseCategoryFilter").value;
  const filtered = caseCenterState.cases.filter((item) => {
    const haystack = [item.title, item.category, item.material, item.implantSystem, item.restorationType, item.shortNote, item.technicalSummary].join(" ").toLowerCase();
    return (!search || haystack.includes(search)) && (!status || item.status === status) && (!category || item.category === category);
  });
  list.innerHTML = filtered.length ? filtered.map((item) => {
    const cover = item.images?.find((image) => image.isCover);
    return `<button type="button" class="case-center-row ${caseCenterState.current?.id === item.id ? "active" : ""}" data-case-id="${escapeHtml(item.id)}">${cover ? `<img src="${escapeHtml(cover.url)}" alt="">` : '<span class="case-row-empty">无封面</span>'}<span><strong>${escapeHtml(item.title || "未命名案例")}</strong><small>${escapeHtml(item.category || "未设置分类")} · ${escapeHtml(caseStatusLabels[item.status] || item.status || "草稿")} · ${escapeHtml(item.material || "未设置材料")} · ${escapeHtml(item.implantSystem || "未设置种植系统")}</small></span></button>`;
  }).join("") : '<p class="admin-empty">没有符合当前筛选条件的案例。</p>';
}

function syncCaseMediaInputs() {
  document.querySelectorAll("#caseExistingMedia [data-existing-id]").forEach((row, index) => {
    const item = caseCenterState.existing.find((entry) => entry.id === row.dataset.existingId);
    if (!item) return;
    item.caption = row.querySelector('[data-key="caption"]').value;
    item.imageType = row.querySelector('[data-key="imageType"]').value;
    item.altText = row.querySelector('[data-key="altText"]').value;
    item.sortOrder = index;
  });
  document.querySelectorAll("#caseNewMedia [data-new-index]").forEach((row) => {
    const item = caseCenterState.newFiles[Number(row.dataset.newIndex)];
    if (!item) return;
    item.caption = row.querySelector('[data-key="caption"]').value;
    item.imageType = row.querySelector('[data-key="imageType"]').value;
    item.altText = row.querySelector('[data-key="altText"]').value;
  });
  document.querySelectorAll("#caseNewMedia [data-selected-media-index]").forEach((row) => {
    const item = caseCenterState.selectedMedia[Number(row.dataset.selectedMediaIndex)];
    if (!item) return;
    item.caption = row.querySelector('[data-key="caption"]').value;
    item.imageType = row.querySelector('[data-key="imageType"]').value;
    item.altText = row.querySelector('[data-key="altText"]').value;
  });
}

function renderCaseMediaCenter() {
  const cover = caseCenterState.existing.find((image) => image.isCover);
  document.getElementById("caseCoverPreview").innerHTML = cover ? `<figure class="admin-current-cover">${casePreviewMarkup(cover)}<figcaption>当前封面</figcaption></figure>` : '<p class="admin-empty">尚未设置封面。</p>';
  const existing = caseCenterState.existing.filter((image) => !image.isCover).sort((a, b) => a.sortOrder - b.sortOrder);
  document.getElementById("caseExistingMedia").innerHTML = existing.map((item) => `<div class="case-media-row" draggable="true" data-case-drag="existing" data-existing-id="${escapeHtml(item.id)}"><span class="drag-handle">拖拽</span>${casePreviewMarkup(item)}<div class="case-media-fields"><label class="field">阶段<select data-key="imageType">${caseOptionMarkup(caseCenterState.imageTypes, item.imageType, (value) => caseStageLabels[value] || value)}</select></label><label class="field">说明<input data-key="caption" value="${escapeHtml(item.caption || "")}" maxlength="240"></label><label class="field">ALT<input data-key="altText" value="${escapeHtml(item.altText || "")}" maxlength="240"></label></div><button class="icon-command" type="button" data-case-media-remove aria-label="移除">×</button></div>`).join("");
  const uploadedRows = caseCenterState.newFiles.map((item, index) => `<div class="case-media-row" draggable="true" data-case-drag="new" data-new-index="${index}"><span class="drag-handle">拖拽</span>${casePreviewMarkup(item)}<div class="case-media-fields"><label class="field">阶段<select data-key="imageType">${caseOptionMarkup(caseCenterState.imageTypes, item.imageType, (value) => caseStageLabels[value] || value)}</select></label><label class="field">说明<input data-key="caption" value="${escapeHtml(item.caption || "")}" maxlength="240"></label><label class="field">ALT<input data-key="altText" value="${escapeHtml(item.altText || "")}" maxlength="240"></label></div><button class="icon-command" type="button" data-case-new-remove aria-label="移除">×</button></div>`);
  const selectedRows = caseCenterState.selectedMedia.map((item, index) => `<div class="case-media-row" draggable="true" data-case-drag="selected" data-selected-media-index="${index}"><span class="drag-handle">拖拽</span>${casePreviewMarkup(item)}<div class="case-media-fields"><label class="field">阶段<select data-key="imageType">${caseOptionMarkup(caseCenterState.imageTypes, item.imageType, (value) => caseStageLabels[value] || value)}</select></label><label class="field">说明<input data-key="caption" value="${escapeHtml(item.caption || "")}" maxlength="240"></label><label class="field">ALT<input data-key="altText" value="${escapeHtml(item.altText || "")}" maxlength="240"></label></div><button class="icon-command" type="button" data-case-selected-remove aria-label="移除">×</button></div>`);
  document.getElementById("caseNewMedia").innerHTML = [...uploadedRows, ...selectedRows].join("");
}

function openCaseCenterEditor(item = null) {
  const form = document.getElementById("caseCenterEditor");
  caseCenterState.current = item;
  caseCenterState.existing = item ? item.images.map((image) => ({ ...image })) : [];
  caseCenterState.newFiles.forEach((entry) => URL.revokeObjectURL(entry.preview));
  caseCenterState.newFiles = [];
  caseCenterState.selectedMedia = [];
  form.reset();
  form.hidden = false;
  document.getElementById("caseEditorMode").textContent = item ? "编辑案例" : "新增案例";
  document.getElementById("caseEditorTitle").textContent = item?.title || "未命名案例";
  const stateBadge = document.getElementById("caseEditorState");
  stateBadge.textContent = caseStatusLabels[item?.status] || "草稿";
  stateBadge.classList.toggle("live", item?.status === "published");
  form.elements.category.innerHTML = '<option value="">选择分类</option>' + caseOptionMarkup(caseCenterState.categories, item?.category);
  form.elements.relatedCaseIds.innerHTML = caseCenterState.cases.filter((entry) => entry.id !== item?.id).map((entry) => `<option value="${escapeHtml(entry.id)}">${escapeHtml(entry.title || entry.id)}</option>`).join("");
  ["title", "category", "contentType", "status", "restorationType", "technicalSummary", "challenge", "planning", "clinicalNotes", "workflow", "technicalOutcome", "material", "implantSystem", "platform", "shade", "software", "technicalReview", "seoTitle", "metaDescription", "tags"].forEach((name) => {
    if (!form.elements[name]) return;
    form.elements[name].value = name === "contentType" ? (item?.contentType || "quick_work") : name === "status" ? (["published", "hidden"].includes(item?.status) ? item.status : "draft") : Array.isArray(item?.[name]) ? item[name].join(", ") : (item?.[name] || "");
  });
  form.elements.featured.checked = Boolean(item?.featured);
  [...form.elements.relatedCaseIds.options].forEach((option) => { option.selected = (item?.relatedCaseIds || []).includes(option.value); });
  form.elements.coverImage.required = !item?.images?.some((image) => image.isCover);
  document.getElementById("casePreviewButton").disabled = !item;
  document.getElementById("caseDuplicateButton").hidden = !item;
  document.getElementById("caseTrashButton").hidden = !item || item.status === "trash";
  document.getElementById("caseRestoreButton").hidden = !item || item.status !== "trash";
  document.getElementById("casePermanentDeleteButton").hidden = !item || item.status !== "trash";
  caseMessage("");
  renderCaseMediaCenter();
  renderCaseListCenter();
}

async function loadCaseCenter() {
  try {
    const data = await api("/api/admin-cases");
    caseCenterState.cases = data.cases;
    caseCenterState.categories = data.categories;
    caseCenterState.imageTypes = data.imageTypes;
    document.getElementById("caseCategoryFilter").innerHTML = '<option value="">All categories</option>' + caseOptionMarkup(data.categories);
    renderCaseListCenter();
    const params = new URLSearchParams(location.search);
    const requested = params.get("case");
    if (requested) {
      const found = caseCenterState.cases.find((item) => item.id === requested);
      if (found) openCaseCenterEditor(found);
    } else if (params.get("action") === "new") openCaseCenterEditor();
  } catch (error) {
    document.getElementById("caseCenterList").innerHTML = `<p class="admin-empty">${escapeHtml(error.message)}</p>`;
  }
}

function serializeCaseCenter(statusOverride) {
  const form = document.getElementById("caseCenterEditor");
  return {
    id: caseCenterState.current?.id,
    title: form.elements.title.value,
    category: form.elements.category.value,
    contentType: form.elements.contentType.value,
    status: statusOverride || form.elements.status.value,
    featured: form.elements.featured.checked,
    restorationType: form.elements.restorationType.value,
    technicalSummary: form.elements.technicalSummary.value,
    challenge: form.elements.challenge.value,
    planning: form.elements.planning.value,
    clinicalNotes: form.elements.clinicalNotes.value,
    workflow: form.elements.workflow.value,
    technicalOutcome: form.elements.technicalOutcome.value,
    material: form.elements.material.value,
    implantSystem: form.elements.implantSystem.value,
    platform: form.elements.platform.value,
    shade: form.elements.shade.value,
    software: form.elements.software.value,
    technicalReview: form.elements.technicalReview.value,
    seoTitle: form.elements.seoTitle.value,
    metaDescription: form.elements.metaDescription.value,
    tags: form.elements.tags.value,
    relatedCaseIds: [...form.elements.relatedCaseIds.selectedOptions].map((option) => option.value).slice(0, 3)
  };
}

async function saveCaseCenter(statusOverride) {
  const form = document.getElementById("caseCenterEditor");
  syncCaseMediaInputs();
  if (!form.reportValidity()) return null;
  const isPublishing = (statusOverride || form.elements.status.value) === "published" && caseCenterState.current?.status !== "published";
  if (isPublishing && !confirm("发布前请确认不包含患者姓名、病历号、正脸或其他未经授权的身份信息。")) return null;
  const formData = new FormData();
  formData.append("case", JSON.stringify(serializeCaseCenter(statusOverride)));
  formData.append("existingImages", JSON.stringify(caseCenterState.existing.map(({ id, caption, imageType, sortOrder, isCover, altText }) => ({ id, caption, imageType, sortOrder, isCover, altText }))));
  formData.append("newImageMeta", JSON.stringify(caseCenterState.newFiles.map((item, index) => ({ caption: item.caption, imageType: item.imageType, altText: item.altText, sortOrder: caseCenterState.existing.length + index }))));
  formData.append("selectedMedia", JSON.stringify(caseCenterState.selectedMedia.map((item, index) => ({ mediaId: item.mediaId, caption: item.caption, imageType: item.imageType, altText: item.altText, sortOrder: caseCenterState.existing.length + caseCenterState.newFiles.length + index }))));
  if (form.elements.coverImage.files[0]) formData.append("coverImage", form.elements.coverImage.files[0]);
  caseCenterState.newFiles.forEach((item) => formData.append("galleryImages", item.file));
  caseMessage("正在保存...");
  const data = await api("/api/admin-cases", { method: caseCenterState.current ? "PUT" : "POST", body: formData });
  await loadCaseCenter();
  const saved = caseCenterState.cases.find((item) => item.id === data.case.id);
  openCaseCenterEditor(saved);
  caseMessage(saved.status === "published" ? "案例已发布。" : "草稿已保存。", "success");
  return saved;
}

["caseSearch", "caseStatusFilter", "caseCategoryFilter"].forEach((id) => document.getElementById(id).addEventListener("input", renderCaseListCenter));
document.getElementById("caseNewButton").addEventListener("click", () => openCaseCenterEditor());
document.getElementById("caseCenterList").addEventListener("click", (event) => {
  const row = event.target.closest("[data-case-id]");
  if (row) openCaseCenterEditor(caseCenterState.cases.find((item) => item.id === row.dataset.caseId));
});
document.querySelector(".case-editor-tabs").addEventListener("click", (event) => {
  const button = event.target.closest("[data-case-tab]");
  if (!button) return;
  document.querySelectorAll("[data-case-tab]").forEach((item) => item.classList.toggle("active", item === button));
  document.querySelectorAll("[data-case-section]").forEach((item) => item.classList.toggle("active", item.dataset.caseSection === button.dataset.caseTab));
});
document.getElementById("caseCenterEditor").addEventListener("submit", async (event) => { event.preventDefault(); try { await saveCaseCenter("draft"); } catch (error) { caseMessage(error.message, "error"); } });
document.getElementById("casePublishButton").addEventListener("click", async () => { try { await saveCaseCenter("published"); } catch (error) { caseMessage(error.message, "error"); } });
document.getElementById("caseHideButton")?.addEventListener("click", async () => { try { await saveCaseCenter("hidden"); } catch (error) { caseMessage(error.message, "error"); } });
document.getElementById("casePreviewButton").addEventListener("click", () => { if (caseCenterState.current) window.open(`/cases/${encodeURIComponent(caseCenterState.current.slug)}?preview=1`, "_blank", "noopener"); });
document.getElementById("caseCloseButton").addEventListener("click", () => { document.getElementById("caseCenterEditor").hidden = true; caseCenterState.current = null; renderCaseListCenter(); });
document.getElementById("caseDuplicateButton").addEventListener("click", async () => { if (!caseCenterState.current) return; try { const data = await api(`/api/admin-cases?action=duplicate&id=${encodeURIComponent(caseCenterState.current.id)}`, { method: "POST" }); await loadCaseCenter(); openCaseCenterEditor(caseCenterState.cases.find((item) => item.id === data.case.id)); caseMessage("草稿副本已创建。", "success"); } catch (error) { caseMessage(error.message, "error"); } });
document.getElementById("caseTrashButton").addEventListener("click", async () => { if (!caseCenterState.current || !confirm("将这个案例移入回收站？")) return; try { await api(`/api/admin-cases?action=trash&id=${encodeURIComponent(caseCenterState.current.id)}`, { method: "POST" }); await loadCaseCenter(); openCaseCenterEditor(caseCenterState.cases.find((item) => item.id === caseCenterState.current?.id)); } catch (error) { caseMessage(error.message, "error"); } });
document.getElementById("caseRestoreButton").addEventListener("click", async () => { if (!caseCenterState.current) return; try { await api(`/api/admin-cases?action=restore&id=${encodeURIComponent(caseCenterState.current.id)}`, { method: "POST" }); await loadCaseCenter(); openCaseCenterEditor(caseCenterState.cases.find((item) => item.id === caseCenterState.current?.id)); } catch (error) { caseMessage(error.message, "error"); } });
document.getElementById("casePermanentDeleteButton").addEventListener("click", async () => { if (!caseCenterState.current || !confirm("永久删除这个案例和它不再被引用的专属媒体？此操作无法撤销。")) return; try { await api(`/api/admin-cases?id=${encodeURIComponent(caseCenterState.current.id)}`, { method: "DELETE" }); document.getElementById("caseCenterEditor").hidden = true; caseCenterState.current = null; await loadCaseCenter(); } catch (error) { caseMessage(error.message, "error"); } });
document.getElementById("caseCenterEditor").elements.galleryImages.addEventListener("change", (event) => {
  caseCenterState.newFiles.forEach((entry) => URL.revokeObjectURL(entry.preview));
  caseCenterState.newFiles = [...event.target.files].map((file) => ({ file, preview: URL.createObjectURL(file), caption: "", altText: "", imageType: "Other", mediaType: file.type.startsWith("video/") ? "video" : "image", contentType: file.type }));
  renderCaseMediaCenter();
});
document.getElementById("caseChooseMediaButton")?.addEventListener("click", () => openCaseMediaPicker());
document.getElementById("caseExistingMedia").addEventListener("input", syncCaseMediaInputs);
document.getElementById("caseNewMedia").addEventListener("input", syncCaseMediaInputs);
document.getElementById("caseExistingMedia").addEventListener("click", (event) => {
  const row = event.target.closest("[data-existing-id]");
  if (!row || !event.target.closest("[data-case-media-remove]")) return;
  syncCaseMediaInputs();
  caseCenterState.existing = caseCenterState.existing.filter((item) => item.id !== row.dataset.existingId);
  renderCaseMediaCenter();
});
document.getElementById("caseNewMedia").addEventListener("click", (event) => {
  const row = event.target.closest("[data-new-index]");
  const selectedRow = event.target.closest("[data-selected-media-index]");
  if (row && event.target.closest("[data-case-new-remove]")) {
    const index = Number(row.dataset.newIndex);
    URL.revokeObjectURL(caseCenterState.newFiles[index].preview);
    caseCenterState.newFiles.splice(index, 1);
  }
  if (selectedRow && event.target.closest("[data-case-selected-remove]")) {
    caseCenterState.selectedMedia.splice(Number(selectedRow.dataset.selectedMediaIndex), 1);
  }
  if (!row && !selectedRow) return;
  renderCaseMediaCenter();
});

function openCaseMediaPicker() {
  syncCaseMediaInputs();
  const already = new Set([
    ...caseCenterState.existing.map((item) => item.mediaId).filter(Boolean),
    ...caseCenterState.selectedMedia.map((item) => item.mediaId).filter(Boolean)
  ]);
  const allowed = mediaItems.filter((item) => !item.trashedAt && !already.has(item.id) && (item.mediaType !== "video" || item.processingStatus === "ready"));
  const modal = document.createElement("div");
  modal.className = "admin-modal-backdrop";
  modal.innerHTML = `<div class="admin-modal media-picker-modal"><div class="admin-modal-head"><h2>选择案例素材</h2><button class="icon-command" type="button" data-close-modal>×</button></div><p class="admin-helper">从素材库批量加入图片/视频，不复制 URL，不重复上传。</p><input class="media-picker-search" placeholder="搜索素材"><div class="media-picker-grid">${allowed.map((item) => `<label class="media-picker-item" data-picker-search="${escapeHtml([item.displayName, item.originalFilename, item.category, item.collection, ...(item.tags || [])].join(" ").toLowerCase())}"><input type="checkbox" value="${escapeHtml(item.id)}">${mediaPreview(item, "media-picker-preview")}<span>${escapeHtml(item.displayName || item.originalFilename || item.id)}</span><small>${escapeHtml(item.collection || item.category || "")}</small></label>`).join("")}</div><div class="admin-form-actions"><button class="btn btn-primary" type="button" data-picker-add>添加已选择</button><button class="btn btn-secondary" type="button" data-close-modal>取消</button></div></div>`;
  document.body.append(modal);
  modal.querySelector("[data-close-modal]").focus();
  modal.addEventListener("input", (event) => {
    if (!event.target.matches(".media-picker-search")) return;
    const needle = event.target.value.trim().toLowerCase();
    modal.querySelectorAll("[data-picker-search]").forEach((item) => { item.hidden = needle && !item.dataset.pickerSearch.includes(needle); });
  });
  modal.addEventListener("click", (event) => {
    if (event.target.matches("[data-close-modal]") || event.target === modal) modal.remove();
    if (!event.target.matches("[data-picker-add]")) return;
    const selected = [...modal.querySelectorAll("input[type='checkbox']:checked")].map((input) => mediaItems.find((item) => item.id === input.value)).filter(Boolean);
    if (!selected.length) return;
    for (const media of selected) {
      caseCenterState.selectedMedia.push({
        mediaId: media.id,
        url: media.url,
        preview: media.url,
        mediaType: media.mediaType,
        contentType: media.contentType,
        caption: media.displayName || media.originalFilename || "",
        altText: media.altText || media.displayName || media.originalFilename || "",
        imageType: "Other"
      });
    }
    modal.remove();
    renderCaseMediaCenter();
    caseMessage(`${selected.length} 个媒体已加入案例，请保存。`, "success");
  });
}
function enableDentalOsDrag(container, listName) {
  container.addEventListener("dragstart", (event) => {
    const row = event.target.closest("[data-case-drag]");
    if (!row) return;
    if ((listName === "newFiles" && row.dataset.caseDrag !== "new") || (listName === "selectedMedia" && row.dataset.caseDrag !== "selected") || (listName === "existing" && row.dataset.caseDrag !== "existing")) return;
    event.dataTransfer.setData("text/plain", listName === "newFiles" ? row.dataset.newIndex : listName === "selectedMedia" ? row.dataset.selectedMediaIndex : row.dataset.existingId);
    event.dataTransfer.effectAllowed = "move";
  });
  container.addEventListener("dragover", (event) => { if (event.target.closest("[data-case-drag]")) event.preventDefault(); });
  container.addEventListener("drop", (event) => {
    const row = event.target.closest("[data-case-drag]");
    if (!row) return;
    if ((listName === "newFiles" && row.dataset.caseDrag !== "new") || (listName === "selectedMedia" && row.dataset.caseDrag !== "selected") || (listName === "existing" && row.dataset.caseDrag !== "existing")) return;
    event.preventDefault();
    syncCaseMediaInputs();
    const list = caseCenterState[listName];
    const fromValue = event.dataTransfer.getData("text/plain");
    const from = listName === "newFiles" ? Number(fromValue) : listName === "selectedMedia" ? Number(fromValue) : list.findIndex((item) => item.id === fromValue);
    const to = listName === "newFiles" ? Number(row.dataset.newIndex) : listName === "selectedMedia" ? Number(row.dataset.selectedMediaIndex) : list.findIndex((item) => item.id === row.dataset.existingId);
    if (from < 0 || to < 0 || from === to) return;
    const [item] = list.splice(from, 1);
    list.splice(to, 0, item);
    list.forEach((entry, index) => { entry.sortOrder = index; });
    renderCaseMediaCenter();
  });
}
enableDentalOsDrag(document.getElementById("caseExistingMedia"), "existing");
enableDentalOsDrag(document.getElementById("caseNewMedia"), "newFiles");
enableDentalOsDrag(document.getElementById("caseNewMedia"), "selectedMedia");

initialize();
