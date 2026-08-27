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

function adminErrorMessage(message) {
  const translations = {
    "Invalid password.": "密码错误，请重新输入。",
    "Authentication required.": "请先登录管理员后台。",
    "Authentication is temporarily unavailable.": "登录服务暂时不可用，请稍后重试。",
    "Invalid request origin.": "请求来源无效，请刷新页面后重试。",
    "Request failed.": "请求失败，请稍后重试。",
    "Media item not found.": "未找到该媒体。",
    "This image is currently in use.": "该媒体正在被页面使用，暂时不能删除。",
    "Submission not found.": "未找到该客户提交。",
    "Method not allowed.": "当前操作不受支持。"
  };
  return translations[message] || message;
}

async function api(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (response.status === 401 && location.pathname !== "/admin") {
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
  showMessage(loginMessage, "正在登录...");
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
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function formatBytes(value) {
  const size = Number(value) || 0;
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(2)} MB`;
}

const CATEGORY_LABELS = { Cases: "案例", Homepage: "网站首页", Implant: "种植修复", "Full-Arch": "全口修复", Lab: "实验室", Products: "产品", Other: "其他" };
const STATUS_LABELS = { New: "新提交", Reviewed: "已查看", Archived: "已归档", draft: "草稿", published: "已发布" };
function categoryLabel(value) { return CATEGORY_LABELS[value] || value || "-"; }
function statusLabel(value) { return STATUS_LABELS[value] || value || "-"; }

async function loadDashboard() {
  const stats = document.getElementById("dashboardStats");
  try {
    const data = await api("/api/admin?module=dashboard");
    stats.innerHTML = `<div class="admin-stat"><strong>${data.counts.publishedCases}</strong><span>已发布案例</span></div><div class="admin-stat"><strong>${data.counts.draftCases}</strong><span>草稿案例</span></div><div class="admin-stat"><strong>${data.counts.newSubmissions}</strong><span>新客户提交</span></div>`;
    document.getElementById("dashboardSubmissions").innerHTML = data.recentSubmissions.length ? data.recentSubmissions.map((item) => `<a href="/admin/submissions?case=${encodeURIComponent(item.caseId)}"><span><strong>${escapeHtml(item.caseId)}</strong><small>${escapeHtml(item.name || item.company || "客户提交")}</small></span><small>${formatDate(item.submittedAt)}</small></a>`).join("") : '<p class="admin-empty">暂无客户提交。</p>';
    document.getElementById("dashboardPublished").innerHTML = data.recentPublished.length ? data.recentPublished.map((item) => `<a href="/admin/cases?case=${encodeURIComponent(item.id)}"><span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(categoryLabel(item.category))}</small></span><small>${formatDate(item.publishedAt)}</small></a>`).join("") : '<p class="admin-empty">暂无已发布作品。</p>';
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
  document.getElementById("submissionList").innerHTML = filtered.length ? filtered.map((item) => `<button class="admin-record-button ${item.caseId === currentSubmissionId ? "active" : ""}" type="button" data-submission-id="${escapeHtml(item.caseId)}"><strong>${escapeHtml(item.caseId)}</strong><span>${escapeHtml(item.fields.name || "未填写姓名")} · ${escapeHtml(item.fields.company || "未填写公司")}</span><span class="admin-record-meta"><span>${formatDate(item.submittedAt)}</span><span class="admin-status-pill">${escapeHtml(statusLabel(item.status))} · ${item.fileCount} 个文件</span></span></button>`).join("") : '<p class="admin-empty">此状态下暂无提交记录。</p>';
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
  detail.innerHTML = '<p class="admin-loading">正在加载...</p>';
  try {
    const { submission } = await api(`/api/admin?module=submissions&id=${encodeURIComponent(id)}`);
    const fields = submission.fields || {};
    const detailItems = [["客户姓名", fields.name], ["公司", fields.company], ["邮箱", fields.email], ["WhatsApp", fields.whatsapp], ["国家", fields.country], ["案例类型", fields.case_type], ["种植体品牌", fields.implant_brand], ["种植系统", fields.implant_system], ["平台", fields.platform], ["修复类型", fields.restoration_type], ["材料", fields.material], ["色号", fields.shade], ["数量", fields.quantity], ["要求日期", fields.due_date], ["提交时间", formatDate(submission.submittedAt)]];
    detail.innerHTML = `<div class="admin-detail-head"><div><p class="eyebrow">客户提交</p><h2>${escapeHtml(submission.caseId)}</h2></div><select id="submissionStatus"><option value="New" ${submission.status === "New" ? "selected" : ""}>新提交</option><option value="Reviewed" ${submission.status === "Reviewed" ? "selected" : ""}>已查看</option><option value="Archived" ${submission.status === "Archived" ? "selected" : ""}>已归档</option></select></div><dl class="admin-detail-grid">${detailItems.map(([label, value]) => `<div><dt>${label}</dt><dd>${escapeHtml(value || "-")}</dd></div>`).join("")}</dl><div class="admin-instructions"><strong>客户说明</strong><br>${escapeHtml(fields.instructions || "客户未填写说明。")}</div><h3>附件</h3><div class="admin-file-list">${submission.files.length ? submission.files.map((file) => `<div class="admin-file"><span><strong>${escapeHtml(file.originalName || file.filename)}</strong><br><small>${formatBytes(file.size)} · ${escapeHtml(file.contentType)}</small></span><a class="btn btn-secondary" href="${file.downloadUrl}">下载</a></div>`).join("") : '<p class="admin-empty">没有上传文件。</p>'}</div><div class="admin-copy-actions"><button class="btn btn-secondary" type="button" data-copy-value="${escapeHtml(fields.email)}">复制邮箱</button><button class="btn btn-secondary" type="button" data-copy-value="${escapeHtml(fields.whatsapp)}">复制 WhatsApp</button></div><div class="admin-message" id="submissionMessage" role="status"></div>`;
    document.getElementById("submissionStatus").addEventListener("change", async (event) => {
      try {
        await api("/api/admin?module=submissions", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ caseId: id, status: event.target.value }) });
        const item = submissions.find((entry) => entry.caseId === id); if (item) item.status = event.target.value; renderSubmissions(); showMessage(document.getElementById("submissionMessage"), "状态已更新。", "success");
      } catch (error) { showMessage(document.getElementById("submissionMessage"), error.message, "error"); }
    });
    detail.querySelectorAll("[data-copy-value]").forEach((button) => button.addEventListener("click", async () => { await copyText(button.dataset.copyValue); showMessage(document.getElementById("submissionMessage"), "已复制。", "success"); }));
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
  document.getElementById("mediaList").innerHTML = filtered.length ? filtered.map((item) => `<article class="admin-media-item" data-media-id="${item.id}">${mediaPreview(item)}<div class="admin-media-fields"><p class="media-type-label">${item.mediaType === "video" ? "MP4 视频" : "图片"} · ${formatBytes(item.size)}</p><label class="field">显示名称<input data-media-key="displayName" value="${escapeHtml(item.displayName)}"></label><label class="field">图片说明（ALT）<input data-media-key="altText" value="${escapeHtml(item.altText)}"></label><label class="field">分类<select data-media-key="category">${["Cases", "Homepage", "Implant", "Full-Arch", "Lab", "Products", "Other"].map((value) => `<option value="${value}" ${value === item.category ? "selected" : ""}>${categoryLabel(value)}</option>`).join("")}</select></label><p class="admin-media-usage"><strong>使用位置：</strong> ${item.usedIn.length ? escapeHtml(item.usedIn.join(", ")) : "当前未使用"}</p><div class="admin-media-actions"><button class="btn btn-secondary" type="button" data-media-use>使用到页面</button><button class="btn btn-secondary" type="button" data-media-save>保存信息</button><button class="btn admin-danger" type="button" data-media-delete>删除</button></div><div class="media-use-menu" hidden><a href="/admin/home">网站首页</a><a href="/admin/implant">种植修复</a><a href="/admin/full-arch">全口修复</a><a href="/admin/about">关于我们</a></div><div class="admin-message" role="status"></div></div></article>`).join("") : '<p class="admin-empty">没有符合当前筛选条件的媒体。</p>';
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
  if (!window.yzhUploadMedia) throw new Error("媒体上传组件尚未就绪，请刷新页面后重试。");
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
  showMessage(message, "正在上传..."); progress.hidden = false;
  try {
    await uploadMediaFile(file, { category: form.elements.category.value, displayName: form.elements.displayName.value || file.name.replace(/\.[^.]+$/, ""), altText: form.elements.altText.value }, (percentage) => { progress.querySelector("span").style.width = `${percentage}%`; });
    form.reset(); progress.hidden = true; progress.querySelector("span").style.width = "0"; showMessage(message, "媒体上传成功。", "success"); await loadMedia();
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
      showMessage(message, "名称和图片说明已保存。", "success"); await loadMedia();
    }
    if (event.target.closest("[data-media-delete]")) {
      if (!confirm("确定删除这项公开媒体吗？正在被页面使用的媒体无法删除。")) return;
      await api(`/api/admin?module=media&id=${encodeURIComponent(card.dataset.mediaId)}`, { method: "DELETE" });
      await loadMedia();
    }
  } catch (error) { showMessage(message, error.status === 409 ? `当前使用位置：${(error.data.usedIn || []).join(", ")}` : error.message, "error"); }
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
  about: { title: "关于我们 / 实验室", intro: "这里只使用真实的实验室、技师、设备和质检媒体。", publicPath: "/about", category: "Lab" }
};

const PAGE_SECTIONS = {
  home: [
    { key: "hero", label: "01 首屏主视觉", hint: "建议使用最有说服力的真实全口修复成品。", media: true, video: true, eyebrow: true, cta: true, secondaryCta: true },
    { key: "selectedWork", label: "02 精选作品", hint: "最多选择 3 个已发布案例，客户点击图片可进入案例详情。", selectedCases: true, eyebrow: true },
    { key: "technicalProof", label: "03 技术证明", hint: "建议使用真实 CAD、支架、模型就位或质检照片。", media: true, video: true, eyebrow: true },
    { key: "workflow", label: "04 工作流程", hint: "可分别为文件、CAD / 设计、生产和质检添加图片。", workflow: true, eyebrow: true },
    { key: "finalCta", label: "05 最终行动区", hint: "使用相关背景图或短 MP4 视频。", media: true, video: true, eyebrow: true, cta: true }
  ],
  implant: [
    { key: "hero", label: "01 首屏主视觉", hint: "建议使用最强的螺丝固位种植桥或种植修复作品。", media: true, eyebrow: true, cta: true },
    { key: "featuredWork", label: "02 精选种植作品", hint: "从真实的已发布案例中选择。", featuredCase: true },
    { key: "customAbutments", label: "03 个性化基台", hint: "建议使用真实个性化基台 / 牙冠组合照片。", media: true },
    { key: "implantBridge", label: "04 螺丝固位 / 种植桥", hint: "建议使用真实螺丝固位桥、接口或组装照片。", media: true },
    { key: "qc", label: "05 质量检查", hint: "建议使用接口、模型就位、螺丝通道或检查照片。", media: true },
    { key: "cta", label: "06 行动按钮", hint: "最终按钮跳转到提交案例页面。", media: true, eyebrow: true, cta: true }
  ],
  fullArch: [
    { key: "hero", label: "01 首屏主视觉", hint: "建议使用最强的真实全口最终修复成品。", media: true, video: true, eyebrow: true, cta: true },
    { key: "featuredCase", label: "02 精选全口案例", hint: "从已发布的重点案例研究中选择。", featuredCase: true, caseStudyOnly: true },
    { key: "restorationOptions", label: "03 修复方案", hint: "PMMA、整块氧化锆及钛杆氧化锆方案。", restorationOptions: true },
    { key: "framework", label: "04 钛支架 / 钛杆", hint: "建议使用真实钛杆、支架照片或加工视频。", media: true, video: true },
    { key: "workflow", label: "05 工作流程", hint: "使用真实全口制作流程图片或短 MP4。", media: true, video: true },
    { key: "qc", label: "06 质量检查", hint: "建议展示接口、适合度、模型就位或最终检查。", media: true },
    { key: "cta", label: "07 行动按钮", hint: "最终按钮跳转到提交案例页面。", media: true, eyebrow: true, cta: true }
  ],
  about: [
    { key: "hero", label: "01 首屏主视觉", hint: "使用真实实验室或 CAD 工作站媒体。", media: true, video: true, eyebrow: true, cta: true },
    { key: "laboratory", label: "02 实验室", hint: "上传真实实验室工作区照片或视频。", media: true, video: true },
    { key: "cad", label: "03 CAD / 设计", hint: "上传真实 CAD 工作站照片或视频。", media: true, video: true },
    { key: "production", label: "04 生产", hint: "上传真实切削或生产照片、视频。", media: true, video: true },
    { key: "finishing", label: "05 修整", hint: "上传真实技师工作照片或视频。", media: true, video: true },
    { key: "qc", label: "06 质量检查", hint: "上传真实质检照片或视频。", media: true, video: true },
    { key: "packing", label: "07 包装 / 发货", hint: "上传真实包装或发货照片、视频；没有真实媒体时请留空。", media: true, video: true }
  ]
};

let pageKey = "";
let pageData;

function mediaOptions(selected, type = "") {
  const items = mediaItems.filter((item) => !type || item.mediaType === type);
  return `<option value="">使用页面当前媒体</option>${items.map((item) => `<option value="${item.id}" ${item.id === selected ? "selected" : ""}>${escapeHtml(item.displayName || item.originalFilename)} · ${escapeHtml(categoryLabel(item.category))} · ${item.mediaType === "video" ? "视频" : "图片"}</option>`).join("")}`;
}

function caseOptions(selected, caseStudyOnly = false) {
  const cases = (pageData?.publishedCases || []).filter((item) => !caseStudyOnly || item.contentType === "case_study");
  return `<option value="">不选择案例</option>${cases.map((item) => `<option value="${item.id}" ${item.id === selected ? "selected" : ""}>${escapeHtml(item.title)} · ${escapeHtml(categoryLabel(item.category))}</option>`).join("")}`;
}

function currentMedia(slot) {
  return mediaItems.find((item) => item.id === slot?.mediaId);
}

function editorMediaPreview(slot) {
  const item = currentMedia(slot);
  if (item) return mediaPreview(item, "editor-media-preview");
  if (slot?.fallbackPath) return `<img class="editor-media-preview" src="${escapeHtml(slot.fallbackPath)}" alt="${escapeHtml(slot.altText || "页面当前媒体")}">`;
  return '<div class="editor-media-empty">尚未选择公开媒体</div>';
}

function renderMediaEditor(path, slot, allowVideo, hint) {
  const isVideo = slot?.mediaType === "video" || currentMedia(slot)?.mediaType === "video";
  return `<div class="media-position" data-media-position="${path}"><div class="media-position-preview">${editorMediaPreview(slot)}</div><div class="media-position-controls"><p class="admin-helper">${escapeHtml(hint)}</p><label class="field">从媒体库选择<select data-path="${path}.mediaId">${mediaOptions(slot?.mediaId)}</select></label><div class="media-action-row"><button class="btn btn-secondary" type="button" data-choose-upload="image" data-media-path="${path}">替换图片</button>${allowVideo ? `<button class="btn btn-secondary" type="button" data-choose-upload="video" data-media-path="${path}">上传视频</button>` : ""}<a class="btn btn-secondary" href="/admin/media">打开媒体库</a></div><input class="visually-hidden" type="file" data-media-upload="${path}" accept="image/jpeg,image/png,image/webp,video/mp4"><div class="video-options" ${isVideo ? "" : "hidden"}><label class="field">视频封面图<select data-path="${path}.posterMediaId">${mediaOptions(slot?.posterMediaId, "image")}</select></label><label class="check-field"><input type="checkbox" data-path="${path}.autoplay" ${slot?.autoplay ? "checked" : ""}> 自动播放</label><label class="check-field"><input type="checkbox" data-path="${path}.muted" checked disabled> 静音</label><label class="check-field"><input type="checkbox" data-path="${path}.loop" ${slot?.loop ? "checked" : ""}> 循环播放</label></div></div></div>`;
}

function textFields(path, value, section) {
  return `${section.eyebrow ? `<label class="field">顶部小标题（Eyebrow）<input data-path="${path}.eyebrow" maxlength="160" value="${escapeHtml(value.eyebrow)}"></label>` : ""}<label class="field">主标题<input data-path="${path}.heading" maxlength="200" value="${escapeHtml(value.heading)}"></label><label class="field">正文<textarea data-path="${path}.description" maxlength="800">${escapeHtml(value.description)}</textarea></label>${section.cta ? `<div class="form-grid"><label class="field">按钮文字<input data-path="${path}.primaryLabel" maxlength="80" value="${escapeHtml(value.primaryLabel)}"></label><label class="field">按钮跳转位置<select data-path="${path}.primaryDestination"><option value="/submit-case" ${value.primaryDestination === "/submit-case" ? "selected" : ""}>提交案例</option><option value="/cases" ${value.primaryDestination === "/cases" ? "selected" : ""}>案例库</option></select></label></div>` : ""}${section.secondaryCta ? `<div class="form-grid"><label class="field">第二按钮文字<input data-path="${path}.secondaryLabel" maxlength="80" value="${escapeHtml(value.secondaryLabel)}"></label><label class="field">第二按钮跳转位置<select data-path="${path}.secondaryDestination"><option value="https://wa.me/8613714730109">WhatsApp 技术团队</option><option value="/cases" ${value.secondaryDestination === "/cases" ? "selected" : ""}>案例库</option></select></label></div>` : ""}`;
}

function selectedWorkEditor(value) {
  const ids = [...(value.caseIds || [])]; while (ids.length < 3) ids.push("");
  return `<div class="selected-work-editor">${ids.map((id, index) => { const item = pageData.publishedCases.find((entry) => entry.id === id); return `<div class="selected-work-slot" data-case-index="${index}">${item?.coverImage ? `<img src="${item.coverImage.url}" alt="${escapeHtml(item.title)}">` : '<div class="case-slot-empty">空位置</div>'}<label class="field">位置 ${index + 1}<select data-case-slot="${index}">${caseOptions(id)}</select></label><div class="slot-actions"><button type="button" class="btn btn-secondary" data-case-move="up" ${index === 0 ? "disabled" : ""}>上移</button><button type="button" class="btn btn-secondary" data-case-move="down" ${index === 2 ? "disabled" : ""}>下移</button></div></div>`; }).join("")}</div>`;
}

function workflowEditor(value, section) {
  return `${textFields("workflow", value, section)}<div class="workflow-media-grid">${(value.items || []).map((item, index) => `<div><label class="field">流程阶段<input data-path="workflow.items.${index}.label" value="${escapeHtml(item.label)}"></label>${renderMediaEditor(`workflow.items.${index}.media`, item.media, false, `${item.label} 阶段可选图片。`)}</div>`).join("")}</div>`;
}

function restorationOptionsEditor(value) {
  return `<div class="restoration-option-editor">${value.map((option, index) => `<div class="restoration-option"><h3>方案 ${index + 1}</h3>${textFields(`restorationOptions.${index}`, option, {})}${renderMediaEditor(`restorationOptions.${index}.media`, option.media, false, "使用真实修复体图片。")}<label class="field">关联案例（可选）<select data-path="restorationOptions.${index}.caseId">${caseOptions(option.caseId)}</select></label></div>`).join("")}</div>`;
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
    else if (section.featuredCase) content = `${textFields(section.key, value, section)}<label class="field">选择精选案例<select data-path="${section.key}.caseId">${caseOptions(value.caseId, section.caseStudyOnly)}</select></label>`;
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
    if (new Set(ids).size !== ids.length) throw new Error("每个精选作品位置必须选择不同的案例。");
    draft.selectedWork.caseIds = ids;
  }
  return draft;
}

async function loadPageEditor(key) {
  pageKey = key;
  const meta = PAGE_META[key];
  document.getElementById("pageEditorTitle").textContent = meta.title;
  document.getElementById("pageEditorIntro").textContent = meta.intro;
  document.title = `${meta.title} | YZH 网站管理后台`;
  try {
    const [page, media] = await Promise.all([api(`/api/admin?module=page-editor&page=${encodeURIComponent(key)}`), api("/api/admin?module=media")]);
    pageData = page; mediaItems = media.media;
    document.getElementById("pageDraftState").textContent = page.config.updatedAt ? `草稿 · ${formatDate(page.config.updatedAt)}` : "草稿";
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
  showMessage(message, `正在上传 ${file.name}...`);
  try {
    pageData.config.draft = collectPageDraft();
    const media = await uploadMediaFile(file, { category: PAGE_META[pageKey].category, displayName: file.name.replace(/\.[^.]+$/, ""), altText: "" });
    mediaItems.unshift(media);
    setPath(pageData.config.draft, `${input.dataset.mediaUpload}.mediaId`, media.id);
    setPath(pageData.config.draft, `${input.dataset.mediaUpload}.mediaType`, media.mediaType);
    renderPageEditor();
    showMessage(message, "媒体已上传并选中，确认后请保存草稿。", "success");
  } catch (error) { showMessage(message, error.message, "error"); }
});

async function savePageDraft() {
  const draft = collectPageDraft();
  const data = await api(`/api/admin?module=page-editor&page=${encodeURIComponent(pageKey)}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft) });
  pageData.config = data.config;
  showMessage(document.getElementById("pageEditorMessage"), "草稿已保存，正式网站尚未改变。", "success");
  return data;
}

