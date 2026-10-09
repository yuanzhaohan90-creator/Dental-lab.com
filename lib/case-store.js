const crypto = require("crypto");
const { storageClient } = require("./object-store");
const { hasPublicationHistory } = require("../assets/case-publication-policy");

const RECORD_PREFIX = "case-library/records/";
const IMAGE_PREFIX = "case-library/images/";
const CATEGORIES = ["Full-Arch / All-on-X", "Implant Bridge", "Custom Abutment", "Crown & Bridge", "Veneers", "Surgical Guide", "Digital Design", "Removable / Denture"];
const IMAGE_TYPES = ["Before", "Scan", "Planning", "Design", "CAD", "Model", "Framework", "Ti-base", "PMMA", "Try-in", "Final", "QC", "Delivery", "Other"];
const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp"]);
const VIDEO_EXTENSIONS = new Set(["mp4", "m4v", "mov"]);

let blobPromise;
function blob() {
  blobPromise ||= storageClient();
  return blobPromise;
}

function cleanText(value, max = 5000) {
  return String(value || "").trim().slice(0, max);
}

function hasOwn(value, key) {
  return Boolean(value) && Object.prototype.hasOwnProperty.call(value, key);
}

function normalizeImageMetadata(input = {}, fallback = {}, index = 0) {
  const sortOrder = Number(hasOwn(input, "sortOrder") ? input.sortOrder : fallback.sortOrder);
  const imageType = hasOwn(input, "imageType") ? input.imageType : fallback.imageType;
  return {
    caption: cleanText(hasOwn(input, "caption") ? input.caption : fallback.caption, 240),
    altText: cleanText(hasOwn(input, "altText") ? input.altText : fallback.altText, 240),
    imageType: IMAGE_TYPES.includes(imageType) ? imageType : "Other",
    sortOrder: Number.isFinite(sortOrder) ? sortOrder : index,
    isCover: hasOwn(input, "isCover") ? Boolean(input.isCover) : Boolean(fallback.isCover)
  };
}

function mergeExistingImageMetadata(existingImages = [], submittedImages = []) {
  const submittedById = new Map(submittedImages.map((image) => [String(image?.id || ""), image]));
  return existingImages.flatMap((image, index) => {
    const submitted = submittedById.get(String(image.id || ""));
    if (!submitted) return [];
    return [{ ...image, ...normalizeImageMetadata(submitted, image, index) }];
  });
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
    technicalSummary: cleanText(input.technicalSummary, 700),
    planning: cleanText(input.planning),
    clinicalNotes: cleanText(input.clinicalNotes),
    workflow: cleanText(input.workflow),
    relatedCaseIds: Array.isArray(input.relatedCaseIds) ? input.relatedCaseIds.map((id) => cleanText(id, 80)).filter(Boolean).slice(0, 3) : [],
    seoTitle: cleanText(input.seoTitle, 180),
    metaDescription: cleanText(input.metaDescription, 320),
    software: cleanText(input.software, 160),
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
    status: ["published", "hidden", "archived", "trash"].includes(input.status) ? input.status : "draft",
    featured: Boolean(input.featured)
  };
}

function validateRecord(record) {
  const missing = [];
  if (!record.title) missing.push("Title");
  if (!record.category) missing.push("Category");
  if (!record.images.some((image) => image.isCover)) missing.push("Cover Image");
  const galleryCount = record.images.filter((image) => !image.isCover).length;
  if (record.contentType === "quick_work" && galleryCount > 30) {
    throw Object.assign(new Error("Quick Work supports up to 30 additional images or videos."), { statusCode: 400 });
  }
  if (missing.length) throw Object.assign(new Error(`Missing required fields: ${missing.join(", ")}`), { statusCode: 400 });
}

async function enforceFeaturedLimit(record) {
  if (!record.featured) return;
  const records = await listRecords();
  const count = records.filter((item) => item.id !== record.id && item.featured).length;
  if (count >= 9) throw Object.assign(new Error("Only nine cases can be Featured."), { statusCode: 400 });
}

async function saveRecord(record) {
  validateRecord(record);
  await enforceFeaturedLimit(record);
  if (record.status === "published" && !record.firstPublishedAt) record.firstPublishedAt = record.publishedAt || record.updatedAt || new Date().toISOString();
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
  const isImage = IMAGE_EXTENSIONS.has(ext) && /^image\/(jpeg|png|webp)$/.test(file.contentType);
  const isVideo = VIDEO_EXTENSIONS.has(ext) && /^video\/(mp4|x-m4v|quicktime)$/.test(file.contentType);
  if (!isImage && (!isVideo || isCover)) {
    throw Object.assign(new Error(isCover ? "Cover media must be a JPG, PNG or WebP image." : "Case gallery accepts JPG, PNG, WebP, MP4, M4V or MOV files."), { statusCode: 400 });
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
    altText: cleanText(metadata.altText, 240),
    imageType: IMAGE_TYPES.includes(metadata.imageType) ? metadata.imageType : "Other",
    sortOrder: Number.isFinite(Number(metadata.sortOrder)) ? Number(metadata.sortOrder) : 0,
    isCover,
    mediaType: isVideo ? "video" : "image"
  };
}

