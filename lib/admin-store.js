const crypto = require("crypto");

const CONFIG_PREFIX = "admin/config/";
const MEDIA_RECORD_PREFIX = "admin/media/records/";
const MEDIA_FILE_PREFIX = "admin/media/files/";
const SUBMISSION_STATUS_PREFIX = "admin/submission-status/";
const SUBMISSION_PREFIX = "cases/";
const MEDIA_CATEGORIES = ["Cases", "Products", "Lab", "Homepage", "Other"];
const MEDIA_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp"]);

const DEFAULT_HOMEPAGE = {
  hero: {
    eyebrow: "Digital dental lab in China for overseas partners",
    heading: "Complex Implant Cases. Solved.",
    description: "Implant restorations, full-arch and CAD/CAM support for overseas dental laboratories and clinics.",
    imageMediaId: "",
    imagePath: "/assets/real/hero-full-arch-premium-01.jpg",
    primaryLabel: "Send a Trial Case",
    primaryDestination: "/submit-case",
    secondaryLabel: "WhatsApp Technical Team",
    secondaryDestination: "https://wa.me/8613714730109"
  },
  selectedWork: {
    eyebrow: "Selected Complex Implant & Full-Arch Work",
    heading: "Three areas where technical review matters most.",
    description: "Large implant and full-arch cases need clear records, component matching and design decisions before production starts.",
    caseIds: []
  }
};

const DEFAULT_SETTINGS = {
  companyName: "YZH Dental Lab",
  publicEmail: "yzhdentallab@gmail.com",
  whatsapp: "+86 137 1473 0109",
  whatsappUrl: "https://wa.me/8613714730109",
  phone: "+86 137 1473 0109",
  location: "China",
  defaultSeoTitle: "YZH Dental Lab | Complex Implant, Full-Arch & CAD/CAM Support",
  defaultSeoDescription: "YZH Dental Lab supports overseas dental laboratories and clinics with complex implant restorations, full-arch cases and CAD/CAM production from China.",
  defaultOgMediaId: "",
  defaultOgImagePath: "/assets/real/hero-full-arch-premium-01.jpg"
};

let blobPromise;
function blob() {
  blobPromise ||= import("@vercel/blob");
  return blobPromise;
}

function cleanText(value, max = 5000) {
  return String(value || "").trim().slice(0, max);
}

function makeAdminId(prefix) {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
}

async function streamText(stream) {
  return new Response(stream).text();
}

async function readPrivateJson(pathname) {
  const { get } = await blob();
  const result = await get(pathname, { access: "private", useCache: false });
  if (!result || result.statusCode !== 200 || !result.stream) return null;
  return JSON.parse(await streamText(result.stream));
}

async function writePrivateJson(pathname, value) {
  const { put } = await blob();
  await put(pathname, JSON.stringify(value, null, 2), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
    cacheControlMaxAge: 0
  });
  return value;
}

async function listPrivateJson(prefix) {
  const { list } = await blob();
  const records = [];
  let cursor;
  do {
    const result = await list({ prefix, limit: 100, cursor });
    const batch = await Promise.all(result.blobs.filter((item) => item.pathname.endsWith(".json")).map((item) => readPrivateJson(item.pathname)));
    records.push(...batch.filter(Boolean));
    cursor = result.hasMore ? result.cursor : undefined;
  } while (cursor);
  return records;
}

async function deletePrivatePaths(paths) {
  const clean = [...new Set(paths.filter(Boolean))];
  if (!clean.length) return;
  const { del } = await blob();
  await del(clean);
}

