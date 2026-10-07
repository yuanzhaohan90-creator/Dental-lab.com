import adminAuth from "../api/admin-auth.js";
import admin from "../api/admin.js";
import adminCases from "../api/admin-cases.js";
import caseImage from "../api/case-image.js";
import casePage from "../api/case-page.js";
import cases from "../api/cases.js";
import downloadCaseFile from "../api/download-case-file.js";
import publicPage from "../api/public-page.js";
import submitCase from "../api/submit-case.js";
import { Readable, Writable } from "node:stream";

const handlers = { "/api/admin-auth": adminAuth, "/api/admin": admin, "/api/admin-cases": adminCases, "/api/case-image": caseImage, "/api/case-page": casePage, "/api/cases": cases, "/api/download-case-file": downloadCaseFile, "/api/public-page": publicPage, "/api/submit-case": submitCase };

function requestStream(request) {
  if (!request.body) return null;
  return Readable.fromWeb(request.body);
}

function makeNodeRequest(request) {
  const stream = requestStream(request);
  const req = stream || new ReadableStream();
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

function videoUnsupported(request) {
  return Response.json({ ok: false, error: "Cloudflare Stream is required for HEVC/MOV conversion and is not configured for this Worker." }, { status: 503, headers: { "Cache-Control": "no-store" } });
}

const publicPages = { "/": "home", "/implant-restorations": "implant", "/full-arch-all-on-x": "fullArch", "/cases": "cases", "/crown-bridge": "crownBridge", "/services/crown-bridge": "crownBridge", "/digital-dentistry": "digital", "/services/digital-workflow": "digital", "/exocad-design-outsourcing": "exocadOutsourcing", "/all-on-x-full-arch-cad-design": "allOnXCadDesign", "/implant-bar-design": "implantBarDesign", "/custom-abutment-implant-design": "customAbutmentDesign", "/surgical-guide-design-outsourcing": "surgicalGuideOutsourcing", "/surgical-guides": "surgicalGuides", "/about": "about", "/submit-case": "submitCase", "/privacy-policy": "privacy", "/terms": "terms" };
const adminPages = { "/admin": "index.html", "/admin/": "index.html", "/admin/home": "home.html", "/admin/homepage": "homepage.html", "/admin/implant": "implant.html", "/admin/full-arch": "full-arch.html", "/admin/about": "about.html", "/admin/submissions": "submissions.html", "/admin/media": "media.html", "/admin/settings": "settings.html", "/admin/cases": "cases.html" };

function routedRequest(request, path, params = {}) {
  const url = new URL(request.url);
  url.pathname = path;
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return new Request(url, request);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.hostname === "www.yzhdentallab.com") return Response.redirect(`https://yzhdentallab.com${url.pathname}${url.search}`, 301);
    const handler = handlers[url.pathname];
    if (url.pathname === "/api/video-process") return videoUnsupported(request);
    if (handler) return invoke(request, env, handler);
    if (publicPages[url.pathname]) return invoke(routedRequest(request, "/api/public-page", { page: publicPages[url.pathname] }), env, publicPage);
    if (url.pathname.startsWith("/cases/") && url.pathname.length > "/cases/".length) return invoke(routedRequest(request, "/api/case-page", { slug: decodeURIComponent(url.pathname.slice("/cases/".length)) }), env, casePage);
    if (adminPages[url.pathname]) return env.ASSETS.fetch(routedRequest(request, `/admin/${adminPages[url.pathname]}`));
    return env.ASSETS.fetch(request);
  },
};
