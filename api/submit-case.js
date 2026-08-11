const MAX_BODY_BYTES = 25 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set(["stl", "ply", "zip", "pdf", "jpg", "jpeg", "png"]);

function caseId() {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const random = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `YZH-${stamp}-${random}`;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error("Request is larger than 25MB."), { statusCode: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function parseMultipart(buffer, contentType) {
  const boundary = /boundary=([^;]+)/i.exec(contentType || "")?.[1];
  if (!boundary) return { fields: {}, files: [] };
  const body = buffer.toString("latin1");
  const parts = body.split(`--${boundary}`).filter((part) => part.includes("Content-Disposition"));
  const fields = {};
  const files = [];

  for (const part of parts) {
    const [rawHeaders, ...rest] = part.split("\r\n\r\n");
    const value = rest.join("\r\n\r\n").replace(/\r\n--$/, "").replace(/\r\n$/, "");
    const name = /name="([^"]+)"/i.exec(rawHeaders)?.[1];
    const filename = /filename="([^"]*)"/i.exec(rawHeaders)?.[1];
    if (!name) continue;
    if (filename) {
      const ext = filename.split(".").pop().toLowerCase();
      files.push({ field: name, filename, ext, allowed: ALLOWED_EXTENSIONS.has(ext), size: Buffer.byteLength(value, "latin1") });
    } else {
      fields[name] = Buffer.from(value, "latin1").toString("utf8").trim();
    }
  }

  return { fields, files };
}

module.exports = async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.end(JSON.stringify({ ok: false, error: "POST required" }));
    return;
  }

  try {
    const buffer = await readBody(req);
    const { fields, files } = parseMultipart(buffer, req.headers["content-type"]);
    const required = ["name", "company", "email", "country", "case_type"];
    const missing = required.filter((key) => !fields[key]);
    const invalidFiles = files.filter((file) => !file.allowed);

    if (missing.length) {
      res.statusCode = 400;
      res.end(JSON.stringify({ ok: false, error: `Missing required fields: ${missing.join(", ")}` }));
      return;
    }

    if (invalidFiles.length) {
      res.statusCode = 400;
      res.end(JSON.stringify({ ok: false, error: "Only STL, PLY, ZIP, PDF, JPG and PNG files are accepted." }));
      return;
    }

    const id = caseId();
    console.log(JSON.stringify({
      event: "case_submission",
      caseId: id,
      fields,
      files: files.map(({ filename, ext, size }) => ({ filename, ext, size })),
      receivedAt: new Date().toISOString()
    }));

    res.statusCode = 200;
    res.end(JSON.stringify({
      ok: true,
      caseId: id,
      message: "Case request received. The YZH technical team will review the details and reply by email or WhatsApp."
    }));
  } catch (error) {
    res.statusCode = error.statusCode || 500;
    res.end(JSON.stringify({ ok: false, error: error.message || "Submission failed" }));
  }
};
