process.env.NODE_ENV = "test";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const ffmpegPath = require("@ffmpeg-installer/ffmpeg").path;
const store = require("../lib/admin-store");
const { beginVideoProcessing, probeVideo, processVideoMedia, transcodeVideoFile } = require("../lib/video-transcode");

const memory = new Map();

async function bodyBuffer(value) {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (value && typeof value[Symbol.asyncIterator] === "function") {
    const chunks = [];
    for await (const chunk of value) chunks.push(Buffer.from(chunk));
    return Buffer.concat(chunks);
  }
  return Buffer.from(String(value));
}

const blobClient = {
  async put(pathname, value, options = {}) {
    const body = await bodyBuffer(value);
    memory.set(pathname, { body, contentType: options.contentType || "application/octet-stream" });
    return { pathname, contentType: options.contentType, url: `https://blob.test/${pathname}` };
  },
  async get(pathname) {
    const item = memory.get(pathname);
    if (!item) return null;
    return { statusCode: 200, stream: new Blob([item.body]).stream(), blob: { size: item.body.length, contentType: item.contentType } };
  },
  async list({ prefix }) {
    return { blobs: [...memory.keys()].filter((pathname) => pathname.startsWith(prefix)).map((pathname) => ({ pathname })), hasMore: false };
  },
  async del(paths) {
    for (const pathname of Array.isArray(paths) ? paths : [paths]) memory.delete(pathname);
  }
};

store._setBlobClientForTests(blobClient);

function run(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath, ["-hide_banner", "-loglevel", "error", "-y", ...args], { windowsHide: true });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve() : reject(new Error(stderr || `ffmpeg exited ${code}`)));
  });
}

async function makeVideo(filename, { width = 320, height = 180, codec = "libx265", hdr = false } = {}) {
  const videoArgs = [
    "-f", "lavfi", "-i", `testsrc=size=${width}x${height}:rate=24`,
    "-f", "lavfi", "-i", "sine=frequency=880:sample_rate=44100",
    "-t", "0.7", "-shortest", "-c:v", codec,
    "-pix_fmt", hdr ? "yuv420p10le" : "yuv420p",
    "-c:a", "aac", "-b:a", "96k"
  ];
  if (codec === "libx265") videoArgs.push("-tag:v", "hvc1", "-x265-params", "log-level=error");
  if (hdr) videoArgs.push("-color_primaries", "bt2020", "-color_trc", "smpte2084", "-colorspace", "bt2020nc");
  if (codec === "libx264") videoArgs.push("-movflags", "+faststart");
  videoArgs.push(filename);
  await run(videoArgs);
}

(async () => {
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), "yzh-video-test-"));
  try {
    const landscape = path.join(directory, "iPhone HEVC landscape.MOV");
    const portrait = path.join(directory, "iPhone HEVC portrait.MOV");
    const hdr = path.join(directory, "iPhone HDR HEVC.MOV");
    const h264 = path.join(directory, "web ready.mp4");
    await makeVideo(landscape);
    await makeVideo(portrait, { width: 180, height: 320 });
    await makeVideo(hdr, { hdr: true });
    await makeVideo(h264, { codec: "libx264" });

    for (const [name, source] of [["landscape", landscape], ["portrait", portrait], ["hdr", hdr]]) {
      const output = path.join(directory, `${name}-playback.mp4`);
      const poster = path.join(directory, `${name}-poster.jpg`);
      const result = await transcodeVideoFile({ inputPath: source, outputPath: output, posterPath: poster });
      assert.equal(result.skipped, false);
      assert.equal(result.playback.video.codec_name, "h264");
      assert.equal(result.playback.video.pix_fmt, "yuv420p");
      assert.equal(result.playback.audio.codec_name, "aac");
      assert((await fs.promises.stat(poster)).size > 0);
      if (name === "portrait") assert(Number(result.playback.video.height) > Number(result.playback.video.width));
    }

    const skippedOutput = path.join(directory, "should-not-exist.mp4");
    const h264Poster = path.join(directory, "h264-poster.jpg");
    const skipped = await transcodeVideoFile({ inputPath: h264, outputPath: skippedOutput, posterPath: h264Poster });
    assert.equal(skipped.skipped, true);
    assert.equal(fs.existsSync(skippedOutput), false);
    assert.equal((await probeVideo(h264)).audio.codec_name, "aac");

    const h264Record = await store.storeMediaFile({ filename: "web ready.mp4", contentType: "video/mp4", buffer: await fs.promises.readFile(h264) }, { displayName: "H264 QA", category: "Other", codec: "h264" });
    assert.equal(h264Record.processingStatus, "ready");
    const posterJob = await beginVideoProcessing(h264Record.id);
    assert.equal(posterJob.shouldProcess, true);
    await processVideoMedia(h264Record.id, posterJob.jobId, { blobClient, tempRoot: directory });
    const preserved = await store.getMedia(h264Record.id);
    assert.equal(preserved.processingStatus, "ready");
    assert.equal(preserved.playbackPathname, preserved.originalPathname);
    assert(memory.has(preserved.posterPathname));

    const original = await store.storeMediaFile({ filename: "iPhone HEVC landscape.MOV", contentType: "video/quicktime", buffer: await fs.promises.readFile(landscape) }, { displayName: "HEVC QA", category: "Other", codec: "hevc" });
    const started = await beginVideoProcessing(original.id);
    assert.equal(started.shouldProcess, true);
    await processVideoMedia(original.id, started.jobId, { blobClient, tempRoot: directory });
    const ready = await store.getMedia(original.id);
    assert.equal(ready.processingStatus, "ready");
    assert.equal(ready.codec, "h264");
    assert.equal(ready.audioCodec, "aac");
    assert.notEqual(ready.playbackPathname, ready.originalPathname);
    assert(memory.has(ready.originalPathname));
    assert(memory.has(ready.playbackPathname));
    assert(memory.has(ready.posterPathname));

    const failedId = "MEDIA-FAILED-TRANSCODE";
    const failedPath = `admin/media/files/${failedId}.mov`;
    await blobClient.put(failedPath, Buffer.from("invalid HEVC data"), { contentType: "video/quicktime" });
    await store.saveMedia({ id: failedId, pathname: failedPath, originalPathname: failedPath, playbackPathname: "", contentType: "video/quicktime", originalFilename: "broken.mov", size: 17, format: "MOV", codec: "hevc", processingStatus: "failed" });
    const retry = await beginVideoProcessing(failedId, { force: true });
    await processVideoMedia(failedId, retry.jobId, { blobClient, tempRoot: directory });
    const failed = await store.getMedia(failedId);
    assert.equal(failed.processingStatus, "failed");
    assert.equal(memory.has(failed.originalPathname), true);
    assert.match(failed.processingMessage, /original is safe/i);
    await assert.rejects(() => store.assertPublishableMedia({ mediaId: failedId }), /not ready for web playback/i);

    console.log("video transcode tests passed");
  } finally {
    await fs.promises.rm(directory, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
