const assert = require("node:assert/strict");
const {
  INDEXNOW_KEY,
  INDEXNOW_KEY_LOCATION,
  isAllowedPublicUrl,
  submitIndexNow,
  verifyPublicUrl
} = require("../lib/indexnow");

const calls = [];
global.fetch = async (url, init = {}) => {
  calls.push({ url: String(url), init });
  if (String(url).endsWith("/robots.txt")) {
    return new Response("User-agent: *\nAllow: /\nSitemap: https://yzhdentallab.com/sitemap.xml\n", {
      status: 200,
      headers: { "content-type": "text/plain" }
    });
  }
  if (String(url) === "https://api.indexnow.org/indexnow") {
    const body = JSON.parse(init.body);
    assert.equal(body.host, "yzhdentallab.com");
    assert.equal(body.key, INDEXNOW_KEY);
    assert.equal(body.keyLocation, INDEXNOW_KEY_LOCATION);
    assert.deepEqual(body.urlList, ["https://yzhdentallab.com/exocad-design-outsourcing"]);
    return new Response("", { status: 202 });
  }
  if (String(url) === "https://yzhdentallab.com/exocad-design-outsourcing") {
    return new Response('<!doctype html><html><head><link rel="canonical" href="https://yzhdentallab.com/exocad-design-outsourcing"></head><body><main>Exocad Design Outsourcing</main></body></html>', {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" }
    });
  }
  return new Response("<!doctype html><title>404</title>", { status: 404, headers: { "content-type": "text/html" } });
};

assert.equal(isAllowedPublicUrl("https://yzhdentallab.com/exocad-design-outsourcing"), true);
assert.equal(isAllowedPublicUrl("https://yzhdentallab.com/cases/example-case"), true);
assert.equal(isAllowedPublicUrl("https://yzhdentallab.com/admin"), false);
assert.equal(isAllowedPublicUrl("https://yzhdentallab.com/api/cases"), false);
assert.equal(isAllowedPublicUrl("https://yzhdentallab.com/assets/site.css"), false);
assert.equal(isAllowedPublicUrl("https://www.yzhdentallab.com/exocad-design-outsourcing"), false);

(async () => {
  const verified = await verifyPublicUrl("https://yzhdentallab.com/exocad-design-outsourcing");
  assert.equal(verified.ok, true);
  const rejected = await verifyPublicUrl("https://yzhdentallab.com/not-found");
  assert.equal(rejected.ok, false);
  const submitted = await submitIndexNow([
    "https://yzhdentallab.com/exocad-design-outsourcing",
    "https://yzhdentallab.com/admin",
    "https://yzhdentallab.com/api/cases"
  ]);
  assert.equal(submitted.ok, true);
  assert.equal(submitted.status, 202);
  assert.deepEqual(submitted.submitted, ["https://yzhdentallab.com/exocad-design-outsourcing"]);
  console.log("indexnow tests passed");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
