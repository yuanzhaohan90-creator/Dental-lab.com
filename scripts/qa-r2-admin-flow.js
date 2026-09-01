const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const baseUrl = String(process.env.QA_BASE_URL || "").replace(/\/$/, "");
const password = String(process.env.QA_ADMIN_PASSWORD || "");
const previewOrigin = String(process.env.QA_PREVIEW_ORIGIN || baseUrl);

function required(name, value) {
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

async function jsonRequest(route, options = {}, token = "") {
  const response = await fetch(`${baseUrl}${route}`, {
    ...options,
    headers: {
      ...(options.body ? { "content-type": "application/json" } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${route} returned ${response.status}: ${payload.error || "request failed"}`);
  return payload;
}

async function uploadFixture(token, filename, contentType, metadata) {
  const body = fs.readFileSync(filename);
  const created = await jsonRequest("/api/admin?module=media-upload", {
    method: "POST",
    body: JSON.stringify({ filename: path.basename(filename), size: body.length, contentType }),
  }, token);

  const preflight = await fetch(created.uploadUrl, {
    method: "OPTIONS",
    headers: {
      origin: previewOrigin,
      "access-control-request-method": "PUT",
      "access-control-request-headers": "content-type",
    },
  });
  assert.ok(preflight.ok, `CORS preflight failed with ${preflight.status}`);
  assert.equal(preflight.headers.get("access-control-allow-origin"), previewOrigin);

  const uploaded = await fetch(created.uploadUrl, {
    method: "PUT",
    headers: { "content-type": contentType, origin: previewOrigin },
    body,
  });
  assert.ok(uploaded.ok, `R2 upload failed with ${uploaded.status}`);

  const finalized = await jsonRequest("/api/admin?module=media-finalize", {
    method: "POST",
    body: JSON.stringify({
      blob: created.blob,
      metadata: {
        originalFilename: path.basename(filename),
        displayName: `PREVIEW-TEST ${metadata.mediaType}`,
        altText: "Preview storage test media",
        category: "QA",
        size: body.length,
        contentType,
        ...metadata,
      },
    }),
  }, token);
  return { body, media: finalized.media };
}

async function verifyLifecycle(token, fixture) {
  const id = fixture.media.id;
  assert.ok(id);
  assert.equal(fixture.media.processingStatus, "ready");

  const active = await jsonRequest("/api/admin?module=media", {}, token);
  assert.ok(active.media.some((item) => item.id === id));

  const mediaResponse = await fetch(`${baseUrl}/api/admin?module=media-image&id=${encodeURIComponent(id)}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  assert.ok(mediaResponse.ok);
  const downloaded = Buffer.from(await mediaResponse.arrayBuffer());
  assert.equal(downloaded.length, fixture.body.length);

  await jsonRequest("/api/admin?module=media-manage", {
    method: "POST",
    body: JSON.stringify({ action: "trash", id }),
  }, token);
  const trash = await jsonRequest("/api/admin?module=media&view=trash", {}, token);
  assert.ok(trash.media.some((item) => item.id === id));

  await jsonRequest("/api/admin?module=media-manage", {
    method: "POST",
    body: JSON.stringify({ action: "restore", id }),
  }, token);
  const restored = await jsonRequest("/api/admin?module=media", {}, token);
  assert.ok(restored.media.some((item) => item.id === id));

  await jsonRequest("/api/admin?module=media-manage", {
    method: "POST",
    body: JSON.stringify({ action: "trash", id }),
  }, token);
  await jsonRequest("/api/admin?module=media-manage", {
    method: "POST",
    body: JSON.stringify({ action: "permanent-delete", id }),
  }, token);

  const after = await jsonRequest("/api/admin?module=media&view=trash", {}, token);
  assert.equal(after.media.some((item) => item.id === id), false);
  const deletedResponse = await fetch(`${baseUrl}/api/admin?module=media-image&id=${encodeURIComponent(id)}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(deletedResponse.status, 404);
  return id;
}

async function main() {
  required("QA_BASE_URL", baseUrl);
  required("QA_ADMIN_PASSWORD", password);
  const imagePath = required("R2_QA_IMAGE", process.env.R2_QA_IMAGE);
  const videoPath = required("R2_QA_VIDEO", process.env.R2_QA_VIDEO);

  const login = await jsonRequest("/api/admin-auth", {
    method: "POST",
    body: JSON.stringify({ password }),
  });
  const token = required("admin session", login.sessionToken);

  const image = await uploadFixture(token, imagePath, "image/png", {
    mediaType: "image",
    format: "PNG",
    codec: "",
    webCompatible: true,
  });
  const video = await uploadFixture(token, videoPath, "video/mp4", {
    mediaType: "video",
    format: "MP4",
    codec: "h264",
    webCompatible: true,
    browserPlayable: true,
  });

  const imageId = await verifyLifecycle(token, image);
  const videoId = await verifyLifecycle(token, video);
  console.log(JSON.stringify({
    image: { id: imageId, upload: "PASS", read: "PASS", active: "PASS", trash: "PASS", restore: "PASS", permanentDelete: "PASS" },
    video: { id: videoId, upload: "PASS", read: "PASS", active: "PASS", trash: "PASS", restore: "PASS", permanentDelete: "PASS" },
    corsPreflight: "PASS",
    testDataCleaned: "PASS",
  }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
