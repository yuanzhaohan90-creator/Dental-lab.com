const { getMedia } = require("../lib/admin-store");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.statusCode = 405;
    return res.end("GET required");
  }
  try {
    const id = String(req.query?.id || new URL(req.url, "https://yzhdentallab.com").searchParams.get("id") || "");
    const record = await getMedia(id);
    if (!record) {
      res.statusCode = 404;
      return res.end("Image not found");
    }
    const { get } = await import("@vercel/blob");
    const result = await get(record.pathname, { access: "private" });
    if (!result || result.statusCode !== 200 || !result.stream) {
      res.statusCode = 404;
      return res.end("Image not found");
    }
    res.statusCode = 200;
    res.setHeader("Content-Type", record.contentType);
    res.setHeader("Content-Length", String(record.size));
    res.setHeader("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400");
    const reader = result.stream.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(Buffer.from(value));
    }
    return res.end();
  } catch (error) {
    console.error("media_image_error", error);
    res.statusCode = 500;
    return res.end("Image unavailable");
  }
};
