const { DEFAULT_HOMEPAGE, DEFAULT_SETTINGS, getConfig, getMedia } = require("../lib/admin-store");
const { listRecords, publicRecord } = require("../lib/case-store");

async function mediaUrl(id, fallback) {
  if (!id) return fallback;
  const record = await getMedia(id);
  return record ? `/api/media-image?id=${encodeURIComponent(id)}` : fallback;
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.statusCode = 405;
    return res.end("GET required");
  }
  try {
    const [homepageConfig, settingsConfig, cases] = await Promise.all([
      getConfig("homepage", DEFAULT_HOMEPAGE),
      getConfig("settings", DEFAULT_SETTINGS),
      listRecords()
    ]);
    const homepage = structuredClone(homepageConfig.published || DEFAULT_HOMEPAGE);
    const settings = structuredClone(settingsConfig.published || DEFAULT_SETTINGS);
    homepage.hero.imageUrl = await mediaUrl(homepage.hero.imageMediaId, homepage.hero.imagePath);
    settings.defaultOgImageUrl = await mediaUrl(settings.defaultOgMediaId, settings.defaultOgImagePath);
    const featured = cases.filter((item) => item.status === "published" && item.featured);
    const orderedIds = homepage.selectedWork.caseIds || [];
    featured.sort((a, b) => {
      const left = orderedIds.indexOf(a.id);
      const right = orderedIds.indexOf(b.id);
      return (left === -1 ? 999 : left) - (right === -1 ? 999 : right);
    });
    const selectedCases = featured.slice(0, 3).map((item) => publicRecord(item));
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    return res.end(JSON.stringify({ ok: true, homepage, settings, selectedCases }));
  } catch (error) {
    console.error("public_site_error", error);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    return res.end(JSON.stringify({ ok: false, error: "Published site content is temporarily unavailable." }));
  }
};
