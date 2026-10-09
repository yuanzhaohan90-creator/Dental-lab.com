const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const imageResponse = require("../lib/cloudflare-case-image");
const { createSession } = require("../lib/case-auth");

(async () => {
  const bytes = new Uint8Array(2119657).fill(71);
  let reads = [];
  let status = "published";
  let missing = false;
  let malformed = false;
  let body;
  const bucket = {
    async get(key) {
      reads.push(key);
      if (key.endsWith(".json")) {
        if (missing) return null;
        return { async json() {
          if (malformed) throw new SyntaxError("Invalid case JSON");
          return { status, images: [{ id: "IMG-TEST", pathname: "case-library/images/test", contentType: "image/png" }] };
        } };
      }
      body = new ReadableStream({ start(controller) { controller.enqueue(bytes); controller.close(); } });
      return { body, size: bytes.length, httpEtag: '"test-etag"', httpMetadata: { contentType: "image/png" } };
    }
  };
  const url = "https://test.invalid/api/case-image?caseId=CASE-TEST&imageId=IMG-TEST";
  const env = { MEDIA_BUCKET: bucket };
  const response = await imageResponse(new Request(url), env);
  assert.equal(response.status, 200);
  assert.equal(response.body, body, "R2 body must be passed through, not buffered");
  assert.equal(response.headers.get("Content-Type"), "image/png");
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal(response.headers.get("ETag"), '"test-etag"');
  assert.equal(response.headers.get("Content-Length"), String(bytes.length));
  const digest = value => crypto.createHash("sha256").update(value).digest("hex");
  assert.equal(digest(Buffer.from(await response.arrayBuffer())), digest(bytes));
  assert.equal(reads.length, 2);
  assert.equal((await imageResponse(new Request(url, { method: "POST" }), env)).status, 405);
  assert.equal((await imageResponse(new Request(url.replace("CASE-TEST", "../invalid")), env)).status, 404);
  assert.equal((await imageResponse(new Request(url.replace("IMG-TEST", "IMG-MISSING")), env)).status, 404);
  missing = true;
  assert.equal((await imageResponse(new Request(url), env)).status, 404);
  missing = false;
  status = "draft";
  assert.equal((await imageResponse(new Request(url), env)).status, 404);
  const previous = process.env.CASE_SESSION_SECRET;
  process.env.CASE_SESSION_SECRET = crypto.randomBytes(32).toString("hex");
  try {
    assert.equal((await imageResponse(new Request(url, { headers: { Cookie: `yzh_case_admin=${createSession()}` } }), env)).status, 200);
  } finally {
    if (previous === undefined) delete process.env.CASE_SESSION_SECRET;
    else process.env.CASE_SESSION_SECRET = previous;
  }
  malformed = true;
  assert.equal((await imageResponse(new Request(url), env)).status, 500);
  const store = require("../lib/case-store");
  const adminStore = require("../lib/admin-store");
  const originalList = store.listRecords;
  const originalConfig = adminStore.getConfig;
  const pagePath = require.resolve("../api/case-page");
  let lists = 0;
  try {
    store.listRecords = async () => { lists++; return []; };
    adminStore.getConfig = async () => ({ published: {} });
    delete require.cache[pagePath];
    const page = require(pagePath);
    const result = { setHeader() {}, end() {} };
    await page({ method: "GET", query: { slug: "missing-case" }, headers: {} }, result);
    assert.equal(result.statusCode, 404);
    assert.equal(lists, 1, "Case detail must load the case collection only once");
  } finally {
    store.listRecords = originalList;
    adminStore.getConfig = originalConfig;
    delete require.cache[pagePath];
  }
  console.log("Cloudflare image streaming, byte integrity, status and session tests passed.");
})().catch(error => { console.error(error); process.exitCode = 1; });
