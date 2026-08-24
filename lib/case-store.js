const crypto = require("crypto");

const RECORD_PREFIX = "case-library/records/";
const IMAGE_PREFIX = "case-library/images/";
const CATEGORIES = ["Full-Arch / All-on-X", "Implant Bridge", "Custom Abutment", "Crown & Bridge", "Surgical Guide"];
const IMAGE_TYPES = ["CAD", "Model", "Framework", "Ti-base", "PMMA", "Try-in", "Final", "QC", "Other"];
const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp"]);

let blobPromise;
function blob() {
  blobPromise ||= import("@vercel/blob");
  return blobPromise;
}

function cleanText(value, max = 5000) {
  return String(value || "").trim().slice(0, max);
}

function slugify(value) {
  return cleanText(value, 120)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || `case-${Date.now()}`;
}

function extensionFor(filename) {
  const match = /\.([^.]+)$/.exec(filename || "");
  return match ? match[1].toLowerCase() : "";
}

function makeId(prefix) {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
}

async function streamText(stream) {
  return new Response(stream).text();
}

async function readJson(pathname) {
  const { get } = await blob();
  const result = await get(pathname, { access: "private", useCache: false });
  if (!result || result.statusCode !== 200 || !result.stream) return null;
  return JSON.parse(await streamText(result.stream));
}

async function listRecords() {
  const { list } = await blob();
  const records = [];
  let cursor;
  do {
    const result = await list({ prefix: RECORD_PREFIX, limit: 100, cursor });
    const batch = await Promise.all(result.blobs.filter((item) => item.pathname.endsWith(".json")).map((item) => readJson(item.pathname)));
    records.push(...batch.filter(Boolean));
    cursor = result.hasMore ? result.cursor : undefined;
  } while (cursor);
  return records.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

async function getRecord(id) {
  if (!/^[A-Z0-9-]+$/.test(String(id || ""))) return null;
  return readJson(`${RECORD_PREFIX}${id}.json`);
}

async function getRecordBySlug(slug) {
  const records = await listRecords();
  return records.find((record) => record.slug === slug) || null;
}

async function uniqueSlug(title, currentId) {
  const base = slugify(title);
  const records = await listRecords();
  let candidate = base;
  let counter = 2;
  while (records.some((record) => record.id !== currentId && record.slug === candidate)) candidate = `${base}-${counter++}`;
  return candidate;
}

function normalizeFields(input = {}) {
  const category = CATEGORIES.includes(input.category) ? input.category : "";
  const contentType = input.contentType === "case_study" ? "case_study" : "quick_work";
  return {
    contentType,
    title: cleanText(input.title, 160),
    category,
    shortNote: cleanText(input.shortNote || input.summary, 500),
    restorationType: cleanText(input.restorationType, 160),
    material: cleanText(input.material, 160),
    implantSystem: cleanText(input.implantSystem, 160),
    platform: cleanText(input.platform, 160),
    shade: cleanText(input.shade, 80),
    caseOverview: cleanText(input.caseOverview),
    challenge: cleanText(input.challenge),
    recordsReceived: cleanText(input.recordsReceived),
    technicalReview: cleanText(input.technicalReview),
    cadDesign: cleanText(input.cadDesign || input.solution),
    provisional: cleanText(input.provisional),
    framework: cleanText(input.framework),
    finalRestoration: cleanText(input.finalRestoration),
    qc: cleanText(input.qc),
    technicalOutcome: cleanText(input.technicalOutcome || input.result),
    tags: Array.isArray(input.tags) ? input.tags.map((tag) => cleanText(tag, 60)).filter(Boolean).slice(0, 20) : cleanText(input.tags, 500).split(",").map((tag) => tag.trim()).filter(Boolean).slice(0, 20),
    status: input.status === "published" ? "published" : "draft",
    featured: Boolean(input.featured)
  };
}

function validateRecord(record) {
  const missing = [];
  if (!record.title) missing.push("Title");
  if (!record.category) missing.push("Category");
  if (!record.images.some((image) => image.isCover)) missing.push("Cover Image");
  const galleryCount = record.images.filter((image) => !image.isCover).length;
  if (record.contentType === "quick_work" && galleryCount < 1) missing.push("At least one additional image");
  if (record.contentType === "quick_work" && galleryCount > 6) {
    throw Object.assign(new Error("Quick Work supports up to 6 additional images."), { statusCode: 400 });
  }
  if (missing.length) throw Object.assign(new Error(`Missing required fields: ${missing.join(", ")}`), { statusCode: 400 });
}

async function enforceFeaturedLimit(record) {
  if (!record.featured) return;
  const records = await listRecords();
  const count = records.filter((item) => item.id !== record.id && item.featured).length;
  if (count >= 3) throw Object.assign(new Error("Only three cases can be Featured."), { statusCode: 400 });
}

async function saveRecord(record) {
  validateRecord(record);
  await enforceFeaturedLimit(record);
  const { put } = await blob();
  await put(`${RECORD_PREFIX}${record.id}.json`, JSON.stringify(record, null, 2), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
    cacheControlMaxAge: 0
  });
  return record;
}

