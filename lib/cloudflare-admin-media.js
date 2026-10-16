const { isAdmin } = require("./case-auth");

async function cloudflareAdminMedia(request, env) {
  if (request.method !== "GET") return new Response("GET required", { status: 405 });
  try {
    const url = new URL(request.url);
    const id = url.searchParams.get("id") || "";
    if (!/^MEDIA-[A-Z0-9-]+$/.test(id)) return new Response("Media not found", { status: 404 });
    const stored = await env.MEDIA_BUCKET.get(`admin/media/records/${id}.json`);
    const record = stored ? await stored.json() : null;
    if (!record) return new Response("Media not found", { status: 404 });
    const authenticated = () => isAdmin({ headers: Object.fromEntries(request.headers) });
    if (record.trashedAt && !authenticated()) return new Response("Media not found", { status: 404 });
    const video = String(record.contentType || "").startsWith("video/");
    const ready = (record.processingStatus || "ready") === "ready";
    const poster = url.searchParams.get("variant") === "poster";
    if (poster && !record.posterPathname) return new Response("Poster not found", { status: 404 });
    if (video && !ready && !authenticated()) return new Response("Video is still being prepared for web playback", { status: 425 });
    const pathname = poster ? record.posterPathname
      : video ? (record.playbackPathname || (ready ? record.pathname : record.originalPathname || record.pathname)) : record.pathname;
    const object = await env.MEDIA_BUCKET.get(pathname);
    if (!object?.body) return new Response("Media not found", { status: 404 });
    const type = poster ? (record.posterContentType || "image/jpeg") : video && ready ? (record.playbackContentType || "video/mp4") : record.contentType;
    const size = poster ? record.posterSize : video && ready ? (record.playbackSize || record.size) : record.size;
    const headers = new Headers({
      "Content-Type": type,
      "Content-Disposition": "inline",
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400"
    });
    if (size) headers.set("Content-Length", String(size));
    if (type === "image/svg+xml") headers.set("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; sandbox");
    // Keep the original R2 body unconsumed: no Node Writable, Buffer or Blob copies.
    return new Response(object.body, { status: 200, headers });
  } catch (error) {
    console.error("media_image_error", { name: error.name, status: error.statusCode || 500 });
    return new Response(error.statusCode ? error.message : "Request failed", { status: error.statusCode || 500 });
  }
}

module.exports = cloudflareAdminMedia;
