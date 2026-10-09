const { isAdmin } = require("./case-auth");

async function cloudflareCaseImage(request, env) {
  if (request.method !== "GET") return new Response("Method not allowed", { status: 405, headers: { Allow: "GET" } });
  try {
    const url = new URL(request.url);
    const caseId = url.searchParams.get("caseId") || "";
    if (!/^[A-Z0-9-]+$/.test(caseId)) return new Response("Not found", { status: 404 });
    const stored = await env.MEDIA_BUCKET.get(`case-library/records/${caseId}.json`);
    const record = stored ? await stored.json() : null;
    if (!record || (record.status !== "published" && !isAdmin({ headers: Object.fromEntries(request.headers) }))) {
      return new Response("Not found", { status: 404 });
    }
    const image = record.images.find((item) => item.id === url.searchParams.get("imageId"));
    if (!image) return new Response("Not found", { status: 404 });
    const object = await env.MEDIA_BUCKET.get(image.pathname);
    if (!object?.body) return new Response("Not found", { status: 404 });
    const headers = new Headers({
      "Content-Type": image.contentType || object.httpMetadata?.contentType || "application/octet-stream",
      "Content-Disposition": "inline",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store"
    });
    if (object.httpEtag) headers.set("ETag", object.httpEtag);
    if (Number.isFinite(object.size)) headers.set("Content-Length", String(object.size));
    // Pass the R2 stream through without materializing image bytes in JS memory.
    return new Response(object.body, { status: 200, headers });
  } catch (error) {
    console.error("case_image_error", error);
    return new Response("Image unavailable", { status: 500 });
  }
}

module.exports = cloudflareCaseImage;