function normalizeHomepage(input = {}) {
  const hero = input.hero || {};
  const selectedWork = input.selectedWork || {};
  return {
    hero: {
      eyebrow: cleanText(hero.eyebrow || DEFAULT_HOMEPAGE.hero.eyebrow, 160),
      heading: cleanText(hero.heading || DEFAULT_HOMEPAGE.hero.heading, 160),
      description: cleanText(hero.description || DEFAULT_HOMEPAGE.hero.description, 500),
      imageMediaId: cleanText(hero.imageMediaId, 100),
      imagePath: cleanText(hero.imagePath || DEFAULT_HOMEPAGE.hero.imagePath, 300),
      primaryLabel: cleanText(hero.primaryLabel || DEFAULT_HOMEPAGE.hero.primaryLabel, 80),
      primaryDestination: cleanText(hero.primaryDestination || DEFAULT_HOMEPAGE.hero.primaryDestination, 300),
      secondaryLabel: cleanText(hero.secondaryLabel || DEFAULT_HOMEPAGE.hero.secondaryLabel, 80),
      secondaryDestination: cleanText(hero.secondaryDestination || DEFAULT_HOMEPAGE.hero.secondaryDestination, 300)
    },
    selectedWork: {
      eyebrow: cleanText(selectedWork.eyebrow || DEFAULT_HOMEPAGE.selectedWork.eyebrow, 160),
      heading: cleanText(selectedWork.heading || DEFAULT_HOMEPAGE.selectedWork.heading, 200),
      description: cleanText(selectedWork.description || DEFAULT_HOMEPAGE.selectedWork.description, 500),
      caseIds: [...new Set(Array.isArray(selectedWork.caseIds) ? selectedWork.caseIds.map((id) => cleanText(id, 100)).filter(Boolean) : [])].slice(0, 3)
    }
  };
}

function normalizeSettings(input = {}) {
  return {
    companyName: cleanText(input.companyName || DEFAULT_SETTINGS.companyName, 120),
    publicEmail: cleanText(input.publicEmail || DEFAULT_SETTINGS.publicEmail, 200),
    whatsapp: cleanText(input.whatsapp || DEFAULT_SETTINGS.whatsapp, 80),
    whatsappUrl: cleanText(input.whatsappUrl || DEFAULT_SETTINGS.whatsappUrl, 300),
    phone: cleanText(input.phone || DEFAULT_SETTINGS.phone, 80),
    location: cleanText(input.location || DEFAULT_SETTINGS.location, 160),
    defaultSeoTitle: cleanText(input.defaultSeoTitle || DEFAULT_SETTINGS.defaultSeoTitle, 180),
    defaultSeoDescription: cleanText(input.defaultSeoDescription || DEFAULT_SETTINGS.defaultSeoDescription, 320),
    defaultOgMediaId: cleanText(input.defaultOgMediaId, 100),
    defaultOgImagePath: cleanText(input.defaultOgImagePath || DEFAULT_SETTINGS.defaultOgImagePath, 300)
  };
}

async function getConfig(name, defaults) {
  const stored = await readPrivateJson(`${CONFIG_PREFIX}${name}.json`);
  if (!stored) return { draft: structuredClone(defaults), published: structuredClone(defaults), previous: null, updatedAt: null, publishedAt: null };
  return stored;
}

async function saveConfigDraft(name, defaults, value, normalize) {
  const current = await getConfig(name, defaults);
  const now = new Date().toISOString();
  return writePrivateJson(`${CONFIG_PREFIX}${name}.json`, { ...current, draft: normalize(value), updatedAt: now });
}

async function publishConfig(name, defaults, normalize) {
  const current = await getConfig(name, defaults);
  const now = new Date().toISOString();
  return writePrivateJson(`${CONFIG_PREFIX}${name}.json`, {
    draft: normalize(current.draft),
    published: normalize(current.draft),
    previous: normalize(current.published),
    updatedAt: now,
    publishedAt: now
  });
}

async function restoreConfig(name, defaults, normalize) {
  const current = await getConfig(name, defaults);
  if (!current.previous) throw Object.assign(new Error("No previous published version is available."), { statusCode: 400 });
  const now = new Date().toISOString();
  return writePrivateJson(`${CONFIG_PREFIX}${name}.json`, {
    draft: normalize(current.previous),
    published: normalize(current.previous),
    previous: normalize(current.published),
    updatedAt: now,
    publishedAt: now
  });
}

function normalizeMediaRecord(input = {}) {
  return {
    displayName: cleanText(input.displayName, 160),
    altText: cleanText(input.altText, 240),
    category: MEDIA_CATEGORIES.includes(input.category) ? input.category : "Other"
  };
}

function mediaExtension(filename) {
  const match = /\.([^.]+)$/.exec(filename || "");
  return match ? match[1].toLowerCase() : "";
}

