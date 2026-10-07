const { createR2DownloadUrl } = require("./object-store");
const { getMedia, saveMedia } = require("./admin-store");

function required(name) {
  const value = String(process.env[name] || "").trim();
  if (!value || value === "[SENSITIVE]") {
    throw Object.assign(new Error(`${name} is not configured.`), { statusCode: 503 });
  }
  return value;
}

function streamEndpoint(path = "") {
  return `https://api.cloudflare.com/client/v4/accounts/${required("CLOUDFLARE_ACCOUNT_ID")}/stream${path}`;
}

async function streamRequest(path, options = {}) {
  const response = await fetch(streamEndpoint(path), {
    ...options,
    headers: {
      Authorization: `Bearer ${required("CLOUDFLARE_STREAM_API_TOKEN")}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) {
    const message = payload.errors?.[0]?.message || `Cloudflare Stream request failed (${response.status}).`;
    throw Object.assign(new Error(message), { statusCode: response.status >= 500 ? 502 : response.status });
  }
  return payload.result || payload;
}

function videoState(video = {}) {
  return String(video.status?.state || "").toLowerCase();
}

async function beginStreamProcessing(id, { force = false } = {}) {
  const record = await getMedia(id);
  if (!record || !String(record.contentType || "").startsWith("video/")) {
    throw Object.assign(new Error("Video media was not found."), { statusCode: 404 });
  }
  if (record.processingStatus === "ready" && record.playbackPathname && !force) return record;
  if (record.streamVideoId && !force) return refreshStreamProcessing(id);

  const originalR2Key = record.originalPathname || record.pathname;
  const sourceUrl = await createR2DownloadUrl(originalR2Key, 1800);
  const video = await streamRequest("/copy", {
    method: "POST",
    body: JSON.stringify({
      url: sourceUrl,
      creator: record.id,
      meta: { name: record.originalFilename || record.displayName || record.id },
      allowedOrigins: ["yzhdentallab.com", "*.yzhdentallab.com", "*.workers.dev"]
    })
  });
  const now = new Date().toISOString();
  return saveMedia({
    ...record,
    originalR2Key,
    originalUrl: `/api/admin?module=media-image&id=${encodeURIComponent(record.id)}&variant=original`,
    streamVideoId: video.uid,
    streamPlaybackUrl: video.playback?.hls || "",
    streamPlayerUrl: video.preview || "",
    streamPosterUrl: video.thumbnail || "",
    processingStatus: "processing",
    processingMessage: "Original saved. Cloudflare Stream is preparing a web-playable version.",
    processingError: "",
    processingStartedAt: now,
    processingFinishedAt: "",
    updatedAt: now
  });
}

async function refreshStreamProcessing(id) {
  const record = await getMedia(id);
  if (!record || !record.streamVideoId) {
    throw Object.assign(new Error("Cloudflare Stream processing has not started for this video."), { statusCode: 409 });
  }
  try {
    const video = await streamRequest(`/${encodeURIComponent(record.streamVideoId)}`);
    const state = videoState(video);
    if (video.readyToStream || state === "ready") {
      return saveMedia({
        ...record,
        streamPlaybackUrl: video.playback?.hls || record.streamPlaybackUrl || "",
        streamPlayerUrl: video.preview || record.streamPlayerUrl || "",
        streamPosterUrl: video.thumbnail || record.streamPosterUrl || "",
        playbackPathname: `stream:${record.streamVideoId}`,
        playbackContentType: "application/vnd.apple.mpegurl",
        processingStatus: "ready",
        processingMessage: "Ready. Cloudflare Stream created a web-playable version.",
        processingError: "",
        processingFinishedAt: new Date().toISOString()
      });
    }
    if (["error", "failed"].includes(state)) {
      return saveMedia({
        ...record,
        processingStatus: "failed",
        processingMessage: "Video conversion failed. The original is safe in R2 and can be retried.",
        processingError: String(video.status?.errorReasonText || video.status?.errorReasonCode || "Cloudflare Stream conversion failed.").slice(0, 500),
        processingFinishedAt: new Date().toISOString()
      });
    }
    return saveMedia({
      ...record,
      processingStatus: "processing",
      processingMessage: "Original saved. Cloudflare Stream is preparing a web-playable version.",
      streamPlaybackUrl: video.playback?.hls || record.streamPlaybackUrl || "",
      streamPlayerUrl: video.preview || record.streamPlayerUrl || "",
      streamPosterUrl: video.thumbnail || record.streamPosterUrl || ""
    });
  } catch (error) {
    if (error.statusCode === 404) {
      return saveMedia({
        ...record,
        processingStatus: "failed",
        processingMessage: "Cloudflare Stream could not find this processing job. The original is safe in R2 and can be retried.",
        processingError: "Cloudflare Stream video not found.",
        processingFinishedAt: new Date().toISOString()
      });
    }
    throw error;
  }
}

module.exports = { beginStreamProcessing, refreshStreamProcessing };
