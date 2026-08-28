const loginPanel = document.getElementById("loginPanel");
const managerPanel = document.getElementById("managerPanel");
const loginForm = document.getElementById("loginForm");
const loginMessage = document.getElementById("loginMessage");
const logoutButton = document.getElementById("logoutButton");
const adminCaseList = document.getElementById("adminCaseList");
const editor = document.getElementById("caseEditor");
const editorMessage = document.getElementById("editorMessage");
const currentCover = document.getElementById("currentCover");
const existingImages = document.getElementById("existingImages");
const newImages = document.getElementById("newImages");

const state = { cases: [], current: null, categories: [], imageTypes: [], existing: [], newFiles: [] };
const nextPath = new URLSearchParams(window.location.search).get("next");
const publishPrivacyText = "请确认此内容不包含未经授权的患者身份信息。\n\n未经适当授权，不得发布患者姓名、出生日期、病历号、正脸、含身份信息的处方或其他可识别患者的信息。";
const categoryLabels = { "Full-Arch / All-on-X": "全口 / All-on-X", "Implant Bridge": "种植桥", "Custom Abutment": "个性化基台", "Crown & Bridge": "冠桥", "Surgical Guide": "手术导板" };
const imageTypeLabels = { CAD: "CAD", Model: "模型", Framework: "支架", "Ti-base": "Ti-base", PMMA: "PMMA", "Try-in": "试戴", Final: "最终修复体", QC: "质量检查", Other: "其他" };
const ADMIN_SESSION_KEY = "yzh_admin_session";
function categoryLabel(value) { return categoryLabels[value] || value; }
function imageTypeLabel(value) { return imageTypeLabels[value] || value; }

function escapeHtml(value) {
  const element = document.createElement("div");
  element.textContent = value || "";
  return element.innerHTML;
}

function showMessage(element, message, type = "") {
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
    "Case not found.": "未找到该案例。",
    "Method not allowed.": "当前操作不受支持。"
  };
  return translations[message] || message;
}

async function api(url, options = {}) {
  const headers = new Headers(options.headers || {});
  const sessionToken = sessionStorage.getItem(ADMIN_SESSION_KEY);
  if (sessionToken) headers.set("Authorization", `Bearer ${sessionToken}`);
  const response = await fetch(url, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401) sessionStorage.removeItem(ADMIN_SESSION_KEY);
  if (!response.ok || data.ok === false) throw new Error(adminErrorMessage(data.error || "Request failed."));
  return data;
}

function setAuthenticated(authenticated) {
  loginPanel.hidden = authenticated;
  managerPanel.hidden = !authenticated;
  logoutButton.hidden = !authenticated;
}

async function loadCases() {
  const data = await api("/api/admin-cases");
  state.cases = data.cases;
  state.categories = data.categories;
  state.imageTypes = data.imageTypes;
  renderCaseList();
}

function renderCaseList() {
  if (!state.cases.length) {
    adminCaseList.innerHTML = '<p class="admin-empty">暂无案例，请先添加一个草稿案例。</p>';
    return;
  }
  adminCaseList.innerHTML = state.cases.map((item) => `<button type="button" data-id="${item.id}" class="${state.current?.id === item.id ? "active" : ""}">${item.images.find((image) => image.isCover) ? `<img src="${item.images.find((image) => image.isCover).url}" alt="">` : ""}<span><strong>${escapeHtml(item.title)}</strong><small>${item.contentType === "case_study" ? "重点案例研究" : "快速作品"} · ${escapeHtml(categoryLabel(item.category))} · ${item.status === "published" ? "已发布" : "草稿"}${item.featured ? " · 首页展示" : ""}</small></span></button>`).join("");
}

function optionMarkup(values, selected = "", labeler = (value) => value) {
  return values.map((value) => `<option value="${escapeHtml(value)}" ${value === selected ? "selected" : ""}>${escapeHtml(labeler(value))}</option>`).join("");
}

