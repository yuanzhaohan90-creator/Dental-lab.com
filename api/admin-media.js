const Busboy = require("busboy");
const { protect, query, readJson, reply } = require("../lib/admin-http");
const { MEDIA_CATEGORIES, deleteMedia, getMedia, listMedia, mediaUsage, saveMedia, storeMediaFile } = require("../lib/admin-store");

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

async function adminMedia(record) {
  const usedIn = await mediaUsage(record.id);
  return { ...record, pathname: undefined, url: `/api/media-image?id=${encodeURIComponent(record.id)}`, usedIn };
}

module.exports = async function handler(req, res) {
  if (!protect(req, res)) return;
  try {
    if (req.method === "GET") {
      const records = await listMedia();
      return reply(res, 200, { ok: true, media: await Promise.all(records.map(adminMedia)), categories: MEDIA_CATEGORIES });
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
      const saved = await saveMedia({ ...record, displayName: body.displayName, altText: body.altText, category: body.category });
      return reply(res, 200, { ok: true, media: await adminMedia(saved) });
    }
    if (req.method === "DELETE") {
      const record = await getMedia(query(req, "id"));
      if (!record) return reply(res, 404, { ok: false, error: "Media item not found." });
      const usedIn = await mediaUsage(record.id);
      if (usedIn.length) return reply(res, 409, { ok: false, error: "This image is currently in use.", usedIn });
      await deleteMedia(record);
      return reply(res, 200, { ok: true });
    }
    return reply(res, 405, { ok: false, error: "Method not allowed." });
  } catch (error) {
    console.error("admin_media_error", error);
    return reply(res, error.statusCode || 500, { ok: false, error: error.statusCode ? error.message : "Media could not be updated." });
  }
};
