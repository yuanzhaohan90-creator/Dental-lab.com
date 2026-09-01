const crypto = require("crypto");
const { storageClient } = require("../lib/object-store");

function timingSafeEqual(a, b) {
  const left = Buffer.from(String(a || ""), "hex");
  const right = Buffer.from(String(b || ""), "hex");
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function signPath(pathname) {
  const secret = process.env.CASE_DOWNLOAD_SECRET;
  if (!secret) throw new Error("CASE_DOWNLOAD_SECRET is not configured.");
  return crypto.createHmac("sha256", secret).update(pathname).digest("hex");
}

function isAllowedCasePath(pathname) {
  return /^cases\/YZH-\d{12}-[A-F0-9]{6}\/[^/]+$/.test(pathname || "");
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.statusCode = 405;
    res.end("GET required");
    return;
  }

  try {
    const url = new URL(req.url, `https://${req.headers.host || "yzhdentallab.com"}`);
    const pathname = url.searchParams.get("path") || "";
    const token = url.searchParams.get("token") || "";

    if (!isAllowedCasePath(pathname) || !timingSafeEqual(signPath(pathname), token)) {
      res.statusCode = 404;
      res.end("File not found");
      return;
    }

    const { get } = await storageClient();
    const result = await get(pathname, { access: "private", useCache: false });
    if (result.statusCode !== 200 || !result.stream) {
      res.statusCode = 404;
      res.end("File not found");
      return;
    }

    res.statusCode = 200;
    res.setHeader("Content-Type", result.blob.contentType || "application/octet-stream");
    res.setHeader("Content-Length", String(result.blob.size));
    res.setHeader("Content-Disposition", result.blob.contentDisposition || `attachment; filename="${pathname.split("/").pop()}"`);
    res.setHeader("Cache-Control", "private, no-store");

    const reader = result.stream.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(Buffer.from(value));
    }
    res.end();
  } catch (error) {
    console.error(JSON.stringify({ event: "case_file_download_failed", message: error.message }));
    res.statusCode = 500;
    res.end("Download failed");
  }
};