function renderImages() {
  const cover = state.existing.find((image) => image.isCover);
  currentCover.innerHTML = cover ? `<figure class="admin-current-cover"><img src="${cover.url}" alt=""><figcaption>当前封面</figcaption></figure>` : '<p class="admin-empty">尚未上传封面。</p>';
  const gallery = state.existing.filter((image) => !image.isCover).sort((a, b) => a.sortOrder - b.sortOrder);
  existingImages.innerHTML = gallery.map((image, index) => `<div class="admin-image-row" data-existing-id="${image.id}"><img src="${image.url}" alt=""><div><label>图片说明<input data-key="caption" value="${escapeHtml(image.caption)}" maxlength="240"></label><label>阶段类型<select data-key="imageType">${optionMarkup(state.imageTypes, image.imageType, imageTypeLabel)}</select></label></div><div class="admin-image-controls"><button type="button" data-move="up" aria-label="图片上移">↑</button><button type="button" data-move="down" aria-label="图片下移">↓</button><button type="button" data-remove aria-label="移除图片">×</button></div></div>`).join("");
  newImages.innerHTML = state.newFiles.map((item, index) => `<div class="admin-image-row" data-new-index="${index}"><img src="${item.preview}" alt=""><div><label>图片说明<input data-key="caption" value="${escapeHtml(item.caption)}" maxlength="240"></label><label>阶段类型<select data-key="imageType">${optionMarkup(state.imageTypes, item.imageType, imageTypeLabel)}</select></label></div><div class="admin-image-controls"><button type="button" data-new-move="up" aria-label="图片上移">↑</button><button type="button" data-new-move="down" aria-label="图片下移">↓</button><button type="button" data-new-remove aria-label="移除图片">×</button></div></div>`).join("");
}

function syncExistingInputs() {
  existingImages.querySelectorAll("[data-existing-id]").forEach((row, index) => {
    const image = state.existing.find((item) => item.id === row.dataset.existingId);
    if (!image) return;
    image.caption = row.querySelector('[data-key="caption"]').value;
    image.imageType = row.querySelector('[data-key="imageType"]').value;
    image.sortOrder = index;
  });
}

function syncNewInputs() {
  newImages.querySelectorAll("[data-new-index]").forEach((row) => {
    const item = state.newFiles[Number(row.dataset.newIndex)];
    if (!item) return;
    item.caption = row.querySelector('[data-key="caption"]').value;
    item.imageType = row.querySelector('[data-key="imageType"]').value;
  });
}

function updateTypeUI() {
  const isCaseStudy = editor.elements.contentType.value === "case_study";
  document.getElementById("caseStudyFields").hidden = !isCaseStudy;
  document.getElementById("upgradeCaseButton").hidden = isCaseStudy;
  document.getElementById("imageLimitNote").textContent = isCaseStudy
    ? "重点案例研究支持较长的图片序列，只添加这个案例真实具备的阶段。"
    : "快速作品支持 0–6 张其他图片，可用箭头调整展示顺序。";
}

function openEditor(item = null, requestedType = "quick_work") {
  state.current = item;
  state.existing = item ? item.images.map((image) => ({ ...image })) : [];
  state.newFiles.forEach((entry) => URL.revokeObjectURL(entry.preview));
  state.newFiles = [];
  editor.reset();
  editor.hidden = false;
  const contentType = item?.contentType === "case_study" || requestedType === "case_study" ? "case_study" : "quick_work";
  document.getElementById("editorMode").textContent = item ? "编辑作品" : (contentType === "case_study" ? "创建重点案例研究" : "添加快速作品");
  document.getElementById("editorTitle").textContent = item ? item.title : (contentType === "case_study" ? "新重点案例研究" : "新快速作品");
  editor.elements.category.innerHTML = '<option value="">请选择分类</option>' + optionMarkup(state.categories, item?.category, categoryLabel);
  const names = ["title", "category", "shortNote", "restorationType", "material", "implantSystem", "platform", "shade", "caseOverview", "challenge", "recordsReceived", "technicalReview", "cadDesign", "provisional", "framework", "finalRestoration", "qc", "technicalOutcome", "status"];
  names.forEach((name) => { editor.elements[name].value = item?.[name] || (name === "status" ? "draft" : ""); });
  editor.elements.shortNote.value = item?.shortNote || item?.summary || "";
  editor.elements.contentType.value = contentType;
  editor.elements.tags.value = item?.tags?.join(", ") || "";
  editor.elements.featured.checked = Boolean(item?.featured);
  editor.elements.coverCaption.value = item?.images?.find((image) => image.isCover)?.caption || "";
  editor.elements.coverImage.required = !item?.images?.some((image) => image.isCover);
  document.getElementById("previewButton").disabled = !item;
  document.getElementById("duplicateCaseButton").hidden = !item;
  document.getElementById("deleteCaseButton").hidden = !item;
  document.getElementById("togglePublishButton").textContent = item?.status === "published" ? "取消发布" : "发布";
  updateTypeUI();
  showMessage(editorMessage, "");
  renderImages();
  renderCaseList();
  editor.scrollIntoView({ behavior: "smooth", block: "start" });
}

