import adminAuth from "./api/admin-auth.js";
import admin from "./api/admin.js";
import adminCases from "./api/admin-cases.js";
import caseImage from "./api/case-image.js";
import casePage from "./api/case-page.js";
import cases from "./api/cases.js";
import downloadCaseFile from "./api/download-case-file.js";
import publicPage from "./api/public-page.js";
import seoStatic from "./api/seo-static.js";
import submitCase from "./api/submit-case.js";
import { Readable, Writable } from "node:stream";

const handlers = { "/api/admin-auth": adminAuth, "/api/admin": admin, "/api/admin-cases": adminCases, "/api/case-image": caseImage, "/api/case-page": casePage, "/api/cases": cases, "/api/download-case-file": downloadCaseFile, "/api/public-page": publicPage, "/api/submit-case": submitCase, "/robots.txt": seoStatic, "/sitemap.xml": seoStatic };

function requestStream(request) {
  if (!request.body) return null;
  return Readable.fromWeb(request.body);
}

function makeNodeRequest(request) {
  const requestUrl = new URL(request.url);
  const isNativeMediaPut = request.method === "PUT" && requestUrl.pathname === "/api/admin" && requestUrl.searchParams.get("module") === "media-upload";
  const stream = isNativeMediaPut ? null : requestStream(request);
  const req = stream || new ReadableStream();
  // Preserve the native Worker body for R2 Binding uploads. The Node stream
  // adapter is still used by the other legacy handlers.
  req.webBody = request.body;
  req.method = request.method;
  req.url = new URL(request.url).pathname + new URL(request.url).search;
  req.headers = Object.fromEntries(request.headers.entries());
  req.query = Object.fromEntries(new URL(request.url).searchParams.entries());
  return req;
}

function makeNodeResponse() {
  const chunks = [];
  const headers = new Headers();
  const res = new Writable({ write(chunk, encoding, callback) { chunks.push(chunk); callback(); } });
  res.statusCode = 200;
  res.setHeader = (name, value) => headers.set(name, Array.isArray(value) ? value.join(", ") : String(value));
  res.getHeader = (name) => headers.get(name);
  res._finishPromise = new Promise((resolve, reject) => { res.once("finish", resolve); res.once("error", reject); });
  res._response = () => new Response(new Blob(chunks), { status: res.statusCode, headers });
  return res;
}