async function storeImage(caseId, file, metadata = {}, isCover = false) {
  const ext = extensionFor(file.filename);
  if (!IMAGE_EXTENSIONS.has(ext) || !/^image\/(jpeg|png|webp)$/.test(file.contentType)) {
    throw Object.assign(new Error("Only JPG, PNG and WebP case images are accepted."), { statusCode: 400 });
  }
  const id = makeId("IMG");
  const pathname = `${IMAGE_PREFIX}${caseId}/${id}.${ext === "jpeg" ? "jpg" : ext}`;
  const { put } = await blob();
  await put(pathname, file.buffer, {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: false,
    contentType: file.contentType,
    cacheControlMaxAge: 31536000
  });
  return {
    id,
    pathname,
    contentType: file.contentType,
    caption: cleanText(metadata.caption, 240),
    imageType: IMAGE_TYPES.includes(metadata.imageType) ? metadata.imageType : "Other",
    sortOrder: Number.isFinite(Number(metadata.sortOrder)) ? Number(metadata.sortOrder) : 0,
    isCover
  };
}

async function deletePaths(paths) {
  const clean = [...new Set(paths.filter(Boolean))];
  if (!clean.length) return;
  const { del } = await blob();
  await del(clean);
}

async function deleteUnreferencedPaths(paths, excludedRecordId = "") {
  const candidates = [...new Set(paths.filter(Boolean))];
  if (!candidates.length) return;
  const records = await listRecords();
  const referenced = new Set(records
    .filter((record) => record.id !== excludedRecordId)
    .flatMap((record) => record.images.map((image) => image.pathname)));
  await deletePaths(candidates.filter((pathname) => !referenced.has(pathname)));
}

async function deleteRecord(record) {
  await deleteUnreferencedPaths(record.images.map((image) => image.pathname), record.id);
  await deletePaths([`${RECORD_PREFIX}${record.id}.json`]);
}

function duplicateRecordData(source, { id, slug, now }) {
  return {
    ...source,
    id,
    slug,
    title: `Copy of ${source.title}`.slice(0, 160),
    status: "draft",
    featured: false,
    images: source.images.map((image) => ({ ...image, id: makeId("IMG") })),
    createdAt: now,
    updatedAt: now,
    publishedAt: null
  };
}

function publicImage(caseId, image) {
  return {
    id: image.id,
    url: `/api/case-image?caseId=${encodeURIComponent(caseId)}&imageId=${encodeURIComponent(image.id)}`,
    caption: image.caption,
    imageType: image.imageType,
    sortOrder: image.sortOrder,
    isCover: image.isCover
  };
}

function publicRecord(record, detail = false) {
  const cover = record.images.find((image) => image.isCover);
  const contentType = record.contentType === "case_study" ? "case_study" : "quick_work";
  const shortNote = record.shortNote || record.summary || "";
  const base = {
    id: record.id,
    slug: record.slug,
    title: record.title,
    category: record.category,
    contentType,
    shortNote,
    summary: shortNote || record.caseOverview || "",
    restorationType: record.restorationType || "",
    material: record.material,
    implantSystem: record.implantSystem || "",
    platform: record.platform || "",
    shade: record.shade || "",
    status: record.status,
    featured: record.featured,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    coverImage: cover ? publicImage(record.id, cover) : null
  };
  if (!detail) return base;
  return {
    ...base,
    restorationType: record.restorationType,
    implantSystem: record.implantSystem,
    platform: record.platform,
    shade: record.shade,
    caseOverview: record.caseOverview || "",
    challenge: record.challenge,
    recordsReceived: record.recordsReceived || "",
    technicalReview: record.technicalReview,
    cadDesign: record.cadDesign || record.solution || "",
    provisional: record.provisional || "",
    framework: record.framework || "",
    finalRestoration: record.finalRestoration || "",
    qc: record.qc || "",
    technicalOutcome: record.technicalOutcome || record.result || "",
    tags: record.tags,
    images: record.images.slice().sort((a, b) => a.sortOrder - b.sortOrder).map((image) => publicImage(record.id, image))
  };
}

module.exports = {
  CATEGORIES,
  IMAGE_TYPES,
  deletePaths,
  deleteUnreferencedPaths,
  deleteRecord,
  duplicateRecordData,
  getRecord,
  getRecordBySlug,
  listRecords,
  makeId,
  normalizeFields,
  publicRecord,
  saveRecord,
  storeImage,
  uniqueSlug,
  validateRecord
};
