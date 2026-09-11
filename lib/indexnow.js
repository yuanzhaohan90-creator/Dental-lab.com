const INDEXNOW_KEY = "1c1ccbcad674c4cc5654823f21c95a70";
const INDEXNOW_HOST = "yzhdentallab.com";
const INDEXNOW_KEY_LOCATION = `https://${INDEXNOW_HOST}/${INDEXNOW_KEY}.txt`;
const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";

const PUBLIC_STATIC_URLS = new Set([
  "/",
  "/implant-restorations",
  "/full-arch-all-on-x",
  "/cases",
  "/crown-bridge",
  "/digital-dentistry",
  "/services/digital-workflow",
  "/surgical-guides",
  "/about",
  "/submit-case",
  "/privacy-policy",
  "/terms",
  "/exocad-design-outsourcing",
  "/all-on-x-full-arch-cad-design",
  "/implant-bar-design",
  "/custom-abutment-implant-design",
  "/surgical-guide-design-outsourcing"
]);

function canonicalUrl(value) {
  const url = new URL(value, `https://${INDEXNOW_HOST}`);
  url.hash = "";
  url.search = "";
  if (url.hostname === `www.${INDEXNOW_HOST}`) url.hostname = INDEXNOW_HOST;
  return url.toString().replace(/\/$/, url.pathname === "/" ? "/" : "");
}

function isAllowedPublicUrl(value) {
  let url;
  try {
    url = new URL(value, `https://${INDEXNOW_HOST}`);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.hostname !== INDEXNOW_HOST) return false;
  if (url.search || url.hash) return false;
  if (url.pathname.startsWith("/admin") || url.pathname.startsWith("/api/")) return false;
  if (url.pathname.includes("/download-case-file")) return false;
  if (url.pathname.includes("/assets/") || url.pathname.includes("/cdn-cgi/")) return false;
  if (PUBLIC_STATIC_URLS.has(url.pathname)) return true;
  return url.pathname.startsWith("/cases/") && url.pathname.length > "/cases/".length;
}

async function verifyRobotsAllows(baseUrl = `https://${INDEXNOW_HOST}`) {
  try {
    const response = await fetch(`${baseUrl}/robots.txt`, { redirect: "follow" });
    if (!response.ok) return false;
    const text = await response.text();
    return !/^disallow:\s*\/\s*$/im.test(text);
  } catch {
    return false;
  }
}

function extractCanonical(html) {
  const match = html.match(/<link\s+rel=["']canonical["']\s+href=["']([^"']+)["']/i)
    || html.match(/<link\s+href=["']([^"']+)["']\s+rel=["']canonical["']/i);
  return match ? match[1] : "";
}

async function verifyPublicUrl(value) {
  const url = canonicalUrl(value);
  if (!isAllowedPublicUrl(url)) return { ok: false, url, reason: "URL is not an allowed public route." };
  const response = await fetch(url, {
    redirect: "follow",
    headers: { "User-Agent": "YZH-Dental-Lab-IndexNow/1.0" }
  });
  if (response.status !== 200) return { ok: false, url, reason: `HTTP ${response.status}` };
  if (/noindex/i.test(response.headers.get("x-robots-tag") || "")) return { ok: false, url, reason: "X-Robots-Tag is noindex." };
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/html")) return { ok: false, url, reason: `Unexpected content type: ${contentType}` };
  const html = await response.text();
  if (/Case Not Found|Page not found|<title>\s*404/i.test(html)) return { ok: false, url, reason: "Page body appears to be a 404." };
  if (/<meta[^>]+name=["']robots["'][^>]+content=["'][^"']*noindex/i.test(html)) return { ok: false, url, reason: "Page is noindex." };
  if (/x-robots-tag/i.test(html) && /noindex/i.test(html)) return { ok: false, url, reason: "Page has noindex directive." };
  const canonical = extractCanonical(html);
  if (canonical && canonicalUrl(canonical) !== url) return { ok: false, url, reason: `Canonical mismatch: ${canonical}` };
  return { ok: true, url };
}

async function submitIndexNow(urls, options = {}) {
  const input = Array.isArray(urls) ? urls : [urls];
  const unique = [...new Set(input.map(canonicalUrl))].filter(isAllowedPublicUrl);
  if (!unique.length) return { ok: true, submitted: [], skipped: input.length, status: 0 };
  const robotsOk = options.skipRobotsCheck ? true : await verifyRobotsAllows();
  if (!robotsOk) return { ok: false, submitted: [], skipped: unique.length, status: 0, error: "robots.txt could not be verified." };
  const verified = [];
  const rejected = [];
  for (const url of unique) {
    try {
      const result = await verifyPublicUrl(url);
      if (result.ok) verified.push(result.url);
      else rejected.push(result);
    } catch (error) {
      rejected.push({ ok: false, url, reason: error.message || "Verification failed." });
    }
  }
  if (!verified.length) return { ok: false, submitted: [], rejected, status: 0, error: "No URLs passed verification." };
  const response = await fetch(INDEXNOW_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      host: INDEXNOW_HOST,
      key: INDEXNOW_KEY,
      keyLocation: INDEXNOW_KEY_LOCATION,
      urlList: verified
    })
  });
  return {
    ok: response.status >= 200 && response.status < 300,
    status: response.status,
    submitted: verified,
    rejected
  };
}

function submitIndexNowSoon(urls) {
  return submitIndexNow(urls).catch((error) => {
    console.warn("indexnow_submit_failed", error?.message || error);
    return { ok: false, error: error?.message || "IndexNow submission failed." };
  });
}

function caseUrl(record) {
  if (!record || record.status !== "published" || !record.slug) return "";
  return `https://${INDEXNOW_HOST}/cases/${encodeURIComponent(record.slug)}`;
}

module.exports = {
  INDEXNOW_KEY,
  INDEXNOW_KEY_LOCATION,
  caseUrl,
  isAllowedPublicUrl,
  submitIndexNow,
  submitIndexNowSoon,
  verifyPublicUrl
};
