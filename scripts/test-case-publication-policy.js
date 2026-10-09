const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const policy = require("../assets/case-publication-policy");
const { duplicateRecordData } = require("../lib/case-store");
const browser = {};
vm.runInNewContext(fs.readFileSync("cloudflare-public/assets/case-publication-policy.js", "utf8"), browser);
assert.equal(fs.readFileSync("assets/case-publication-policy.js", "utf8"), fs.readFileSync("cloudflare-public/assets/case-publication-policy.js", "utf8"));
const incomplete = { title: "implant", category: "Crown & Bridge", status: "published", images: [{ id: "IMG-QA", isCover: true, altText: "" }] };
const complete = { ...incomplete, title: "QA TEST Implant Restoration", material: "QA TEST material", technicalSummary: "QA TEST summary", seoTitle: "QA TEST", metaDescription: "QA TEST description", images: [{ id: "IMG-QA", isCover: true, altText: "QA TEST image" }] };
const scenarios = [
  { name: "legacy published edit", record: incomplete, current: incomplete, allowed: true },
  { name: "legacy hidden restore", record: incomplete, current: { ...incomplete, status: "hidden", firstPublishedAt: "2026-01-01" }, allowed: true },
  { name: "legacy draft restore", record: incomplete, current: { ...incomplete, status: "draft", firstPublishedAt: "2026-01-01" }, allowed: true },
  { name: "new incomplete first publish", record: incomplete, current: { status: "draft" }, allowed: false },
  { name: "new complete first publish", record: complete, current: { status: "draft" }, allowed: true },
  { name: "forged client history", record: { ...incomplete, hasBeenPublished: true, firstPublishedAt: "2026-01-01" }, current: { status: "draft" }, allowed: false }
];
for (const scenario of scenarios) {
  const server = policy.publicationErrors(scenario.record, scenario.current);
  const client = browser.CasePublicationPolicy.publicationErrors(scenario.record, scenario.current);
  assert.equal(JSON.stringify(server), JSON.stringify(client));
  assert.equal(!server.length, scenario.allowed, scenario.name);
  console.log(`PASS ${scenario.name}: frontend/backend agree`);
}
const copy = duplicateRecordData({ ...complete, firstPublishedAt: "2026-01-01", hasBeenPublished: true, previousStatus: "published" }, { id: "CASE-QA-COPY", slug: "qa-copy", now: "2026-10-09" });
assert.equal(policy.hasPublicationHistory(copy), false);
console.log("PASS copied cases do not inherit publication exemptions");

const worker = fs.readFileSync("_worker.js", "utf8");
const shellFunction = worker.slice(worker.indexOf("async function adminShellResponse"), worker.indexOf("function routedRequest"));
const shellContext = { Request, Response, Headers, routedRequest: (request, route) => new Request(new URL(route, request.url), request) };
vm.runInNewContext(shellFunction, shellContext);
shellContext.adminShellResponse(new Request("http://localhost/admin/cases", { headers: { "If-None-Match": "old-shell", "If-Modified-Since": "Wed, 01 Jan 2025 00:00:00 GMT" } }), {
  ASSETS: { fetch: async request => {
    assert.equal(new URL(request.url).pathname, "/admin-shell.html");
    assert.equal(request.headers.has("If-None-Match"), false);
    assert.equal(request.headers.has("If-Modified-Since"), false);
    return new Response("<html>Admin shell</html>", { headers: { ETag: "shell" } });
  } }
}).then(async response => {
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "<html>Admin shell</html>");
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal(response.headers.has("ETag"), false);
  console.log("PASS conditional admin refresh cannot produce a blank 200");
}).catch(error => { console.error(error); process.exitCode = 1; });