async function invoke(request, env, handler) {
  globalThis.__YZH_CF_ENV = env;
  for (const name of ["STORAGE_BACKEND", "R2_ENDPOINT", "R2_BUCKET_NAME", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_SESSION_TOKEN", "CASE_ADMIN_PASSWORD_HASH", "CASE_SESSION_SECRET", "CASE_DOWNLOAD_SECRET", "CASE_NOTIFICATION_EMAIL", "CASE_FROM_EMAIL", "RESEND_API_KEY", "SITE_URL"]) {
    if (env[name] !== undefined) process.env[name] = String(env[name]);
  }
  const nodeRequest = makeNodeRequest(request);
  const nodeResponse = makeNodeResponse();
  await handler(nodeRequest, nodeResponse);
  await nodeResponse._finishPromise;
  return nodeResponse._response();
}

function videoUnsupported() {
  return Response.json({ ok: false, error: "Automatic HEVC/MOV video conversion is not supported in Cloudflare Preview yet. Upload an H.264/AAC MP4 for playback." }, { status: 501, headers: { "Cache-Control": "no-store" } });
}

const publicPages = { "/": "home", "/services": "services", "/workflow": "workflow", "/services/implant": "implant", "/implant-restorations": "implant", "/services/full-arch": "fullArch", "/full-arch-all-on-x": "fullArch", "/cases": "cases", "/services/crown-bridge": "crownBridge", "/crown-bridge": "crownBridge", "/services/digital-workflow": "digital", "/digital-dentistry": "digital", "/services/design-only": "designOnly", "/services/surgical-guide": "surgicalGuides", "/exocad-design-outsourcing": "exocadOutsourcing", "/all-on-x-full-arch-cad-design": "allOnXCadDesign", "/implant-bar-design": "implantBarDesign", "/custom-abutment-implant-design": "customAbutmentDesign", "/surgical-guide-design-outsourcing": "surgicalGuideOutsourcing", "/surgical-guides": "surgicalGuides", "/about": "about", "/submit-case": "submitCase", "/privacy-policy": "privacy", "/privacy": "privacy", "/terms": "terms" };
const permanentRedirects = {
  "/custom-abutment-implant-design": "/services/implant#custom-abutment",
  "/all-on-x-full-arch-cad-design": "/services/full-arch#cad-design",
  "/surgical-guide-design-outsourcing": "/services/surgical-guide"
};
const adminRedirects = {
  "/admin/home": "/admin",
  "/admin/homepage": "/admin/website/home",
  "/admin/implant": "/admin/website/implant",
  "/admin/full-arch": "/admin/website/full-arch",
  "/admin/about": "/admin/website/about",
  "/admin/case-library": "/admin/cases",
  "/admin/media-library": "/admin/media",
  "/admin/submission": "/admin/submissions"
};
const adminPages = new Set([
  "/admin",
  "/admin/",
  "/admin/website",
  "/admin/website/",
  "/admin/website/home",
  "/admin/website/implant",
  "/admin/website/full-arch",
  "/admin/website/about",
  "/admin/website/submit-case",
  "/admin/submissions",
  "/admin/media",
  "/admin/settings",
  "/admin/cases",
  "/admin/seo",
  "/admin/advanced"
]);
const templatePaths = ["index.tpl", "services.tpl", "workflow.tpl", "implant-restorations.tpl", "full-arch-all-on-x.tpl", "cases.tpl", "crown-bridge.tpl", "digital-dentistry.tpl", "design-only.tpl", "exocad-design-outsourcing.tpl", "all-on-x-full-arch-cad-design.tpl", "implant-bar-design.tpl", "custom-abutment-implant-design.tpl", "surgical-guide-design-outsourcing.tpl", "surgical-guides.tpl", "about.tpl", "submit-case.tpl", "privacy-policy.tpl", "terms.tpl"];
let templatesPromise;

async function loadTemplates(request, env) {
  if (!templatesPromise) {
    templatesPromise = Promise.all(templatePaths.map(async (name) => {
      const response = await env.ASSETS.fetch(new Request(new URL(`/__templates/${name}`, request.url)));
      if (!response.ok) throw new Error(`Template asset unavailable: ${name}`);
      return [name === "index.tpl" ? "templates/index.tpl" : `templates/${name}`, await response.text()];
    })).then((entries) => Object.fromEntries(entries));
  }
  globalThis.__YZH_CF_TEMPLATES = await templatesPromise;
}

async function adminShellResponse(request, env) {
  let assetResponse = await env.ASSETS.fetch(routedRequest(request, "/admin-shell"));
  if (!assetResponse.ok) assetResponse = await env.ASSETS.fetch(routedRequest(request, "/admin-shell.html"));
  const headers = new Headers(assetResponse.headers);
  headers.delete("Location");
  return new Response(assetResponse.body, {
    status: 200,
    headers
  });
}

function routedRequest(request, path, params = {}) {
  const url = new URL(request.url);
  url.pathname = path;
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const init = { method: request.method, headers: new Headers(request.headers), redirect: request.redirect };
  if (!['GET', 'HEAD'].includes(request.method)) init.body = request.body;
  return new Request(url, init);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.hostname === "www.yzhdentallab.com") return Response.redirect(`https://yzhdentallab.com${url.pathname}${url.search}`, 301);
    const handler = handlers[url.pathname];
    if (url.pathname === "/api/video-process") return videoUnsupported();
    if (handler) return invoke(request, env, handler);
    if (permanentRedirects[url.pathname]) return Response.redirect(new URL(permanentRedirects[url.pathname], url), 308);
    if (publicPages[url.pathname]) {
      await loadTemplates(request, env);
      return invoke(routedRequest(request, "/api/public-page", { page: publicPages[url.pathname] }), env, publicPage);
    }
    if (url.pathname.startsWith("/cases/") && url.pathname.length > "/cases/".length) return invoke(routedRequest(request, "/api/case-page", { slug: decodeURIComponent(url.pathname.slice("/cases/".length)) }), env, casePage);
    if (adminRedirects[url.pathname]) return Response.redirect(new URL(`${adminRedirects[url.pathname]}${url.search}`, url), 302);
    if (adminPages.has(url.pathname)) return adminShellResponse(request, env);
    return env.ASSETS.fetch(request);
  },
};