async function storeMediaFile(file, metadata) {
  const ext = mediaExtension(file.filename);
  if (!MEDIA_EXTENSIONS.has(ext) || !/^image\/(jpeg|png|webp)$/.test(file.contentType)) {
    throw Object.assign(new Error("Only JPG, PNG and WebP images are accepted."), { statusCode: 400 });
  }
  const id = makeAdminId("MEDIA");
  const pathname = `${MEDIA_FILE_PREFIX}${id}.${ext === "jpeg" ? "jpg" : ext}`;
  const now = new Date().toISOString();
  const normalized = normalizeMediaRecord(metadata);
  const { put } = await blob();
  await put(pathname, file.buffer, {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: false,
    contentType: file.contentType,
    cacheControlMaxAge: 31536000
  });
  const record = {
    id,
    pathname,
    contentType: file.contentType,
    originalFilename: cleanText(file.filename, 160),
    size: file.buffer.length,
    ...normalized,
    createdAt: now,
    updatedAt: now
  };
  await writePrivateJson(`${MEDIA_RECORD_PREFIX}${id}.json`, record);
  return record;
}

async function listMedia() {
  const records = await listPrivateJson(MEDIA_RECORD_PREFIX);
  return records.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

async function getMedia(id) {
  if (!/^MEDIA-[A-Z0-9-]+$/.test(String(id || ""))) return null;
  return readPrivateJson(`${MEDIA_RECORD_PREFIX}${id}.json`);
}

async function saveMedia(record) {
  const normalized = normalizeMediaRecord(record);
  const next = { ...record, ...normalized, updatedAt: new Date().toISOString() };
  await writePrivateJson(`${MEDIA_RECORD_PREFIX}${record.id}.json`, next);
  return next;
}

async function deleteMedia(record) {
  await deletePrivatePaths([record.pathname, `${MEDIA_RECORD_PREFIX}${record.id}.json`]);
}

async function mediaUsage(id) {
  const [homepage, settings] = await Promise.all([
    getConfig("homepage", DEFAULT_HOMEPAGE),
    getConfig("settings", DEFAULT_SETTINGS)
  ]);
  const usage = [];
  for (const [label, value] of [["Homepage draft hero", homepage.draft?.hero?.imageMediaId], ["Homepage published hero", homepage.published?.hero?.imageMediaId], ["Settings draft OG image", settings.draft?.defaultOgMediaId], ["Settings published OG image", settings.published?.defaultOgMediaId]]) {
    if (value === id) usage.push(label);
  }
  return usage;
}

function validCaseId(caseId) {
  return /^YZH-\d{12}-[A-F0-9]{6}$/.test(String(caseId || ""));
}

async function listSubmissions() {
  const submissions = await listPrivateJson(SUBMISSION_PREFIX);
  const metadata = submissions.filter((item) => validCaseId(item.caseId));
  const statuses = await listPrivateJson(SUBMISSION_STATUS_PREFIX);
  const statusMap = new Map(statuses.map((item) => [item.caseId, item.status]));
  return metadata.map((item) => ({ ...item, status: statusMap.get(item.caseId) || "New" })).sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
}

async function getSubmission(caseId) {
  if (!validCaseId(caseId)) return null;
  const item = await readPrivateJson(`${SUBMISSION_PREFIX}${caseId}/submission.json`);
  if (!item) return null;
  const status = await readPrivateJson(`${SUBMISSION_STATUS_PREFIX}${caseId}.json`);
  return { ...item, status: status?.status || "New" };
}

async function saveSubmissionStatus(caseId, status) {
  if (!validCaseId(caseId)) throw Object.assign(new Error("Submission not found."), { statusCode: 404 });
  if (!["New", "Reviewed", "Archived"].includes(status)) throw Object.assign(new Error("Invalid submission status."), { statusCode: 400 });
  const value = { caseId, status, updatedAt: new Date().toISOString() };
  return writePrivateJson(`${SUBMISSION_STATUS_PREFIX}${caseId}.json`, value);
}

module.exports = {
  DEFAULT_HOMEPAGE,
  DEFAULT_SETTINGS,
  MEDIA_CATEGORIES,
  deleteMedia,
  getConfig,
  getMedia,
  getSubmission,
  listMedia,
  listSubmissions,
  mediaUsage,
  normalizeHomepage,
  normalizeSettings,
  publishConfig,
  readPrivateJson,
  restoreConfig,
  saveConfigDraft,
  saveMedia,
  saveSubmissionStatus,
  storeMediaFile
};
