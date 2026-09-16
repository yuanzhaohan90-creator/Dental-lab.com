const { SEO_PAGE_DEFINITIONS } = require("../lib/admin-store");
const { defaultPublicSiteData, getPublicSiteData } = require("../lib/public-site-data");

function xmlEscape(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function publicUrl(pathname) {
  return `https://yzhdentallab.com${pathname === "/" ? "/" : pathname}`;
}

async function loadData() {
  try {
    return await getPublicSiteData();
  } catch {
    return defaultPublicSiteData();
  }
}

async function sitemap() {
  const data = await loadData();
  const pageUrls = SEO_PAGE_DEFINITIONS
    .filter((page) => page.includeInSitemap !== false)
    .filter((page) => {
      const seo = data.seo?.[page.key];
      return !seo?.noindex && page.path !== "/404";
    })
    .map((page) => data.seo?.[page.key]?.canonicalUrl || publicUrl(page.path));
  const caseUrls = (data.publishedCases || []).map((item) => publicUrl(`/cases/${encodeURIComponent(item.slug)}`));
  const urls = [...new Set([...pageUrls, ...caseUrls])]
    .filter((url) => /^https:\/\/yzhdentallab\.com\//.test(url));
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((url) => `  <url><loc>${xmlEscape(url)}</loc></url>`).join("\n")}\n</urlset>\n`;
}

function robots() {
  return [
    "User-agent: *",
    "Allow: /",
    "Disallow: /admin/",
    "Disallow: /api/",
    "",
    "Sitemap: https://yzhdentallab.com/sitemap.xml",
    ""
  ].join("\n");
}

module.exports = async function handler(req, res) {
  const path = new URL(req.url, "https://yzhdentallab.com").pathname;
  if (req.method !== "GET") {
    res.statusCode = 405;
    return res.end("Method not allowed");
  }
  if (path === "/robots.txt") {
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "public, s-maxage=300");
    return res.end(robots());
  }
  if (path === "/sitemap.xml") {
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.setHeader("Cache-Control", "public, s-maxage=300");
    return res.end(await sitemap());
  }
  res.statusCode = 404;
  return res.end("Not found");
};
