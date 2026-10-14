const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const shellPath = path.join(root, "cloudflare-public", "admin-shell.html");
const scriptPath = path.join(root, "cloudflare-public", "assets", "admin.js");
const workerPath = path.join(root, "_worker.js");
const storePath = path.join(root, "lib", "admin-store.js");
const apiPath = path.join(root, "api", "admin.js");

function read(file) {
  return fs.readFileSync(file, "utf8");
}

function fail(message) {
  console.error(`FAIL ${message}`);
  process.exitCode = 1;
}

function pass(message) {
  console.log(`PASS ${message}`);
}

const shell = read(shellPath);
const adminJs = read(scriptPath);
const worker = read(workerPath);
const store = read(storePath);
const api = read(apiPath);

try {
  new vm.Script(adminJs, { filename: scriptPath });
  pass("admin.js syntax");
} catch (error) {
  fail(`admin.js syntax: ${error.message}`);
}

const requiredRoutes = [
  "/admin",
  "/admin/website",
  "/admin/cases",
  "/admin/media",
  "/admin/submissions",
  "/admin/seo",
  "/admin/settings",
  "/admin/advanced"
];

for (const route of requiredRoutes) {
  if (!shell.includes(`href="${route}"`) && route !== "/admin") fail(`admin shell missing route ${route}`);
  else pass(`admin shell route ${route}`);
}

const requiredChineseNav = ["数据概览", "网站内容", "案例管理", "素材管理", "病例提交", "SEO 设置", "网站设置", "高级设置", "退出登录"];
for (const label of requiredChineseNav) {
  if (!shell.includes(label)) fail(`missing Chinese admin label ${label}`);
  else pass(`Chinese admin label ${label}`);
}

const requiredOperationalCopy = [
  "待处理病例",
  "最近提交",
  "最近案例",
  "加入精选作品",
  "发布检查",
  "caseCompletionPanel",
  "casePublishChecklist",
  "发布前请补齐",
  "Before（术前）",
  "QC（质检）"
];
for (const phrase of requiredOperationalCopy) {
  const source = shell.includes(phrase) || adminJs.includes(phrase);
  if (!source) fail(`missing simplified operations copy or hook: ${phrase}`);
  else pass(`operations copy/hook present: ${phrase}`);
}

if (adminJs.includes("...(value.caseIds || []), ...frontendIds")) {
  fail("featured editor must not reinsert removed live cases into the saved draft");
} else {
  pass("featured editor preserves removals from the saved draft");
}

if (adminJs.includes("const effectiveIds = configuredIds.length ? configuredIds : frontendIds")) {
  fail("explicit empty featured selection must not silently recover public cases");
} else {
  pass("featured editor requires explicit migration and preserves empty selection");
}
for (const diagnostic of ["案例关联异常", "案例缺少封面", "尚未选择案例"]) {
  if (!adminJs.includes(diagnostic)) fail(`featured editor missing actionable state: ${diagnostic}`);
  else pass(`featured editor actionable state present: ${diagnostic}`);
}

const requiredSeoCopy = [
  "SEO 标题",
  "页面描述",
  "Canonical URL",
  "Open Graph 标题",
  "Open Graph 描述",
  "Open Graph 图片",
  "搜索引擎索引",
  "允许索引",
  "禁止索引",
  "保存修改",
  "恢复默认值",
  "预览页面",
  "系统状态",
  "当前环境",
  "R2 存储状态",
  "API 健康状态"
];
for (const phrase of requiredSeoCopy) {
  if (!shell.includes(phrase) && !adminJs.includes(phrase)) fail(`missing SEO/system status copy: ${phrase}`);
  else pass(`SEO/system status copy present: ${phrase}`);
}

const forbiddenVisibleCopy = [
  "Dashboard</a>",
  "Website</a>",
  "Cases</a>",
  "Media</a>",
  "Submissions</a>",
  "Settings</a>",
  "Advanced</a>",
  "Phase 2 将集中管理",
  "Search cases...",
  "Search media...",
  "Upload Files",
  "Save Draft",
  "Duplicate Case"
];

for (const phrase of forbiddenVisibleCopy) {
  if (shell.includes(phrase)) fail(`visible unfinished/English admin copy remains: ${phrase}`);
  else pass(`no visible unfinished/English admin copy: ${phrase}`);
}

