const Busboy = require("busboy");
const { hasValidOrigin, isAdmin } = require("../lib/case-auth");
const {
  CATEGORIES,
  IMAGE_TYPES,
  deletePaths,
  deleteUnreferencedPaths,
  deleteRecord,
  duplicateRecordData,
  getRecord,
  listRecords,
  makeId,
  normalizeFields,
  saveRecord,
  storeImage,
  uniqueSlug
} = require("../lib/case-store");

const MAX_TOTAL_BYTES = 20 * 1024 * 1024;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

function reply(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

function query(req, key) {
  if (req.query && req.query[key]) return String(req.query[key]);
  return new URL(req.url, "https://yzhdentallab.com").searchParams.get(key) || "";
}

function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    if (!String(req.headers["content-type"] || "").includes("multipart/form-data")) {
      return reject(Object.assign(new Error("Multipart form data is required."), { statusCode: 400 }));
    }
    const fields = {};
    const files = [];
    let total = 0;
    const busboy = Busboy({ headers: req.headers, limits: { files: 30, fields: 20, fileSize: MAX_IMAGE_BYTES } });
    req.on("error", reject);
    req.on("data", (chunk) => {
      total += chunk.length;
      if (total > MAX_TOTAL_BYTES) req.destroy(Object.assign(new Error("Upload is larger than 20MB."), { statusCode: 413 }));
    });
    busboy.on("field", (name, value) => { fields[name] = value; });
    busboy.on("file", (field, stream, info) => {
      if (!info.filename) return stream.resume();
      const chunks = [];
      let limited = false;
      stream.on("limit", () => { limited = true; });
      stream.on("data", (chunk) => chunks.push(chunk));
      stream.on("end", () => {
        if (limited) return reject(Object.assign(new Error("Each image must be 10MB or smaller."), { statusCode: 413 }));
        files.push({ field, filename: info.filename, contentType: String(info.mimeType || "").toLowerCase(), buffer: Buffer.concat(chunks) });
      });
    });
    busboy.on("error", reject);
    busboy.on("finish", () => resolve({ fields, files }));
    req.pipe(busboy);
  });
}

function safeJson(value, fallback) {
  try { return JSON.parse(value || ""); } catch { return fallback; }
}

function adminRecord(record) {
  return {
    ...record,
    images: record.images.map(({ pathname, contentType, ...image }) => ({
      ...image,
      url: `/api/case-image?caseId=${encodeURIComponent(record.id)}&imageId=${encodeURIComponent(image.id)}`
    }))
  };
}

async function writeCase(req, isUpdate) {
  const { fields, files } = await parseMultipart(req);
  const input = safeJson(fields.case, {});
  const existing = safeJson(fields.existingImages, []);
  const newImageMeta = safeJson(fields.newImageMeta, []);
  const current = isUpdate ? await getRecord(input.id) : null;
  if (isUpdate && !current) throw Object.assign(new Error("Case not found."), { statusCode: 404 });

  const id = current ? current.id : makeId("CASE");
  const now = new Date().toISOString();
  const fieldsNormalized = normalizeFields(input);
  const record = {
    id,
    slug: await uniqueSlug(fieldsNormalized.title, id),
    ...fieldsNormalized,
    images: [],
    createdAt: current ? current.createdAt : now,
    updatedAt: now,
    publishedAt: fieldsNormalized.status === "published" ? (current?.publishedAt || now) : null
  };

  const keepIds = new Set(existing.map((item) => item.id));
  if (current) {
    for (const oldImage of current.images) {
      const incoming = existing.find((item) => item.id === oldImage.id);
      if (!incoming) continue;
      record.images.push({
        ...oldImage,
        caption: String(incoming.caption || "").trim().slice(0, 240),
        imageType: IMAGE_TYPES.includes(incoming.imageType) ? incoming.imageType : "Other",
        sortOrder: Number(incoming.sortOrder) || 0,
        isCover: Boolean(incoming.isCover)
      });
    }
  }

  const coverFile = files.find((file) => file.field === "coverImage");
  const galleryFiles = files.filter((file) => file.field === "galleryImages");
  const uploadedPaths = [];
  try {
    if (coverFile) {
      record.images.forEach((image) => { image.isCover = false; });
      const cover = await storeImage(id, coverFile, { caption: input.coverCaption || "", imageType: "Final", sortOrder: -1 }, true);
      record.images.push(cover);
      uploadedPaths.push(cover.pathname);
    }
    for (let index = 0; index < galleryFiles.length; index += 1) {
      const image = await storeImage(id, galleryFiles[index], newImageMeta[index] || { sortOrder: record.images.length + index }, false);
      record.images.push(image);
      uploadedPaths.push(image.pathname);
    }
    record.images.sort((a, b) => a.sortOrder - b.sortOrder).forEach((image, index) => { image.sortOrder = image.isCover ? -1 : index; });
    await saveRecord(record);
  } catch (error) {
    await deletePaths(uploadedPaths).catch(() => {});
    throw error;
  }

  if (current) {
    const removed = current.images.filter((image) => !keepIds.has(image.id) || (coverFile && image.isCover)).map((image) => image.pathname);
    await deleteUnreferencedPaths(removed);
  }
  return record;
}

async function duplicateCase(id) {
  const source = await getRecord(id);
  if (!source) throw Object.assign(new Error("Case not found."), { statusCode: 404 });
  const newId = makeId("CASE");
  const now = new Date().toISOString();
  const title = `Copy of ${source.title}`.slice(0, 160);
  const record = duplicateRecordData(source, {
    id: newId,
    slug: await uniqueSlug(title, newId),
    now
  });
  await saveRecord(record);
  return record;
}

module.exports = async function handler(req, res) {
  if (!isAdmin(req)) return reply(res, 401, { ok: false, error: "Authentication required." });
  if (!["GET", "HEAD"].includes(req.method) && !hasValidOrigin(req)) return reply(res, 403, { ok: false, error: "Invalid request origin." });
  try {
    if (req.method === "GET") {
      const id = query(req, "id");
      if (id) {
        const record = await getRecord(id);
        return record ? reply(res, 200, { ok: true, case: adminRecord(record), categories: CATEGORIES, imageTypes: IMAGE_TYPES }) : reply(res, 404, { ok: false, error: "Case not found." });
      }
      const records = await listRecords();
      return reply(res, 200, { ok: true, cases: records.map(adminRecord), categories: CATEGORIES, imageTypes: IMAGE_TYPES });
    }
    if (req.method === "POST" && query(req, "action") === "duplicate") {
      const record = await duplicateCase(query(req, "id"));
      return reply(res, 201, { ok: true, case: adminRecord(record) });
    }
    if (req.method === "POST" || req.method === "PUT") {
      const record = await writeCase(req, req.method === "PUT");
      return reply(res, req.method === "POST" ? 201 : 200, { ok: true, case: adminRecord(record) });
    }
    if (req.method === "DELETE") {
      const record = await getRecord(query(req, "id"));
      if (!record) return reply(res, 404, { ok: false, error: "Case not found." });
      await deleteRecord(record);
      return reply(res, 200, { ok: true });
    }
    res.setHeader("Allow", "GET, POST, PUT, DELETE");
    return reply(res, 405, { ok: false, error: "Method not allowed." });
  } catch (error) {
    console.error("admin_cases_error", error);
    return reply(res, error.statusCode || 500, { ok: false, error: error.statusCode ? error.message : "The case manager could not complete this request." });
  }
};
