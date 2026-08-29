const { waitUntil } = require("@vercel/functions");
const { protect, readJson, reply } = require("../lib/admin-http");
const { beginVideoProcessing, processVideoMedia } = require("../lib/video-transcode");

module.exports = async function handler(req, res) {
  if (!protect(req, res)) return;
  if (req.method !== "POST") return reply(res, 405, { ok: false, error: "Method not allowed." });
  try {
    const body = await readJson(req);
    const started = await beginVideoProcessing(String(body.id || ""), { force: body.action === "retry" });
    if (started.shouldProcess) {
      waitUntil(processVideoMedia(started.record.id, started.jobId).catch((error) => console.error("video_processing_error", error)));
    }
    return reply(res, 202, { ok: true, mediaId: started.record.id, status: started.record.processingStatus, processing: started.shouldProcess || started.record.processingStatus === "processing" });
  } catch (error) {
    console.error("video_process_start_error", error);
    return reply(res, error.statusCode || 500, { ok: false, error: error.message || "Unable to start video processing." });
  }
};
