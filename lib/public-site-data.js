const {
  DEFAULT_HOMEPAGE,
  DEFAULT_PAGE_CONFIGS,
  DEFAULT_SETTINGS,
  getConfig,
  getMedia,
  normalizeHomepage,
  normalizePageConfig,
  normalizeSettings
} = require("./admin-store");
const { listRecords, publicRecord } = require("./case-store");
const { canonicalPublicRecords, normalizePublicCase } = require("./public-cases");

const PUBLIC_MEDIA_REPLACEMENTS = new Map([
  ["/assets/real/implant-cad-workflow-04.jpg", "/assets/real/full-arch-cad-design-05.jpg"],
  ["/assets/real/cad-design-workstation-02.jpg", "/assets/real/full-arch-cad-design-05.jpg"]
]);

function safePublicPath(value) {
  return PUBLIC_MEDIA_REPLACEMENTS.get(String(value || "")) || value;
}

async function mediaUrl(id, fallback) {
  if (!id) return fallback;
  const record = await getMedia(id);
  if (!record || record.trashedAt) return fallback;
  if (String(record.contentType || "").startsWith("video/") && (record.processingStatus || "ready") !== "ready") return fallback;
  return `/api/admin?module=media-image&id=${encodeURIComponent(id)}`;
}

async function resolveMedia(slot = {}) {
  slot = { ...slot, fallbackPath: safePublicPath(slot.fallbackPath) };
  const record = slot.mediaId ? await getMedia(slot.mediaId) : null;
  if (record?.trashedAt) return { ...slot, url: slot.fallbackPath, mediaType: "image", posterUrl: "", processingStatus: "ready" };
  const isVideo = Boolean(record && String(record.contentType || "").startsWith("video/"));
  const videoReady = isVideo && (record.processingStatus || "ready") === "ready";
  const posterId = slot.posterMediaId || record?.posterMediaId;
  const posterUrl = posterId
    ? await mediaUrl(posterId, "")
    : record?.posterPathname ? `/api/admin?module=media-image&id=${encodeURIComponent(record.id)}&variant=poster` : "";
  const resolvedUrl = await mediaUrl(slot.mediaId, slot.fallbackPath);
  return {
    ...slot,
    url: isVideo && !videoReady ? (posterUrl || slot.fallbackPath) : resolvedUrl,
    mediaType: isVideo ? (videoReady ? "video" : "image") : slot.mediaType,
    posterUrl,
    processingStatus: record?.processingStatus || "ready"
  };
}

async function resolvePageMedia(value) {
  if (Array.isArray(value)) return Promise.all(value.map(resolvePageMedia));
  if (!value || typeof value !== "object") return value;
  if (Object.hasOwn(value, "mediaId") && Object.hasOwn(value, "fallbackPath")) return resolveMedia(value);
  const entries = await Promise.all(Object.entries(value).map(async ([key, child]) => [key, await resolvePageMedia(child)]));
  return Object.fromEntries(entries);
}

function defaultPublicSiteData() {
  const data = {
    ok: true,
    homepage: normalizeHomepage(DEFAULT_HOMEPAGE),
    pages: {
      implant: normalizePageConfig("implant", DEFAULT_PAGE_CONFIGS.implant),
      fullArch: normalizePageConfig("fullArch", DEFAULT_PAGE_CONFIGS.fullArch),
      about: normalizePageConfig("about", DEFAULT_PAGE_CONFIGS.about)
    },
    settings: {
      ...normalizeSettings(DEFAULT_SETTINGS),
      primaryLogoUrl: "",
      darkLogoUrl: "",
      faviconUrl: "/favicon.svg",
      defaultOgImageUrl: DEFAULT_SETTINGS.defaultOgImagePath
    },
    selectedCases: [],
    publishedCases: []
  };
  data.pages.about.hero.media.fallbackPath = "/assets/real/hero-production-floor-03.jpg";
  data.pages.about.cad.media.fallbackPath = "/assets/real/full-arch-cad-design-05.jpg";
  return data;
}

async function getPublicSiteData() {
  const [homepageConfig, implantConfig, fullArchConfig, aboutConfig, settingsConfig, records] = await Promise.all([
    getConfig("homepage", DEFAULT_HOMEPAGE),
    getConfig("page-implant", DEFAULT_PAGE_CONFIGS.implant),
    getConfig("page-fullArch", DEFAULT_PAGE_CONFIGS.fullArch),
    getConfig("page-about", DEFAULT_PAGE_CONFIGS.about),
    getConfig("settings", DEFAULT_SETTINGS),
    listRecords()
  ]);
  const homepage = normalizeHomepage(homepageConfig.published || DEFAULT_HOMEPAGE);
  const pages = {
    implant: normalizePageConfig("implant", implantConfig.published || DEFAULT_PAGE_CONFIGS.implant),
    fullArch: normalizePageConfig("fullArch", fullArchConfig.published || DEFAULT_PAGE_CONFIGS.fullArch),
    about: normalizePageConfig("about", aboutConfig.published || DEFAULT_PAGE_CONFIGS.about)
  };
  if (pages.about.hero?.media && !pages.about.hero.media.mediaId) {
    pages.about.hero.media.fallbackPath = "/assets/real/hero-production-floor-03.jpg";
  }
  const settings = normalizeSettings(settingsConfig.published || DEFAULT_SETTINGS);
  const canonicalRecords = canonicalPublicRecords(records);
  const publishedCases = canonicalRecords.map((record) => normalizePublicCase(publicRecord(record)));
  const orderedIds = homepage.selectedWork.caseIds || [];
  const selectedCases = canonicalRecords
    .filter((record) => record.featured)
    .sort((left, right) => {
      const leftIndex = orderedIds.indexOf(left.id);
      const rightIndex = orderedIds.indexOf(right.id);
      return (leftIndex === -1 ? 999 : leftIndex) - (rightIndex === -1 ? 999 : rightIndex);
    })
    .slice(0, 3)
    .map((record) => normalizePublicCase(publicRecord(record)));

  return {
    ok: true,
    homepage: await resolvePageMedia(homepage),
    pages: await resolvePageMedia(pages),
    settings: {
      ...settings,
      primaryLogoUrl: await mediaUrl(settings.primaryLogoMediaId, ""),
      darkLogoUrl: await mediaUrl(settings.darkLogoMediaId, ""),
      faviconUrl: await mediaUrl(settings.faviconMediaId, "/favicon.svg"),
      defaultOgImageUrl: await mediaUrl(settings.defaultOgMediaId, settings.defaultOgImagePath)
    },
    selectedCases,
    publishedCases
  };
}

module.exports = { defaultPublicSiteData, getPublicSiteData, resolvePageMedia };
