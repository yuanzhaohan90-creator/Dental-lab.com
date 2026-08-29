const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const { Readable } = require("stream");
const { pipeline } = require("stream/promises");
const ffmpegPath = require("@ffmpeg-installer/ffmpeg").path;
const { getMedia, saveMedia } = require("./admin-store");

const PROCESSING_TIMEOUT_MS = 240000;
const MEDIA_FILE_PREFIX = "admin/media/files/";

function run(command, args, timeoutMs = PROCESSING_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("Video processing timed out."));
    }, timeoutMs);
    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr = `${stderr}${chunk}`.slice(-24000); });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) return resolve({ stdout, stderr });
      reject(new Error(`Video processing failed (${code}). ${stderr.slice(-800)}`));
    });
  });
}

async function probeVideo(filename) {
  const { stderr } = await run(ffmpegPath, ["-hide_banner", "-i", filename, "-t", "0", "-f", "null", "-"], 30000);
  const durationMatch = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/i);
  const duration = durationMatch ? Number(durationMatch[1]) * 3600 + Number(durationMatch[2]) * 60 + Number(durationMatch[3]) : 0;
  const videoLine = stderr.split(/\r?\n/).find((line) => /Video:/i.test(line)) || "";
  const audioLine = stderr.split(/\r?\n/).find((line) => /Audio:/i.test(line)) || "";
  const dimensions = videoLine.match(/(?:^|\s)(\d{2,5})x(\d{2,5})(?:[\s,]|$)/);
  const color = videoLine.match(/\(([^)]*(?:smpte2084|arib-std-b67)[^)]*)\)/i)?.[1] || "";
  return {
    formatName: /Input #0,.*\bmp4\b/i.test(stderr) ? "mp4" : /Input #0,.*\bmov\b/i.test(stderr) ? "mov" : "",
    duration: Math.max(0, duration),
    video: videoLine ? {
      codec_name: videoLine.match(/Video:\s*([^,\s(]+)/i)?.[1]?.toLowerCase() || "",
      pix_fmt: videoLine.match(/,\s*(yuv[a-z0-9]+)/i)?.[1]?.toLowerCase() || "",
      width: Number(dimensions?.[1]) || 0,
      height: Number(dimensions?.[2]) || 0,
      color_transfer: /smpte2084/i.test(color) ? "smpte2084" : /arib-std-b67/i.test(color) ? "arib-std-b67" : "",
      color_primaries: /bt2020/i.test(color) ? "bt2020" : "",
      color_space: /bt2020nc/i.test(color) ? "bt2020nc" : ""
    } : null,
    audio: audioLine ? { codec_name: audioLine.match(/Audio:\s*([^,\s(]+)/i)?.[1]?.toLowerCase() || "" } : null
  };
}

async function hasFastStart(filename) {
  const handle = await fs.promises.open(filename, "r");
  try {
    const size = Math.min((await handle.stat()).size, 2 * 1024 * 1024);
    const bytes = Buffer.alloc(size);
    await handle.read(bytes, 0, size, 0);
    const moov = bytes.indexOf("moov", 0, "ascii");
    const mdat = bytes.indexOf("mdat", 0, "ascii");
    return moov >= 0 && (mdat < 0 || moov < mdat);
  } finally {
    await handle.close();
  }
}

function isWithin1080p(video) {
  const width = Number(video?.width) || 0;
  const height = Number(video?.height) || 0;
  if (!width || !height) return false;
  return width >= height ? width <= 1920 && height <= 1080 : width <= 1080 && height <= 1920;
}

async function isWebCompatibleMp4(filename, info) {
  return path.extname(filename).toLowerCase() === ".mp4"
    && info.formatName.split(",").includes("mp4")
    && info.video?.codec_name === "h264"
    && info.video?.pix_fmt === "yuv420p"
    && (!info.audio || info.audio.codec_name === "aac")
    && isWithin1080p(info.video)
    && await hasFastStart(filename);
}

function scaleFilter() {
  return "scale=w='if(gte(iw,ih),min(iw,1920),min(iw,1080))':h='if(gte(iw,ih),min(ih,1080),min(ih,1920))':force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2";
}

function isHdr(video) {
  return ["smpte2084", "arib-std-b67"].includes(String(video?.color_transfer || "").toLowerCase());
}

function videoFilter(video, toneMap = true) {
  if (!toneMap || !isHdr(video)) return `${scaleFilter()},format=yuv420p`;
  return `zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv,${scaleFilter()},format=yuv420p`;
}

async function createPlayback(inputPath, outputPath, sourceInfo) {
  const baseArgs = [
    "-hide_banner", "-loglevel", "error", "-y", "-i", inputPath,
    "-map", "0:v:0", "-map", "0:a:0?",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "22",
    "-profile:v", "high", "-level", "4.1", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "128k",
    "-movflags", "+faststart", "-metadata:s:v:0", "rotate=0"
  ];
  try {
    await run(ffmpegPath, [...baseArgs, "-vf", videoFilter(sourceInfo.video, true), outputPath]);
  } catch (error) {
    if (!isHdr(sourceInfo.video)) throw error;
    await run(ffmpegPath, [...baseArgs, "-vf", videoFilter(sourceInfo.video, false), outputPath]);
  }
}

async function createPoster(videoPath, posterPath, duration) {
  const seek = Math.max(0, Math.min(1, Number(duration) * 0.1 || 0.25));
  await run(ffmpegPath, [
    "-hide_banner", "-loglevel", "error", "-y", "-ss", String(seek), "-i", videoPath,
    "-frames:v", "1", "-vf", `${scaleFilter()},format=yuvj420p`, "-q:v", "3", posterPath
  ], 60000);
}

async function transcodeVideoFile({ inputPath, outputPath, posterPath }) {
  const source = await probeVideo(inputPath);
  if (!source.video) throw new Error("Unable to read this video file.");
  const skipped = await isWebCompatibleMp4(inputPath, source);
  if (!skipped) await createPlayback(inputPath, outputPath, source);
  const playbackPath = skipped ? inputPath : outputPath;
  const playback = await probeVideo(playbackPath);
  if (playback.video?.codec_name !== "h264" || playback.video?.pix_fmt !== "yuv420p") throw new Error("H.264 playback validation failed.");
  if (playback.audio && playback.audio.codec_name !== "aac") throw new Error("AAC audio validation failed.");
  if (!await isWebCompatibleMp4(playbackPath, playback)) throw new Error("Web playback validation failed.");
  await createPoster(playbackPath, posterPath, playback.duration);
  return { skipped, source, playback };
}

async function blobClient(customClient) {
  return customClient || import("@vercel/blob");
}

async function downloadPrivateFile(client, pathname, destination) {
  const result = await client.get(pathname, { access: "private", useCache: false });
  if (!result || result.statusCode !== 200 || !result.stream) throw new Error("Original video could not be read.");
  await pipeline(Readable.fromWeb(result.stream), fs.createWriteStream(destination));
}

async function uploadPrivateFile(client, pathname, filename, contentType) {
  await client.put(pathname, fs.createReadStream(filename), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: false,
    contentType,
    cacheControlMaxAge: 31536000
  });
  return (await fs.promises.stat(filename)).size;
}

