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

if (process.exitCode) process.exit(process.exitCode);