function serializeCase(statusOverride) {
  return {
    id: state.current?.id,
    contentType: editor.elements.contentType.value,
    title: editor.elements.title.value,
    category: editor.elements.category.value,
    shortNote: editor.elements.shortNote.value,
    restorationType: editor.elements.restorationType.value,
    material: editor.elements.material.value,
    implantSystem: editor.elements.implantSystem.value,
    platform: editor.elements.platform.value,
    shade: editor.elements.shade.value,
    caseOverview: editor.elements.caseOverview.value,
    challenge: editor.elements.challenge.value,
    recordsReceived: editor.elements.recordsReceived.value,
    technicalReview: editor.elements.technicalReview.value,
    cadDesign: editor.elements.cadDesign.value,
    provisional: editor.elements.provisional.value,
    framework: editor.elements.framework.value,
    finalRestoration: editor.elements.finalRestoration.value,
    qc: editor.elements.qc.value,
    technicalOutcome: editor.elements.technicalOutcome.value,
    tags: editor.elements.tags.value,
    status: statusOverride || editor.elements.status.value,
    featured: editor.elements.featured.checked,
    coverCaption: editor.elements.coverCaption.value
  };
}

async function saveCase(statusOverride) {
  syncExistingInputs(); syncNewInputs();
  const existingCover = state.existing.find((image) => image.isCover);
  if (existingCover) existingCover.caption = editor.elements.coverCaption.value;
  if (!editor.reportValidity()) return null;
  const additionalCount = state.existing.filter((image) => !image.isCover).length + state.newFiles.length;
  if (editor.elements.contentType.value === "quick_work" && additionalCount > 6) {
    showMessage(editorMessage, "快速作品最多支持 6 张其他图片。", "error");
    return null;
  }
  const nextStatus = statusOverride || editor.elements.status.value;
  const isPublishing = nextStatus === "published" && state.current?.status !== "published";
  if (isPublishing && !confirm(publishPrivacyText)) {
    showMessage(editorMessage, "已取消发布，请检查隐私内容后再发布。", "error");
    return null;
  }
  const formData = new FormData();
  formData.append("case", JSON.stringify(serializeCase(statusOverride)));
  formData.append("existingImages", JSON.stringify(state.existing.map(({ id, caption, imageType, sortOrder, isCover }) => ({ id, caption, imageType, sortOrder, isCover }))));
  formData.append("newImageMeta", JSON.stringify(state.newFiles.map((item, index) => ({ caption: item.caption, imageType: item.imageType, sortOrder: state.existing.length + index }))));
  if (editor.elements.coverImage.files[0]) formData.append("coverImage", editor.elements.coverImage.files[0]);
  state.newFiles.forEach((item) => formData.append("galleryImages", item.file));
  showMessage(editorMessage, "正在保存...");
  const data = await api("/api/admin-cases", { method: state.current ? "PUT" : "POST", body: formData });
  state.current = data.case;
  await loadCases();
  openEditor(state.cases.find((item) => item.id === data.case.id));
  showMessage(editorMessage, data.case.status === "published" ? "案例已保存并发布。" : "草稿已保存。", "success");
  return data.case;
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault(); showMessage(loginMessage, "正在登录...");
  try {
    const auth = await api("/api/admin-auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: loginForm.elements.password.value }) });
    if (auth.sessionToken) sessionStorage.setItem(ADMIN_SESSION_KEY, auth.sessionToken);
    loginForm.reset(); setAuthenticated(true); await loadCases(); handleInitialAction();
  } catch (error) { showMessage(loginMessage, error.message, "error"); }
});

logoutButton.addEventListener("click", async () => { try { await api("/api/admin-auth", { method: "DELETE" }); } finally { sessionStorage.removeItem(ADMIN_SESSION_KEY); } setAuthenticated(false); editor.hidden = true; window.location.href = "/admin"; });
document.getElementById("addQuickWorkButton").addEventListener("click", () => openEditor(null, "quick_work"));
document.getElementById("addCaseStudyButton").addEventListener("click", () => openEditor(null, "case_study"));
editor.elements.contentType.addEventListener("change", updateTypeUI);
document.getElementById("upgradeCaseButton").addEventListener("click", () => { editor.elements.contentType.value = "case_study"; updateTypeUI(); document.getElementById("caseStudyFields").scrollIntoView({ behavior: "smooth", block: "start" }); });
document.getElementById("closeEditor").addEventListener("click", () => { editor.hidden = true; state.current = null; renderCaseList(); });
adminCaseList.addEventListener("click", (event) => { const button = event.target.closest("button[data-id]"); if (button) openEditor(state.cases.find((item) => item.id === button.dataset.id)); });