async function beginVideoProcessing(id, { force = false } = {}) {
  const record = await getMedia(id);
  if (!record || record.trashedAt) throw Object.assign(new Error("Video not found."), { statusCode: 404 });
  if (!String(record.contentType || "").startsWith("video/")) throw Object.assign(new Error("Only videos can be processed."), { statusCode: 400 });
  if (!force && record.processingStatus === "ready" && record.playbackPathname && (record.posterPathname || record.posterMediaId)) return { record, shouldProcess: false, jobId: "" };
  const recentJob = record.processingStatus === "processing" && record.processingJobId && Date.now() - new Date(record.processingStartedAt || 0).getTime() < 10 * 60 * 1000;
  if (!force && recentJob) return { record, shouldProcess: false, jobId: record.processingJobId };
  const jobId = crypto.randomBytes(8).toString("hex");
  const next = await saveMedia({
    ...record,
    processingStatus: "processing",
    processingMessage: "Video uploaded successfully and is being prepared for web playback.",
    processingJobId: jobId,
    processingStartedAt: new Date().toISOString(),
    processingFinishedAt: ""
  });
  return { record: next, shouldProcess: true, jobId };
}

async function processVideoMedia(id, jobId, options = {}) {
  const client = await blobClient(options.blobClient);
  const record = await getMedia(id);
  if (!record || record.processingJobId !== jobId) return null;
  const directory = await fs.promises.mkdtemp(path.join(options.tempRoot || os.tmpdir(), "yzh-video-"));
  const extension = path.extname(record.originalFilename || record.originalPathname || "") || ".video";
  const inputPath = path.join(directory, `original${extension}`);
  const outputPath = path.join(directory, "playback.mp4");
  const posterPath = path.join(directory, "poster.jpg");
  let uploadedPlayback = "";
  let uploadedPoster = "";
  try {
    await downloadPrivateFile(client, record.originalPathname || record.pathname, inputPath);
    const result = await transcodeVideoFile({ inputPath, outputPath, posterPath });
    const suffix = jobId.slice(0, 12);
    let playbackPathname = record.originalPathname || record.pathname;
    let playbackSize = record.size;
    if (!result.skipped) {
      uploadedPlayback = `${MEDIA_FILE_PREFIX}${record.id}-${suffix}-playback.mp4`;
      playbackSize = await uploadPrivateFile(client, uploadedPlayback, outputPath, "video/mp4");
      playbackPathname = uploadedPlayback;
    }
    uploadedPoster = `${MEDIA_FILE_PREFIX}${record.id}-${suffix}-poster.jpg`;
    const posterSize = await uploadPrivateFile(client, uploadedPoster, posterPath, "image/jpeg");
    const latest = await getMedia(id);
    if (!latest || latest.processingJobId !== jobId) {
      await client.del([uploadedPlayback, uploadedPoster].filter(Boolean));
      return null;
    }
    const previousGenerated = [latest.playbackPathname, latest.posterPathname].filter((pathname) => pathname && pathname !== latest.originalPathname && ![playbackPathname, uploadedPoster].includes(pathname));
    const ready = await saveMedia({
      ...latest,
      pathname: latest.originalPathname || latest.pathname,
      playbackPathname,
      playbackContentType: "video/mp4",
      playbackSize,
      posterPathname: uploadedPoster,
      posterContentType: "image/jpeg",
      posterSize,
      codec: "h264",
      audioCodec: result.playback.audio ? "aac" : "none",
      width: result.playback.video.width,
      height: result.playback.video.height,
      duration: result.playback.duration,
      processingStatus: "ready",
      processingMessage: result.skipped ? "Ready. Existing H.264/AAC MP4 was preserved without transcoding." : "Ready. Web playback version created successfully.",
      processingFinishedAt: new Date().toISOString()
    });
    if (previousGenerated.length) await client.del(previousGenerated).catch(() => {});
    return ready;
  } catch (error) {
    if (uploadedPlayback || uploadedPoster) await client.del([uploadedPlayback, uploadedPoster].filter(Boolean)).catch(() => {});
    const latest = await getMedia(id);
    if (latest?.processingJobId === jobId) {
      return saveMedia({
        ...latest,
        processingStatus: "failed",
        processingMessage: "Video conversion failed. The original is safe. Retry processing or remove this video.",
        processingError: String(error?.message || "Video conversion failed.").slice(0, 500),
        processingFinishedAt: new Date().toISOString()
      });
    }
    return null;
  } finally {
    await fs.promises.rm(directory, { recursive: true, force: true }).catch(() => {});
  }
}

module.exports = {
  beginVideoProcessing,
  isWebCompatibleMp4,
  probeVideo,
  processVideoMedia,
  transcodeVideoFile
};
