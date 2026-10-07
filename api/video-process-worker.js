const { protect, readJson, reply } = require("../lib/admin-http");
const { beginStreamProcessing, refreshStreamProcessing } = require("../lib/video-stream");

module.exports = async function handler(req, res) {
  if (!protect(req, res)) return;
  if (req.method !== "POST") return reply(res, 405, { ok: false, error: "Method not allowed." });
  try {
    const body = await readJson(req);
    const id = String(body.id || "");
    const record = body.action === "status"
      ? await refreshStreamProcessing(id)
      : await beginStreamProcessing(id, { force: body.action === "retry" });
    return reply(res, record.processingStatus === "ready" ? 200 : 202, {
      ok: true,
      mediaId: record.id,
      status: record.processingStatus,
      message: record.processingMessage,
      error: record.processingError || ""
    });
  } catch (error) {
    console.error("stream_video_process_error", error);
    return reply(res, error.statusCode || 500, { ok: false, error: error.message || "Unable to process video." });
  }
};
