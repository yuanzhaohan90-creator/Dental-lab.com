const MAX_MEDIA_BYTES = 100 * 1024 * 1024;
const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp"]);
const VIDEO_EXTENSIONS = new Set(["mp4", "mov", "m4v"]);
const VIDEO_MIME_TYPES = new Set(["video/mp4", "video/quicktime", "video/x-m4v"]);

function extensionOf(filename) {
  const match = /\.([^.]+)$/.exec(String(filename || ""));
  return match ? match[1].toLowerCase() : "";
}

function startsWith(bytes, signature) {
  return signature.every((value, index) => bytes[index] === value);
}

function isJpeg(bytes) {
  return bytes.length >= 3 && startsWith(bytes, [0xff, 0xd8, 0xff]);
}

function isPng(bytes) {
  return bytes.length >= 8 && startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
}

function isWebp(bytes) {
  if (bytes.length < 12) return false;
  return Buffer.from(bytes.subarray(0, 4)).toString("ascii") === "RIFF" && Buffer.from(bytes.subarray(8, 12)).toString("ascii") === "WEBP";
}

function isIsoBmff(bytes) {
  if (bytes.length < 12) return false;
  const scanLimit = Math.min(bytes.length - 4, 64);
  for (let index = 4; index <= scanLimit; index += 4) {
    if (Buffer.from(bytes.subarray(index, index + 4)).toString("ascii") === "ftyp") return true;
  }
  return false;
}

function detectCodec(bytes) {
  const text = Buffer.from(bytes).toString("latin1");
  if (/(?:hvc1|hev1)/.test(text)) return "hevc";
  if (/(?:dvhe|dvh1)/.test(text)) return "dolby-vision";
  if (/(?:avc1|avc3)/.test(text)) return "h264";
  return "unknown";
}

function canonicalVideoType(extension, mimeType) {
  const mime = String(mimeType || "").toLowerCase();
  if (mime === "video/quicktime" || extension === "mov") return "video/quicktime";
  if (mime === "video/x-m4v" || extension === "m4v") return "video/x-m4v";
  return "video/mp4";
}

function validateMediaFile({ filename, contentType, size, bytes, codecHint = "" }) {
  const extension = extensionOf(filename);
  const mime = String(contentType || "").toLowerCase();
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  const actualSize = Math.max(0, Number(size) || 0);

  if (actualSize > MAX_MEDIA_BYTES) throw Object.assign(new Error("Video is larger than 100 MB."), { statusCode: 413, code: "MEDIA_TOO_LARGE" });

  if (IMAGE_EXTENSIONS.has(extension) || mime.startsWith("image/")) {
    const imageFormat = isJpeg(data) ? "JPEG" : isPng(data) ? "PNG" : isWebp(data) ? "WebP" : "";
    if (!imageFormat) throw Object.assign(new Error("Unable to read this image file."), { statusCode: 400, code: "INVALID_IMAGE" });
    const expected = { JPEG: "image/jpeg", PNG: "image/png", WebP: "image/webp" }[imageFormat];
    return { mediaType: "image", format: imageFormat, extension: imageFormat === "JPEG" ? "jpg" : imageFormat.toLowerCase(), contentType: expected, codec: "", webCompatible: true };
  }

  const videoSignal = VIDEO_EXTENSIONS.has(extension) || VIDEO_MIME_TYPES.has(mime) || mime === "" || mime === "application/octet-stream";
  if (!videoSignal || !isIsoBmff(data)) throw Object.assign(new Error("Unable to read this video file."), { statusCode: 400, code: "INVALID_VIDEO" });

  const format = extension === "mov" || mime === "video/quicktime" ? "MOV" : extension === "m4v" || mime === "video/x-m4v" ? "M4V" : "MP4";
  const detectedCodec = detectCodec(data);
  const codec = ["h264", "hevc", "dolby-vision"].includes(codecHint) ? codecHint : detectedCodec;
  return {
    mediaType: "video",
    format,
    extension: format.toLowerCase(),
    contentType: canonicalVideoType(extension, mime),
    codec,
    webCompatible: format === "MP4" && codec === "h264"
  };
}

module.exports = {
  IMAGE_EXTENSIONS,
  MAX_MEDIA_BYTES,
  VIDEO_EXTENSIONS,
  VIDEO_MIME_TYPES,
  detectCodec,
  extensionOf,
  isIsoBmff,
  validateMediaFile
};
