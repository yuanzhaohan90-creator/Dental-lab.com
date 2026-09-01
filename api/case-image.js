const { Readable } = require("stream");
const { isAdmin } = require("../lib/case-auth");
const { getRecord } = require("../lib/case-store");
const { storageClient } = require("../lib/object-store");

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
  try {
    const record = await getRecord(query(req, "caseId"));
    if (!record || (record.status !== "published" && !isAdmin(req))) {
      res.statusCode = 404;
      return res.end("Not found");
    }
    const image = record.images.find((item) => item.id === query(req, "imageId"));
    if (!image) {
      res.statusCode = 404;
      return res.end("Not found");
    }
    const { get } = await storageClient();
    const result = await get(image.pathname, { access: "private" });
    if (!result || result.statusCode !== 200 || !result.stream) {
      res.statusCode = 404;
      return res.end("Not found");
    }
    res.statusCode = 200;
    res.setHeader("Content-Type", image.contentType || result.blob.contentType || "application/octet-stream");
    res.setHeader("Content-Disposition", "inline");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "no-store");
    Readable.fromWeb(result.stream).pipe(res);
  } catch (error) {
    console.error("case_image_error", error);
    res.statusCode = 500;
    res.end("Image unavailable");
  }
};
