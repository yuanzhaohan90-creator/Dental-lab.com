const Busboy = require("busboy");
const { isAdmin } = require("../lib/case-auth");
const { protect, query, readJson, reply } = require("../lib/admin-http");
const { MAX_MEDIA_BYTES } = require("../lib/media-validation");
const { getPublicSiteData } = require("../lib/public-site-data");
const { isR2Backend, storageClient } = require("../lib/object-store");
const {
  DEFAULT_HOMEPAGE,
  DEFAULT_PAGE_CONFIGS,
  DEFAULT_SETTINGS,
  MEDIA_CATEGORIES,
  assertPublishableMedia,
  isValidLinkedInUrl,
  deleteSubmissionFiles,
  deleteMedia,
  getConfig,
  getMedia,
  getSubmission,
  listMedia,
  listSubmissions,
  mediaUsage,
  normalizeHomepage,
  normalizePageConfig,
  normalizeSettings,
  permanentlyDeleteSubmission,
  publishConfig,
  restoreConfig,
  restoreMedia,
  restoreSubmission,
  saveConfigDraft,
  saveMedia,
  saveSubmissionStatus,
  storeClientMedia,
  storeMediaFile,
  trashMedia,
  trashSubmission,
  updateMediaReferences
} = require("../lib/admin-store");
const { listRecords, publicRecord, saveRecord } = require("../lib/case-store");

function route(req) {
  return query(req, "module") || "";
}

function parseUpload(req) {
  return new Promise((resolve, reject) => {
    if (!String(req.headers["content-type"] || "").includes("multipart/form-data")) return reject(Object.assign(new Error("Multipart form data is required."), { statusCode: 400 }));
    const fields = {};
    let file = null;
    const busboy = Busboy({ headers: req.headers, limits: { files: 1, fields: 10, fileSize: 10 * 1024 * 1024 } });
    busboy.on("field", (name, value) => { fields[name] = value; });
    busboy.on("file", (field, stream, info) => {
      if (!info.filename) return stream.resume();
      const chunks = [];
      let limited = false;
      stream.on("limit", () => { limited = true; });
      stream.on("data", (chunk) => chunks.push(chunk));
      stream.on("end", () => {
        if (limited) return reject(Object.assign(new Error("Image must be 10MB or smaller."), { statusCode: 413 }));
        file = { filename: info.filename, contentType: String(info.mimeType || "").toLowerCase(), buffer: Buffer.concat(chunks) };
      });
    });
    busboy.on("error", reject);
    busboy.on("finish", () => file ? resolve({ fields, file }) : reject(Object.assign(new Error("Choose an image to upload."), { statusCode: 400 })));
    req.pipe(busboy);
  });
}

function adminSubmission(item, detail = false) {
  const totalFileSize = (item.files || []).reduce((sum, file) => sum + (Number(file.size) || 0), 0);
  const base = {
    caseId: item.caseId,
    submittedAt: item.submittedAt,
    status: item.status,
    fields: item.fields || {},
    fileCount: item.files?.length || 0,
    totalFileSize,
    trashedAt: item.trashedAt || "",
    trashExpiresAt: item.trashExpiresAt || "",
    filesDeletedAt: item.filesDeletedAt || ""
  };
  if (!detail) return base;
  return {
    ...base,
    files: (item.files || []).map((file, index) => ({
      index,
      originalName: file.originalName,
      filename: file.filename,
      size: file.size,
      contentType: file.contentType,
      downloadUrl: `/api/admin?module=submission-file&caseId=${encodeURIComponent(item.caseId)}&file=${index}`
    }))
  };
}