function mediaImage(media, metadata = {}, isCover = false) {
  const isVideo = String(media.contentType || "").startsWith("video/");
  if (isCover && isVideo) {
    throw Object.assign(new Error("Cover media must be a JPG, PNG or WebP image."), { statusCode: 400 });
  }
  if (isVideo && (media.processingStatus !== "ready" || !media.playbackPathname)) {
    throw Object.assign(new Error("A selected video is not ready for web playback. Retry processing or remove it before publishing."), { statusCode: 409 });
  }
  return {
    id: makeId("IMG"),
    mediaId: media.id,
    pathname: isVideo ? (media.playbackPathname || media.pathname) : media.pathname,
    contentType: isVideo ? (media.playbackContentType || media.contentType) : media.contentType,
    caption: cleanText(metadata.caption || media.displayName || media.originalFilename, 240),
    altText: cleanText(metadata.altText || media.altText || media.displayName || media.originalFilename, 240),
    imageType: IMAGE_TYPES.includes(metadata.imageType) ? metadata.imageType : "Other",
    sortOrder: Number.isFinite(Number(metadata.sortOrder)) ? Number(metadata.sortOrder) : 0,
    isCover,
    mediaType: isVideo ? "video" : "image"
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
  await deletePaths(candidates.filter((pathname) => !pathname.startsWith("admin/media/files/") && !referenced.has(pathname)));
}

async function deleteRecord(record) {
  await deleteUnreferencedPaths(record.images.map((image) => image.pathname), record.id);
  await deletePaths([`${RECORD_PREFIX}${record.id}.json`]);
}

async function trashRecord(record) {
  record = { ...record, firstPublishedAt: hasPublicationHistory(record) ? (record.firstPublishedAt || record.publishedAt || record.updatedAt) : null };
  const trashed = { ...record, status: "trash", featured: false, previousStatus: record.status === "trash" ? (record.previousStatus || "draft") : record.status, trashedAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  const { put } = await blob();
  await put(`${RECORD_PREFIX}${record.id}.json`, JSON.stringify(trashed, null, 2), { access: "private", addRandomSuffix: false, allowOverwrite: true, contentType: "application/json", cacheControlMaxAge: 0 });
  return trashed;
}

async function restoreRecord(record) {
  record = { ...record, firstPublishedAt: hasPublicationHistory(record) ? (record.firstPublishedAt || record.publishedAt || record.updatedAt) : null };
  const restored = { ...record, status: record.previousStatus === "published" ? "hidden" : (["draft", "hidden", "archived"].includes(record.previousStatus) ? record.previousStatus : "draft"), previousStatus: null, trashedAt: null, updatedAt: new Date().toISOString() };
  const { put } = await blob();
  await put(`${RECORD_PREFIX}${record.id}.json`, JSON.stringify(restored, null, 2), { access: "private", addRandomSuffix: false, allowOverwrite: true, contentType: "application/json", cacheControlMaxAge: 0 });
  return restored;
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
    publishedAt: null,
    firstPublishedAt: null,
    hasBeenPublished: false,
    previousStatus: null
  };
}

function publicImage(caseId, image) {
  const metadata = normalizeImageMetadata(image, image, 0);
  return {
    id: image.id,
    url: `/api/case-image?caseId=${encodeURIComponent(caseId)}&imageId=${encodeURIComponent(image.id)}`,
    caption: metadata.caption,
    altText: metadata.altText,
    imageType: metadata.imageType,
    sortOrder: metadata.sortOrder,
    isCover: metadata.isCover,
    mediaType: image.mediaType || (String(image.contentType || "").startsWith("video/") ? "video" : "image"),
    contentType: image.contentType || ""
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
    technicalSummary: record.technicalSummary || "",
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
    planning: record.planning || "",
    recordsReceived: record.recordsReceived || "",
    technicalReview: record.technicalReview,
    cadDesign: record.cadDesign || record.solution || "",
    provisional: record.provisional || "",
    framework: record.framework || "",
    finalRestoration: record.finalRestoration || "",
    qc: record.qc || "",
    technicalOutcome: record.technicalOutcome || record.result || "",
    clinicalNotes: record.clinicalNotes || "",
    workflow: record.workflow || "",
    seoTitle: record.seoTitle || "",
    metaDescription: record.metaDescription || "",
    software: record.software || "",
    relatedCaseIds: Array.isArray(record.relatedCaseIds) ? record.relatedCaseIds : [],
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
  restoreRecord,
  trashRecord,
  duplicateRecordData,
  getRecord,
  getRecordBySlug,
  listRecords,
  makeId,
  mediaImage,
  mergeExistingImageMetadata,
  normalizeFields,
  normalizeImageMetadata,
  publicRecord,
  saveRecord,
  storeImage,
  uniqueSlug,
  validateRecord
};