for (const [from, to] of [
  ["/admin/home", "/admin"],
  ["/admin/case-library", "/admin/cases"],
  ["/admin/media-library", "/admin/media"],
  ["/admin/submission", "/admin/submissions"]
]) {
  if (!worker.includes(`"${from}": "${to}"`)) fail(`old admin redirect missing ${from} -> ${to}`);
  else pass(`old admin redirect ${from} -> ${to}`);
}

const submissionStatuses = ["New", "Reviewing", "Quotation Sent", "Waiting for Confirmation", "In Progress", "QC", "Completed", "Closed", "Archived"];
for (const status of submissionStatuses) {
  if (!store.includes(`"${status}"`) || !adminJs.includes(status)) fail(`submission status not wired end-to-end: ${status}`);
  else pass(`submission status wired: ${status}`);
}

if (api.includes('href: "/admin/home"')) fail("dashboard still links to old /admin/home");
else pass("dashboard does not link to old /admin/home");

if (shell.includes("dashboardHealth") || shell.includes("dashboardMedia")) fail("dashboard still exposes extra technical dashboard columns");
else pass("dashboard only keeps recent submissions and cases columns");

if (!adminJs.includes("admin-stat-link") || !adminJs.includes("/admin/submissions") || !adminJs.includes("/admin/media")) fail("dashboard stat cards are not clickable operation shortcuts");
else pass("dashboard stat cards are clickable operation shortcuts");

if (adminJs.includes("location.replace(`/admin?next=")) fail("admin route still rewrites deep links to /admin?next");
else pass("admin deep links keep their pathname while showing login");

if (!adminJs.includes("history.pushState") || !adminJs.includes("popstate")) fail("admin navigation does not use history state");
else pass("admin navigation updates URL and supports back/forward");

const routeExpectations = [
  ["/admin", "dashboard", "今天需要处理什么？"],
  ["/admin/website", "website", "公开页面管理"],
  ["/admin/cases", "cases", "案例管理"],
  ["/admin/media", "media", "素材管理"],
  ["/admin/submissions", "submissions", "病例提交"],
  ["/admin/seo", "seo", "SEO 管理"],
  ["/admin/settings", "settings", "网站设置"],
  ["/admin/advanced", "advanced", "系统状态"]
];

const headings = new Set(routeExpectations.map(([, , heading]) => heading));
if (headings.size !== routeExpectations.length) fail("admin route headings are not unique");
else pass("admin route headings are unique");

for (const [, view, heading] of routeExpectations) {
  const sectionPattern = new RegExp(`<section[^>]+data-view="${view}"[\\s\\S]*?<h1[^>]*>${heading}</h1>`);
  if (!sectionPattern.test(shell)) fail(`admin view ${view} missing unique heading ${heading}`);
  else pass(`admin view ${view} has unique heading ${heading}`);
}

const requiredAdminLoads = [
  ["dashboard", "loadDashboard()"],
  ["website", "loadWebsiteOverview()"],
  ["cases", "loadCaseCenter()"],
  ["page", "loadPageEditor(editorKey)"],
  ["submissions", "loadSubmissions()"],
  ["media", "loadMedia()"],
  ["settings", "loadSettings()"]
];
for (const [view, call] of requiredAdminLoads) {
  if (!adminJs.includes(`if (view === "${view}") ${call}`)) fail(`admin route ${view} does not call ${call}`);
  else pass(`admin route ${view} calls ${call}`);
}

if (!adminJs.includes("getCaseCompletion") || !adminJs.includes("renderCaseCompletion")) fail("case completion check is not wired");
else pass("case completion check wired");

if (!adminJs.includes("missing.length") || !adminJs.includes('[data-case-tab="related"]')) fail("publish does not block incomplete cases and route user to checklist");
else pass("publish blocks incomplete cases and opens checklist");

if (!adminJs.includes('api("/api/admin?module=seo"') || !adminJs.includes("saveSeoCurrent")) fail("SEO editor is not connected to admin API");
else pass("SEO editor is connected to admin API");

const advancedStart = shell.indexOf('id="advancedView"');
const advancedEnd = shell.indexOf('<script src=', advancedStart);
const advancedSection = advancedStart >= 0 ? shell.slice(advancedStart, advancedEnd > advancedStart ? advancedEnd : undefined) : "";
if (!adminJs.includes("module=system-status") || /删除|清空|重置/.test(advancedSection)) fail("Advanced system status is unsafe or not connected");
else pass("Advanced system status is safe and connected");

if (process.exitCode) process.exit(process.exitCode);
