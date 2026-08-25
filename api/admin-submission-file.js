const { isAdmin } = require("../lib/case-auth");
const { query } = require("../lib/admin-http");
const { getSubmission } = require("../lib/admin-store");

function safeDownloadName(value) {
  return String(value || "download").replace(/[\r\n"\\/]+/g, "-").slice(0, 160);
}

module.exports = async function handler(req, res) {
  if (!isAdmin(req)) {
    res.statusCode = 401;
    return res.end("Authentication required");
  }
  if (req.method !== "GET") {
    res.statusCode = 405;
    return res.end("GET required");
  }
  try {
    const submission = await getSubmission(query(req, "caseId"));
    const index = Number(query(req, "file"));
    const file = submission?.files?.[index];
    if (!file || !file.pathname) {
      res.statusCode = 404;
      return res.end("File not found");
    }
    const { get } = await import("@vercel/blob");
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
  } catch (error) {
    console.error("admin_submission_download_error", error);
    res.statusCode = 500;
    return res.end("Download failed");
  }
};
