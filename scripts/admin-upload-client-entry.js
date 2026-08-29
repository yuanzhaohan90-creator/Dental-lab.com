import { upload } from "@vercel/blob/client";

const MAX_MEDIA_BYTES = 100 * 1024 * 1024;
const VIDEO_ACCEPT = "video/*,.mp4,.mov,.m4v";
const VIDEO_EXTENSIONS = new Set(["mp4", "mov", "m4v"]);
const VIDEO_MIME_TYPES = new Set(["video/mp4", "video/quicktime", "video/x-m4v"]);

function extensionOf(name) {
  return String(name || "").split(".").pop().toLowerCase();
}

function ascii(bytes) {
  let value = "";
  for (let index = 0; index < bytes.length; index += 1) value += String.fromCharCode(bytes[index]);
  return value;
}

function isIsoBmff(bytes) {
  for (let index = 4; index <= Math.min(bytes.length - 4, 64); index += 4) {
    if (ascii(bytes.subarray(index, index + 4)) === "ftyp") return true;
  }
  return false;
}

function detectCodec(bytes) {
  const text = ascii(bytes);
  if (/hvc1|hev1/.test(text)) return "hevc";
  if (/dvhe|dvh1/.test(text)) return "dolby-vision";
  if (/avc1|avc3/.test(text)) return "h264";
  return "unknown";
}

async function readDetectionBytes(file) {
  const chunkSize = Math.min(file.size, 1024 * 1024);
  const first = new Uint8Array(await file.slice(0, chunkSize).arrayBuffer());
  if (file.size <= chunkSize) return first;
  const last = new Uint8Array(await file.slice(Math.max(0, file.size - chunkSize)).arrayBuffer());
  const combined = new Uint8Array(first.length + last.length);
  combined.set(first);
  combined.set(last, first.length);
  return combined;
}

function canonicalVideoType(extension, mimeType) {
  if (mimeType === "video/quicktime" || extension === "mov") return "video/quicktime";
  if (mimeType === "video/x-m4v" || extension === "m4v") return "video/x-m4v";
  return "video/mp4";
}

async function readVideoMetadata(file) {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    const url = URL.createObjectURL(file);
    let settled = false;
    const done = (value) => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(url);
      video.removeAttribute("src");
      resolve(value);
    };
    const timer = setTimeout(() => done({ duration: 0, width: 0, height: 0, browserPlayable: false }), 6000);
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    video.onloadedmetadata = () => {
      clearTimeout(timer);
      done({ duration: Number.isFinite(video.duration) ? video.duration : 0, width: video.videoWidth || 0, height: video.videoHeight || 0, browserPlayable: true });
    };
    video.onerror = () => {
      clearTimeout(timer);
      done({ duration: 0, width: 0, height: 0, browserPlayable: false });
    };
    video.src = url;
  });
}

async function inspectMedia(file) {
  if (!file) throw new Error("Choose a file to upload.");
  if (file.size > MAX_MEDIA_BYTES) throw new Error("Video is larger than 100 MB.");
  const extension = extensionOf(file.name);
  const mime = String(file.type || "").toLowerCase();
  const bytes = await readDetectionBytes(file);
  const videoSignal = VIDEO_EXTENSIONS.has(extension) || VIDEO_MIME_TYPES.has(mime) || mime === "" || mime === "application/octet-stream";
  if (!videoSignal) {
    const contentType = extension === "svg" || mime === "image/svg+xml" ? "image/svg+xml" : mime;
    return { mediaType: "image", format: extension.toUpperCase(), codec: "", contentType, duration: 0, width: 0, height: 0, browserPlayable: true, webCompatible: true };
  }
  if (!VIDEO_EXTENSIONS.has(extension) && !VIDEO_MIME_TYPES.has(mime)) throw new Error("Unable to read this video file.");
  if (!isIsoBmff(bytes)) throw new Error("Unable to read this video file.");
  const format = extension === "mov" || mime === "video/quicktime" ? "MOV" : extension === "m4v" || mime === "video/x-m4v" ? "M4V" : "MP4";
  const codec = detectCodec(bytes);
  const metadata = await readVideoMetadata(file);
  return { mediaType: "video", format, codec, contentType: canonicalVideoType(extension, mime), ...metadata, webCompatible: format === "MP4" && codec === "h264" };
}

function normalizedUploadFile(file, inspection) {
  if (!inspection.contentType || file.type === inspection.contentType) return file;
  return new File([file], file.name, { type: inspection.contentType, lastModified: file.lastModified });
}

function friendlyUploadError(error) {
  const message = String(error?.message || "");
  if (/too large|maximum|100\\s*mb/i.test(message)) return new Error("Video is larger than 100 MB.");
  if (/network|fetch|abort|interrupted/i.test(message)) return new Error("Upload interrupted. Please try again.");
  if (/content.?type|unsupported|invalid/i.test(message)) return new Error("Unable to read this video file.");
  return new Error(message || "Upload interrupted. Please try again.");
}

window.YZH_VIDEO_ACCEPT = VIDEO_ACCEPT;
window.yzhInspectMedia = inspectMedia;
window.yzhUploadMedia = async function yzhUploadMedia(file, metadata, onProgress, suppliedInspection) {
  const inspection = suppliedInspection || await inspectMedia(file);
  const uploadFile = normalizedUploadFile(file, inspection);
  let safeName = String(file.name || "media")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "") || `media.${inspection.format.toLowerCase()}`;
  const expectedExtension = inspection.format.toLowerCase() === "jpeg" ? "jpg" : inspection.format.toLowerCase();
  const currentExtension = extensionOf(safeName);
  if (currentExtension !== expectedExtension && !(expectedExtension === "jpg" && currentExtension === "jpeg")) safeName = `${safeName}.${expectedExtension}`;
  try {
    const blob = await upload(`admin/media/files/${Date.now()}-${safeName}`, uploadFile, {
      access: "private",
      contentType: inspection.contentType || undefined,
      handleUploadUrl: "/api/admin?module=media-upload",
      multipart: file.size > 8 * 1024 * 1024,
      clientPayload: JSON.stringify({ ...(metadata || {}), ...inspection, originalFilename: file.name, size: file.size }),
      onUploadProgress: ({ percentage }) => onProgress?.(Math.round(percentage))
    });
    return { blob, inspection };
  } catch (error) {
    throw friendlyUploadError(error);
  }
};