editor.elements.galleryImages.addEventListener("change", () => {
  state.newFiles.forEach((entry) => URL.revokeObjectURL(entry.preview));
  state.newFiles = [...editor.elements.galleryImages.files].map((file) => ({ file, preview: URL.createObjectURL(file), caption: "", imageType: "Other" }));
  renderImages();
});

existingImages.addEventListener("input", syncExistingInputs);
newImages.addEventListener("input", syncNewInputs);
existingImages.addEventListener("click", (event) => {
  const row = event.target.closest("[data-existing-id]"); if (!row) return;
  syncExistingInputs(); const gallery = state.existing.filter((image) => !image.isCover).sort((a, b) => a.sortOrder - b.sortOrder); const index = gallery.findIndex((image) => image.id === row.dataset.existingId);
  if (event.target.closest("[data-remove]")) state.existing = state.existing.filter((image) => image.id !== row.dataset.existingId);
  if (event.target.closest('[data-move="up"]') && index > 0) [gallery[index - 1].sortOrder, gallery[index].sortOrder] = [gallery[index].sortOrder, gallery[index - 1].sortOrder];
  if (event.target.closest('[data-move="down"]') && index < gallery.length - 1) [gallery[index + 1].sortOrder, gallery[index].sortOrder] = [gallery[index].sortOrder, gallery[index + 1].sortOrder];
  renderImages();
});
newImages.addEventListener("click", (event) => {
  const row = event.target.closest("[data-new-index]"); if (!row) return; syncNewInputs(); const index = Number(row.dataset.newIndex);
  if (event.target.closest("[data-new-remove]")) { URL.revokeObjectURL(state.newFiles[index].preview); state.newFiles.splice(index, 1); }
  if (event.target.closest('[data-new-move="up"]') && index > 0) [state.newFiles[index - 1], state.newFiles[index]] = [state.newFiles[index], state.newFiles[index - 1]];
  if (event.target.closest('[data-new-move="down"]') && index < state.newFiles.length - 1) [state.newFiles[index + 1], state.newFiles[index]] = [state.newFiles[index], state.newFiles[index + 1]];
  renderImages();
});

editor.addEventListener("submit", async (event) => { event.preventDefault(); try { await saveCase(); } catch (error) { showMessage(editorMessage, error.message, "error"); } });
document.getElementById("previewButton").addEventListener("click", () => { if (state.current) window.open(`/cases/${encodeURIComponent(state.current.slug)}?preview=1`, "_blank", "noopener"); });
document.getElementById("togglePublishButton").addEventListener("click", async () => { try { await saveCase(state.current?.status === "published" ? "draft" : "published"); } catch (error) { showMessage(editorMessage, error.message, "error"); } });
document.getElementById("duplicateCaseButton").addEventListener("click", async () => {
  if (!state.current) return;
  showMessage(editorMessage, "正在创建草稿副本...");
  try {
    const data = await api(`/api/admin-cases?action=duplicate&id=${encodeURIComponent(state.current.id)}`, { method: "POST" });
    await loadCases();
    openEditor(state.cases.find((item) => item.id === data.case.id));
    showMessage(editorMessage, "草稿副本已创建，发布前请检查标题和图片。", "success");
  } catch (error) { showMessage(editorMessage, error.message, "error"); }
});
document.getElementById("deleteCaseButton").addEventListener("click", async () => {
  if (!state.current || !confirm(`确定删除“${state.current.title}”及其已上传图片吗？`)) return;
  try { await api(`/api/admin-cases?id=${encodeURIComponent(state.current.id)}`, { method: "DELETE" }); state.current = null; editor.hidden = true; await loadCases(); }
  catch (error) { showMessage(editorMessage, error.message, "error"); }
});

function handleInitialAction() {
  const params = new URLSearchParams(window.location.search);
  const action = params.get("action");
  const caseId = params.get("case");
  if (caseId) {
    const item = state.cases.find((candidate) => candidate.id === caseId);
    if (item) openEditor(item);
    return;
  }
  if (action === "quick") openEditor(null, "quick_work");
  if (action === "featured") openEditor(null, "case_study");
}

api("/api/admin-auth").then(async (data) => {
  setAuthenticated(data.authenticated);
  if (data.authenticated) {
    await loadCases();
    handleInitialAction();
    return;
  }
  const returnPath = `${window.location.pathname}${window.location.search}`;
  if (window.location.pathname === "/admin/cases" && !nextPath) {
    window.location.href = `/admin?next=${encodeURIComponent(returnPath)}`;
  }
}).catch(() => setAuthenticated(false));