document.getElementById("pageEditorForm").addEventListener("submit", async (event) => { event.preventDefault(); try { await savePageDraft(); } catch (error) { showMessage(document.getElementById("pageEditorMessage"), error.message, "error"); } });
document.getElementById("previewPage").addEventListener("click", async () => { try { await savePageDraft(); window.open(`${PAGE_META[pageKey].publicPath}?adminPreview=${encodeURIComponent(pageKey)}`, "_blank", "noopener"); } catch (error) { showMessage(document.getElementById("pageEditorMessage"), error.message, "error"); } });
document.getElementById("publishPage").addEventListener("click", async () => { if (!confirm(`确定把“${PAGE_META[pageKey].title}”草稿发布到正式网站吗？`)) return; try { await savePageDraft(); await api(`/api/admin?module=page-editor&page=${encodeURIComponent(pageKey)}&action=publish`, { method: "POST" }); showMessage(document.getElementById("pageEditorMessage"), "发布成功。", "success"); await loadPageEditor(pageKey); } catch (error) { showMessage(document.getElementById("pageEditorMessage"), error.message, "error"); } });
document.getElementById("restorePage").addEventListener("click", async () => { if (!confirm("确定恢复上一个已发布版本吗？")) return; try { await api(`/api/admin?module=page-editor&page=${encodeURIComponent(pageKey)}&action=restore`, { method: "POST" }); showMessage(document.getElementById("pageEditorMessage"), "已恢复上一版本。", "success"); await loadPageEditor(pageKey); } catch (error) { showMessage(document.getElementById("pageEditorMessage"), error.message, "error"); } });

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
    form.elements.defaultOgMediaId.innerHTML = mediaOptionsSimple(media.media, draft.defaultOgMediaId, "使用当前社交分享图片");
    document.getElementById("settingsState").textContent = settings.settings.publishedAt ? `已上线 · ${formatDate(settings.settings.publishedAt)}` : "草稿";
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
  showMessage(document.getElementById("settingsMessage"), "设置草稿已保存。", "success");
}

document.getElementById("settingsForm").addEventListener("submit", async (event) => { event.preventDefault(); try { await saveSettingsDraft(); } catch (error) { showMessage(document.getElementById("settingsMessage"), error.message, "error"); } });
document.getElementById("previewSettings").addEventListener("click", async () => { try { await saveSettingsDraft(); window.open("/?adminPreview=settings", "_blank", "noopener"); } catch (error) { showMessage(document.getElementById("settingsMessage"), error.message, "error"); } });
document.getElementById("publishSettings").addEventListener("click", async () => { if (!confirm("确定发布这些公开网站设置吗？")) return; try { await saveSettingsDraft(); await api("/api/admin?module=settings&action=publish", { method: "POST" }); showMessage(document.getElementById("settingsMessage"), "网站设置已发布。", "success"); await loadSettings(); } catch (error) { showMessage(document.getElementById("settingsMessage"), error.message, "error"); } });

initialize();
