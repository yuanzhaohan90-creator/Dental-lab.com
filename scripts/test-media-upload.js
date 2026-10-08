const assert = require("assert");
const fs = require("node:fs");
const path = require("node:path");
const { MAX_MEDIA_BYTES, validateMediaFile } = require("../lib/media-validation");

function isoBmff(codec = "avc1") {
  return Buffer.concat([
    Buffer.from([0, 0, 0, 24]),
    Buffer.from("ftypisom", "ascii"),
    Buffer.from([0, 0, 0, 0]),
    Buffer.from(`isom${codec}mp41`, "ascii")
  ]);
}

function isoBmffWithAudio(codec = "avc1") {
  return Buffer.concat([isoBmff(codec), Buffer.from("mp4a", "ascii")]);
}

const mp4 = validateMediaFile({ filename: "test landscape.mp4", contentType: "video/mp4", size: 1024, bytes: isoBmff("avc1") });
assert.equal(mp4.mediaType, "video");
assert.equal(mp4.format, "MP4");
assert.equal(mp4.codec, "h264");
assert.equal(mp4.webCompatible, true);

const mov = validateMediaFile({ filename: "iPhone 标准视频.MOV", contentType: "video/quicktime", size: 2048, bytes: isoBmffWithAudio("avc1") });
assert.equal(mov.format, "MOV");
assert.equal(mov.contentType, "video/quicktime");
assert.equal(mov.codec, "h264");
assert.equal(mov.audioCodec, "aac");
assert.equal(mov.webCompatible, true);

const hevc = validateMediaFile({ filename: "IMG_1234.MOV", contentType: "", size: 4096, bytes: isoBmff("hvc1") });
assert.equal(hevc.codec, "hevc");
assert.equal(hevc.webCompatible, false);

const m4v = validateMediaFile({ filename: "portrait video.m4v", contentType: "video/x-m4v", size: 4096, bytes: isoBmff("avc1") });
assert.equal(m4v.format, "M4V");
assert.equal(m4v.contentType, "video/x-m4v");

const missingMime = validateMediaFile({ filename: "来自照片.mp4", contentType: "", size: 4096, bytes: isoBmff("avc1") });
assert.equal(missingMime.contentType, "video/mp4");

const safeSvgBytes = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 40"><path d="M0 0h100v40H0z"/></svg>');
const svg = validateMediaFile({ filename: "yzh-logo.svg", contentType: "image/svg+xml", size: safeSvgBytes.length, bytes: safeSvgBytes });
assert.equal(svg.format, "SVG");
assert.equal(svg.contentType, "image/svg+xml");
assert.throws(() => validateMediaFile({ filename: "unsafe.svg", contentType: "image/svg+xml", size: 100, bytes: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>') }), /Unable to read this image file/);

assert.throws(() => validateMediaFile({ filename: "renamed.mov", contentType: "video/quicktime", size: 20, bytes: Buffer.from("not a video") }), /Unable to read this video file/);
assert.throws(() => validateMediaFile({ filename: "large.mov", contentType: "video/quicktime", size: MAX_MEDIA_BYTES + 1, bytes: isoBmff("hvc1") }), /larger than 100 MB/);

const uploadClient = fs.readFileSync(path.join(__dirname, "admin-upload-client-entry.js"), "utf8");
const adminApi = fs.readFileSync(path.join(__dirname, "../api/admin.js"), "utf8");
assert.equal(uploadClient.includes("@vercel/blob/client"), false);
assert.equal(adminApi.includes("@vercel/blob/client"), false);
const objectStore = fs.readFileSync(path.join(__dirname, "../lib/object-store.js"), "utf8");
assert.equal(objectStore.includes("@vercel/blob"), false);
assert.equal(objectStore.includes("BLOB_READ_WRITE_TOKEN"), false);
assert.match(objectStore, /Unsupported storage backend/);
assert.match(uploadClient, /XMLHttpRequest/);
assert.match(uploadClient, /request\.open\("PUT", uploadUrl\)/);
assert.doesNotMatch(uploadClient, /const VIDEO_ACCEPT\s*=/);
assert.match(uploadClient, /const UPLOAD_VIDEO_ACCEPT\s*=/);
assert.match(uploadClient, /This iPhone video uses HEVC\/H\.265 encoding\. Please convert it to H\.264 MP4 before uploading\./);
assert.doesNotMatch(uploadClient, /format !== "MP4"/);
assert.match(uploadClient, /codec === "hevc" \|\| codec === "dolby-vision"/);
assert.match(uploadClient, /throw new Error\(INCOMPATIBLE_VIDEO_MESSAGE\)/);
assert.match(uploadClient, /\[media-upload-selection\]/);
assert.match(adminApi, /\[media-upload-request\]/);
assert.match(adminApi, /createR2UploadUrl/);

console.log("media upload compatibility tests passed");