function safeDownloadName(value) {
  return String(value || "download").replace(/[\r\n"\\/]+/g, "-").slice(0, 160);
}

async function adminMedia(record) {
  const usedIn = await mediaUsage(record.id);
  const mediaType = String(record.contentType || "").startsWith("video/") ? "video" : "image";
  const posterUrl = record.posterMediaId
    ? `/api/admin?module=media-image&id=${encodeURIComponent(record.posterMediaId)}`
    : record.posterPathname ? `/api/admin?module=media-image&id=${encodeURIComponent(record.id)}&variant=poster` : "";
  return { ...record, pathname: undefined, originalPathname: undefined, playbackPathname: undefined, mediaType, url: `/api/admin?module=media-image&id=${encodeURIComponent(record.id)}`, posterUrl, processingStatus: record.processingStatus || "ready", usedIn };
}

async function validateSelection(value) {
  const ids = value?.selectedWork?.caseIds || [];
  if (!Array.isArray(ids)) throw Object.assign(new Error("Selected cases must be a list."), { statusCode: 400 });
  if (ids.length > 3) throw Object.assign(new Error("Select no more than three homepage cases."), { statusCode: 400 });
  const cleanIds = ids.map((id) => String(id || "").trim()).filter(Boolean);
  if (cleanIds.length > 3) throw Object.assign(new Error("Select no more than three homepage cases."), { statusCode: 400 });
  if (new Set(cleanIds).size !== cleanIds.length) throw Object.assign(new Error("Each Selected Work slot must use a different case."), { statusCode: 400 });
  const cases = await listRecords();
  const published = new Set(cases.filter((item) => item.status === "published").map((item) => item.id));
  if (cleanIds.some((id) => !published.has(id))) throw Object.assign(new Error("Homepage work must use published cases."), { statusCode: 400 });
}

function pageConfig(page) {
  const defaults = DEFAULT_PAGE_CONFIGS[page];
  if (!defaults) throw Object.assign(new Error("Page editor not found."), { statusCode: 404 });
  return { defaults, name: `page-${page}`, normalize: (value) => normalizePageConfig(page, value) };
}

async function validatePageCases(page, value) {
  const ids = [];
  if (page === "implant" && value?.featuredWork?.caseId) ids.push([value.featuredWork.caseId, false]);
  if (page === "fullArch") {
    if (value?.featuredCase?.caseId) ids.push([value.featuredCase.caseId, true]);
    for (const option of value?.restorationOptions || []) if (option.caseId) ids.push([option.caseId, false]);
  }
  if (!ids.length) return;
  const records = await listRecords();
  for (const [id, caseStudyRequired] of ids) {
    const record = records.find((item) => item.id === id && item.status === "published");
    if (!record) throw Object.assign(new Error("Featured work must use a Published case."), { statusCode: 400 });
    if (caseStudyRequired && record.contentType !== "case_study") throw Object.assign(new Error("Featured Full-Arch Case must use a Published Case Study."), { statusCode: 400 });
  }
}

async function syncFeaturedCases(ids) {
  const selected = new Set(ids);
  const cases = await listRecords();
  for (const item of cases.filter((record) => record.featured && !selected.has(record.id))) {
    await saveRecord({ ...item, featured: false, updatedAt: new Date().toISOString() });
  }
  for (const id of ids) {
    const item = cases.find((record) => record.id === id);
    if (item && !item.featured) await saveRecord({ ...item, featured: true, updatedAt: new Date().toISOString() });
  }
}

async function homepageData(config) {
  const cases = await listRecords();
  return { config, publishedCases: cases.filter((item) => item.status === "published").map((item) => publicRecord(item)) };
}

async function mediaUrl(id, fallback) {
  if (!id) return fallback;
  const record = await getMedia(id);
  if (!record || record.trashedAt) return fallback;
  if (String(record.contentType || "").startsWith("video/") && (record.processingStatus || "ready") !== "ready") return fallback;
  return `/api/admin?module=media-image&id=${encodeURIComponent(id)}`;
}

async function resolveMedia(slot = {}) {
  const record = slot.mediaId ? await getMedia(slot.mediaId) : null;
  if (record?.trashedAt) return { ...slot, url: slot.fallbackPath, mediaType: "image", posterUrl: "", processingStatus: "ready" };
  const videoReady = record && String(record.contentType || "").startsWith("video/") && (record.processingStatus || "ready") === "ready";
  const posterId = slot.posterMediaId || record?.posterMediaId;
  const posterUrl = posterId
    ? await mediaUrl(posterId, "")
    : record?.posterPathname ? `/api/admin?module=media-image&id=${encodeURIComponent(record.id)}&variant=poster` : "";
  const mediaUrlValue = await mediaUrl(slot.mediaId, slot.fallbackPath);
  return {
    ...slot,
    url: record && String(record.contentType || "").startsWith("video/") && !videoReady ? (posterUrl || slot.fallbackPath) : mediaUrlValue,
    mediaType: record && String(record.contentType || "").startsWith("video/") ? (videoReady ? "video" : "image") : slot.mediaType,
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

async function handleDashboard(req, res) {
  if (req.method !== "GET") return reply(res, 405, { ok: false, error: "Method not allowed." });
  const [cases, submissions] = await Promise.all([listRecords(), listSubmissions()]);
  const published = cases.filter((item) => item.status === "published");
  const drafts = cases.filter((item) => item.status !== "published");
  const fresh = submissions.filter((item) => item.status === "New");
  const activeSubmissions = submissions.filter((item) => item.status !== "Trash");
  return reply(res, 200, {
    ok: true,
    counts: { publishedCases: published.length, draftCases: drafts.length, newSubmissions: fresh.length },
    recentSubmissions: activeSubmissions.slice(0, 5).map((item) => ({ caseId: item.caseId, submittedAt: item.submittedAt, name: item.fields?.name || "", company: item.fields?.company || "", caseType: item.fields?.case_type || "", status: item.status })),
    recentPublished: published.slice(0, 5).map((item) => ({ id: item.id, title: item.title, category: item.category, publishedAt: item.publishedAt }))
  });
}

async function handleSubmissions(req, res) {
  if (req.method === "GET") {
    const id = query(req, "id");
    if (id) {
      const item = await getSubmission(id);
      return item ? reply(res, 200, { ok: true, submission: adminSubmission(item, true) }) : reply(res, 404, { ok: false, error: "Submission not found." });
    }
    const items = await listSubmissions();
    const summaries = items.map((item) => adminSubmission(item));
    return reply(res, 200, {
      ok: true,
      submissions: summaries,
      storage: {
        privateCustomerFiles: summaries.filter((item) => item.status !== "Trash").reduce((sum, item) => sum + item.totalFileSize, 0),
        trash: summaries.filter((item) => item.status === "Trash").reduce((sum, item) => sum + item.totalFileSize, 0)
      }
    });
  }
  if (req.method === "PUT") {
    const body = await readJson(req);
    await saveSubmissionStatus(body.caseId, body.status);
    const item = await getSubmission(body.caseId);
    return reply(res, 200, { ok: true, submission: adminSubmission(item, true) });
  }
  return reply(res, 405, { ok: false, error: "Method not allowed." });
}

async function handleSubmissionManage(req, res) {
  if (req.method !== "POST") return reply(res, 405, { ok: false, error: "Method not allowed." });
  const body = await readJson(req);
  const caseId = String(body.caseId || "");
  const submission = await getSubmission(caseId);
  if (!submission) return reply(res, 404, { ok: false, error: "Submission not found." });
  if (body.action === "archive") {
    await saveSubmissionStatus(caseId, "Archived");
    return reply(res, 200, { ok: true, submission: adminSubmission(await getSubmission(caseId), true) });
  }
  if (body.action === "trash") return reply(res, 200, { ok: true, submission: adminSubmission(await trashSubmission(caseId), true) });
  if (body.action === "restore") {
    await restoreSubmission(caseId);
    return reply(res, 200, { ok: true, submission: adminSubmission(await getSubmission(caseId), true) });
  }
  if (body.action === "delete-files") return reply(res, 200, { ok: true, submission: adminSubmission(await deleteSubmissionFiles(caseId), true) });
  if (body.action === "permanent-delete") {
    if (submission.status !== "Trash") return reply(res, 409, { ok: false, error: "Move the submission to Trash before permanent deletion." });
    await permanentlyDeleteSubmission(caseId);
    return reply(res, 200, { ok: true });
  }
  return reply(res, 400, { ok: false, error: "Invalid submission action." });
}

async function handleSubmissionFile(req, res) {
  if (req.method !== "GET") {
    res.statusCode = 405;
    return res.end("GET required");
  }
  const submission = await getSubmission(query(req, "caseId"));
  const index = Number(query(req, "file"));
  const file = submission?.files?.[index];
  if (!file || !file.pathname) {
    res.statusCode = 404;
    return res.end("File not found");
  }
  const { get } = await storageClient();
  const result = await get(file.pathname, { access: "private", useCache: false });
  if (!result || result.statusCode !== 200 || !result.stream) {
    res.statusCode = 404;
    return res.end("File not found");
  }
  res.statusCode = 200;
  res.setHeader("Content-Type", file.contentType || "application/octet-stream");
  res.setHeader("Content-Length", String(file.size || result.blob.size));
  res.setHeader("Content-Disposition", `attachment; filename="${safeDownloadName(file.filename || file.originalName)}"`);
  res.setHeader("Cache-Control", "private, no-store");
  const reader = result.stream.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    res.write(Buffer.from(value));
  }
  return res.end();
}

async function handleMedia(req, res) {
  if (req.method === "GET") {
    const trash = query(req, "view") === "trash";
    const records = await listMedia({ trash });
    const active = trash ? await listMedia() : records;
    return reply(res, 200, {
      ok: true,
      media: await Promise.all(records.map(adminMedia)),
      categories: MEDIA_CATEGORIES,
      storage: {
        publicMedia: active.reduce((sum, item) => sum + (Number(item.size) || 0), 0),
        trash: (trash ? records : await listMedia({ trash: true })).reduce((sum, item) => sum + (Number(item.size) || 0), 0)
      }
    });
  }
  if (req.method === "POST") {
    const { fields, file } = await parseUpload(req);
    const record = await storeMediaFile(file, fields);
    return reply(res, 201, { ok: true, media: await adminMedia(record) });
  }
  if (req.method === "PUT") {
    const body = await readJson(req);
    const record = await getMedia(body.id);
    if (!record) return reply(res, 404, { ok: false, error: "Media item not found." });
    const saved = await saveMedia({ ...record, displayName: body.displayName, altText: body.altText, category: body.category, posterMediaId: body.posterMediaId });
    return reply(res, 200, { ok: true, media: await adminMedia(saved) });
  }
  if (req.method === "DELETE") {
    const record = await getMedia(query(req, "id"));
    if (!record) return reply(res, 404, { ok: false, error: "Media item not found." });
    const usedIn = await mediaUsage(record.id);
    if (usedIn.length) return reply(res, 409, { ok: false, error: "This media is currently in use.", usedIn });
    await trashMedia(record);
    return reply(res, 200, { ok: true, trashed: true });
  }
  return reply(res, 405, { ok: false, error: "Method not allowed." });
}

async function handleMediaManage(req, res) {
  if (req.method !== "POST") return reply(res, 405, { ok: false, error: "Method not allowed." });
  const body = await readJson(req);
  const action = String(body.action || "");
  if (action === "bulk-trash") {
    const ids = [...new Set((Array.isArray(body.ids) ? body.ids : []).map(String))];
    const moved = [];
    const conflicts = [];
    for (const id of ids) {
      const record = await getMedia(id);
      if (!record || record.trashedAt) continue;
      const usedIn = await mediaUsage(id);
      if (usedIn.length) conflicts.push({ id, displayName: record.displayName || record.originalFilename, usedIn });
      else { await trashMedia(record); moved.push(id); }
    }
    return reply(res, 200, { ok: true, moved, conflicts });
  }
  const record = await getMedia(String(body.id || ""));
  if (!record) return reply(res, 404, { ok: false, error: "Media item not found." });
  if (action === "restore") {
    if (!record.trashedAt) return reply(res, 400, { ok: false, error: "Media item is not in Trash." });
    return reply(res, 200, { ok: true, media: await adminMedia(await restoreMedia(record)) });
  }
  if (action === "permanent-delete") {
    if (!record.trashedAt) return reply(res, 409, { ok: false, error: "Move media to Trash before permanent deletion." });
    await deleteMedia(record);
    return reply(res, 200, { ok: true });
  }
  const usedIn = await mediaUsage(record.id);
  if (action === "trash") {
    if (usedIn.length) return reply(res, 409, { ok: false, error: "This media is currently in use.", usedIn });
    return reply(res, 200, { ok: true, media: await adminMedia(await trashMedia(record)) });
  }
  if (!["replace-delete", "remove-delete"].includes(action)) return reply(res, 400, { ok: false, error: "Invalid media action." });
  const usageIds = Array.isArray(body.usageIds) ? body.usageIds : [];
  if (usageIds.length !== usedIn.length || usedIn.some((item) => !usageIds.includes(item.id))) {
    return reply(res, 409, { ok: false, error: "Resolve every current usage before moving this media to Trash.", usedIn });
  }
  await updateMediaReferences({ mediaId: record.id, usageIds, replacementId: body.replacementId, mode: action === "replace-delete" ? "replace" : "remove" });
  const remaining = await mediaUsage(record.id);
  if (remaining.length) return reply(res, 409, { ok: false, error: "Some media usages still need review.", usedIn: remaining });
  return reply(res, 200, { ok: true, media: await adminMedia(await trashMedia(record, usedIn)) });
}

async function handleMediaUpload(req, res) {
  if (req.method !== "POST") return reply(res, 405, { ok: false, error: "Method not allowed." });
  const body = await readJson(req);
  const { handleUpload } = require("@vercel/blob/client");
  const result = await handleUpload({
    request: req,
    body,
    onBeforeGenerateToken: async (pathname, clientPayload) => {
      if (!isAdmin(req)) throw Object.assign(new Error("Authentication required."), { statusCode: 401 });
      if (!String(pathname || "").startsWith("admin/media/files/")) throw Object.assign(new Error("Invalid media path."), { statusCode: 400 });
      let metadata = {};
      try { metadata = JSON.parse(clientPayload || "{}"); } catch { metadata = {}; }
      const size = Number(metadata.size) || 0;
      if (size > MAX_MEDIA_BYTES) throw Object.assign(new Error("Video is larger than 100 MB."), { statusCode: 413 });
      return {
        allowedContentTypes: ["image/jpeg", "image/png", "image/webp", "image/svg+xml", "video/mp4", "video/quicktime", "video/x-m4v", "application/octet-stream"],
        maximumSizeInBytes: MAX_MEDIA_BYTES,
        addRandomSuffix: true,
        allowOverwrite: false,
        cacheControlMaxAge: 31536000
      };
    }
  });
  return reply(res, 200, result);
}

async function handleMediaFinalize(req, res) {
  if (req.method !== "POST") return reply(res, 405, { ok: false, error: "Method not allowed." });
  const body = await readJson(req);
  const { get } = await import("@vercel/blob");
  const pathname = String(body?.blob?.pathname || "");
  if (!pathname.startsWith("admin/media/files/")) throw Object.assign(new Error("Uploaded media is not valid."), { statusCode: 400 });
  const stored = await get(pathname, { access: "private", useCache: false });
  if (!stored || stored.statusCode !== 200) throw Object.assign(new Error("Uploaded media could not be verified."), { statusCode: 400 });
  const reader = stored.stream.getReader();
  const chunks = [];
  let total = 0;
  while (total < 1024 * 1024) {
    const { done, value } = await reader.read();
    if (done) break;
    const remaining = 1024 * 1024 - total;
    const chunk = value.length > remaining ? value.subarray(0, remaining) : value;
    chunks.push(Buffer.from(chunk));
    total += chunk.length;
  }
  await reader.cancel().catch(() => {});
  try {
    if (isR2Backend()) {
      const source = await get(pathname, { access: "private", useCache: false });
      if (!source?.stream) throw Object.assign(new Error("Uploaded media could not be copied to R2."), { statusCode: 502 });
      const destination = await storageClient();
      await destination.put(pathname, source.stream, {
        access: "private",
        addRandomSuffix: false,
        allowOverwrite: true,
        contentLength: stored.blob.size,
        contentType: stored.blob.contentType,
        cacheControlMaxAge: 31536000
      });
    }
    const record = await storeClientMedia(body.blob, body.metadata || {}, { bytes: Buffer.concat(chunks), size: stored.blob.size, contentType: stored.blob.contentType });
    return reply(res, 201, { ok: true, media: await adminMedia(record) });
  } catch (error) {
    if (isR2Backend()) {
      const destination = await storageClient();
      await destination.del(pathname).catch(() => {});
    } else {
      const { del } = await import("@vercel/blob");
      await del(pathname).catch(() => {});
    }
    throw error;
  }
}

async function handleMediaImage(req, res) {
  if (req.method !== "GET") {
    res.statusCode = 405;
    return res.end("GET required");
  }
  const record = await getMedia(query(req, "id"));
  if (!record) {
    res.statusCode = 404;
    return res.end("Media not found");
  }
  if (record.trashedAt && !isAdmin(req)) {
    res.statusCode = 404;
    return res.end("Media not found");
  }
  const isVideo = String(record.contentType || "").startsWith("video/");
  const isReady = (record.processingStatus || "ready") === "ready";
  const posterRequest = query(req, "variant") === "poster";
  if (posterRequest && !record.posterPathname) {
    res.statusCode = 404;
    return res.end("Poster not found");
  }
  if (isVideo && !isReady && !isAdmin(req)) {
    res.statusCode = 425;
    return res.end("Video is still being prepared for web playback");
  }
  const pathname = posterRequest
    ? record.posterPathname
    : isVideo ? (record.playbackPathname || (isReady ? record.pathname : record.originalPathname || record.pathname)) : record.pathname;
  const { get } = await storageClient();
  const result = await get(pathname, { access: "private" });
  if (!result || result.statusCode !== 200 || !result.stream) {
    res.statusCode = 404;
    return res.end("Media not found");
  }
  res.statusCode = 200;
  const responseType = posterRequest ? (record.posterContentType || "image/jpeg") : isVideo && isReady ? (record.playbackContentType || "video/mp4") : record.contentType;
  const responseSize = posterRequest ? record.posterSize : isVideo && isReady ? (record.playbackSize || record.size) : record.size;
  res.setHeader("Content-Type", responseType);
  if (responseType === "image/svg+xml") res.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; sandbox");
  if (responseSize) res.setHeader("Content-Length", String(responseSize));
  res.setHeader("Content-Disposition", "inline");
  res.setHeader("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400");
  const reader = result.stream.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    res.write(Buffer.from(value));
  }
  return res.end();
}

async function handleHomepage(req, res) {
  if (req.method === "GET") {
    const current = await getConfig("homepage", DEFAULT_HOMEPAGE);
    const config = { ...current, draft: normalizeHomepage(current.draft), published: normalizeHomepage(current.published), previous: current.previous ? normalizeHomepage(current.previous) : null };
    return reply(res, 200, { ok: true, ...(await homepageData(config)), preview: await resolvePageMedia(config.draft) });
  }
  if (req.method === "PUT") {
    const body = await readJson(req);
    await validateSelection(body);
    const incomingIds = body?.selectedWork?.caseIds;
    if (Array.isArray(incomingIds) && incomingIds.filter(Boolean).length > 3) {
      throw Object.assign(new Error("Select no more than three homepage cases."), { statusCode: 400 });
    }
    const saved = await saveConfigDraft("homepage", DEFAULT_HOMEPAGE, body, normalizeHomepage);
    return reply(res, 200, { ok: true, ...(await homepageData(saved)) });
  }
  if (req.method === "POST") {
    const action = query(req, "action");
    const current = await getConfig("homepage", DEFAULT_HOMEPAGE);
    const target = action === "restore" ? current.previous : current.draft;
    if (!target) throw Object.assign(new Error("No previous published version is available."), { statusCode: 400 });
    await validateSelection(target);
    await assertPublishableMedia(target);
    await syncFeaturedCases(target.selectedWork.caseIds);
    const saved = action === "restore" ? await restoreConfig("homepage", DEFAULT_HOMEPAGE, normalizeHomepage) : await publishConfig("homepage", DEFAULT_HOMEPAGE, normalizeHomepage);
    return reply(res, 200, { ok: true, ...(await homepageData(saved)) });
  }
  return reply(res, 405, { ok: false, error: "Method not allowed." });
}

async function handlePageEditor(req, res) {
  const page = query(req, "page");
  if (page === "home") return handleHomepage(req, res);
  const { defaults, name, normalize } = pageConfig(page);
  if (req.method === "GET") {
    const current = await getConfig(name, defaults);
    const config = { ...current, draft: normalize(current.draft), published: normalize(current.published), previous: current.previous ? normalize(current.previous) : null };
    const cases = (await listRecords()).filter((item) => item.status === "published").map((item) => publicRecord(item));
    return reply(res, 200, { ok: true, page, config, preview: await resolvePageMedia(config.draft), publishedCases: cases });
  }
  if (req.method === "PUT") {
    const body = await readJson(req);
    await validatePageCases(page, body);
    const saved = await saveConfigDraft(name, defaults, body, normalize);
    return reply(res, 200, { ok: true, page, config: saved });
  }
  if (req.method === "POST") {
    const action = query(req, "action");
    const current = await getConfig(name, defaults);
    const target = action === "restore" ? current.previous : current.draft;
    if (!target) throw Object.assign(new Error("No previous published version is available."), { statusCode: 400 });
    await validatePageCases(page, target);
    await assertPublishableMedia(target);
    const saved = action === "restore" ? await restoreConfig(name, defaults, normalize) : await publishConfig(name, defaults, normalize);
    return reply(res, 200, { ok: true, page, config: saved });
  }
  return reply(res, 405, { ok: false, error: "Method not allowed." });
}

async function handleSettings(req, res) {
  if (req.method === "GET") {
    const current = await getConfig("settings", DEFAULT_SETTINGS);
    return reply(res, 200, { ok: true, settings: {
      ...current,
      draft: normalizeSettings(current.draft),
      published: normalizeSettings(current.published),
      previous: current.previous ? normalizeSettings(current.previous) : null
    } });
  }
  if (req.method === "PUT") {
    const body = await readJson(req);
    if (!isValidLinkedInUrl(body.linkedinUrl)) throw Object.assign(new Error("Enter a full LinkedIn profile or company URL beginning with https://www.linkedin.com/in/ or /company/."), { statusCode: 400 });
    for (const key of ["primaryLogoMediaId", "darkLogoMediaId", "faviconMediaId", "defaultOgMediaId"]) {
      if (!body[key]) continue;
      const media = await getMedia(body[key]);
      if (!media || media.trashedAt || String(media.contentType || "").startsWith("video/")) throw Object.assign(new Error("Branding and social images must use an active image from Media Library."), { statusCode: 400 });
    }
    const saved = await saveConfigDraft("settings", DEFAULT_SETTINGS, body, normalizeSettings);
    return reply(res, 200, { ok: true, settings: saved });
  }
  if (req.method === "POST") {
    const action = query(req, "action");
    const saved = action === "restore" ? await restoreConfig("settings", DEFAULT_SETTINGS, normalizeSettings) : await publishConfig("settings", DEFAULT_SETTINGS, normalizeSettings);
    return reply(res, 200, { ok: true, settings: saved });
  }
  return reply(res, 405, { ok: false, error: "Method not allowed." });
}

async function handlePublicSite(req, res) {
  if (req.method !== "GET") {
    res.statusCode = 405;
    return res.end("GET required");
  }
  const data = await getPublicSiteData();
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  return res.end(JSON.stringify(data));
}

module.exports = async function handler(req, res) {
  const moduleName = route(req);
  const publicModules = new Set(["public-site", "media-image"]);
  if (!publicModules.has(moduleName) && !protect(req, res)) return;
  if (moduleName === "submission-file" && !isAdmin(req)) {
    res.statusCode = 401;
    return res.end("Authentication required");
  }
  try {
    if (moduleName === "dashboard") return await handleDashboard(req, res);
    if (moduleName === "submissions") return await handleSubmissions(req, res);
    if (moduleName === "submission-manage") return await handleSubmissionManage(req, res);
    if (moduleName === "submission-file") return await handleSubmissionFile(req, res);
    if (moduleName === "media") return await handleMedia(req, res);
    if (moduleName === "media-manage") return await handleMediaManage(req, res);
    if (moduleName === "media-upload") return await handleMediaUpload(req, res);
    if (moduleName === "media-finalize") return await handleMediaFinalize(req, res);
    if (moduleName === "media-image") return await handleMediaImage(req, res);
    if (moduleName === "homepage") return await handleHomepage(req, res);
    if (moduleName === "page-editor") return await handlePageEditor(req, res);
    if (moduleName === "settings") return await handleSettings(req, res);
    if (moduleName === "public-site") return await handlePublicSite(req, res);
    return reply(res, 404, { ok: false, error: "Admin module not found." });
  } catch (error) {
    console.error("admin_v1_error", moduleName, error);
    if (moduleName === "media-image" || moduleName === "submission-file") {
      res.statusCode = error.statusCode || 500;
      return res.end(error.statusCode ? error.message : "Request failed");
    }
    return reply(res, error.statusCode || 500, { ok: false, error: error.statusCode ? error.message : "Admin request failed." });
  }
};
