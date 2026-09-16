const { defaultPublicSiteData, getPublicSiteData } = require("../lib/public-site-data");
const { PAGE_TEMPLATES, renderPublicPage } = require("../lib/public-page-renderer");

const SEO_KEY_BY_PAGE = {
  home: "home",
  services: "services",
  workflow: "workflow",
  implant: "implant",
  fullArch: "fullArch",
  cases: "cases",
  crownBridge: "crownBridge",
  digital: "digital",
  designOnly: "designOnly",
  surgicalGuides: "surgicalGuides",
  about: "about",
  submitCase: "submitCase",
  privacy: "privacy",
  terms: "terms"
};

function query(req, key) {
  if (req.query && req.query[key]) return String(req.query[key]);
  return new URL(req.url, "https://yzhdentallab.com").searchParams.get(key) || "";
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.statusCode = 405;
    res.setHeader("Allow", "GET");
    return res.end("Method not allowed");
  }
  const page = query(req, "page");
  if (!PAGE_TEMPLATES[page]) {
    res.statusCode = 404;
    return res.end("Page not found");
  }
  let data;
  let dataLoadFailed = false;
  try {
    data = await getPublicSiteData();
  } catch (error) {
    dataLoadFailed = true;
    data = defaultPublicSiteData();
    console.warn("public_page_data_fallback", error?.message || error);
  }
  const adminPreview = Boolean(query(req, "adminPreview"));
  const html = renderPublicPage(page, data, { dataLoadFailed, adminPreview });
  const seo = data.seo?.[SEO_KEY_BY_PAGE[page]];
  const robotsHeader = adminPreview || seo?.noindex
    ? `noindex, ${seo?.nofollow || adminPreview ? "nofollow" : "follow"}`
    : "all";
  res.statusCode = 200;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", query(req, "adminPreview") || dataLoadFailed ? "private, no-store" : "public, s-maxage=30, stale-while-revalidate=300");
  res.setHeader("X-Robots-Tag", robotsHeader);
  return res.end(html);
};
