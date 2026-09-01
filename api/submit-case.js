const Busboy = require("busboy");
const crypto = require("crypto");
const { isR2Backend, storageClient } = require("../lib/object-store");

const MAX_BODY_BYTES = 25 * 1024 * 1024;
const MAX_FILES = 12;
const ALLOWED_EXTENSIONS = new Set(["stl", "ply", "zip", "pdf", "jpg", "jpeg", "png"]);
const REQUIRED_FIELDS = ["name", "email", "case_type"];
const MIME_BY_EXTENSION = {
  jpg: ["image/jpeg"],
  jpeg: ["image/jpeg"],
  png: ["image/png"],
  pdf: ["application/pdf"],
  zip: ["application/zip", "application/x-zip-compressed", "multipart/x-zip"],
  stl: ["model/stl", "application/sla", "application/vnd.ms-pki.stl", "text/plain"],
  ply: ["application/octet-stream", "text/plain", "application/ply"]
};

function json(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function makeHttpError(statusCode, message) {
  return Object.assign(new Error(message), { statusCode });
}

function generateCaseId(now = new Date()) {
  const stamp = now.toISOString().replace(/[-:.TZ]/g, "").slice(0, 12);
  const random = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `YZH-${stamp}-${random}`;
}

function sanitizeFilename(filename, fallbackIndex) {
  const base = String(filename || "")
    .replace(/\\/g, "/")
    .split("/")
    .pop()
    .normalize("NFKD")
    .replace(/[^\w.\-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^\.+/, "")
    .slice(0, 120);
  return base || `upload-${fallbackIndex}`;
}

function extensionFor(filename) {
  const match = /\.([^.]+)$/.exec(filename || "");
  return match ? match[1].toLowerCase() : "";
}

function isSupportedMime(ext, mimeType) {
  if (!mimeType || mimeType === "application/octet-stream") return true;
  const allowed = MIME_BY_EXTENSION[ext];
  return !allowed || allowed.includes(mimeType.toLowerCase());
}

function signDownloadPath(pathname) {
  const secret = process.env.CASE_DOWNLOAD_SECRET;
  if (!secret) throw makeHttpError(500, "CASE_DOWNLOAD_SECRET is not configured.");
  return crypto.createHmac("sha256", secret).update(pathname).digest("hex");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatBytes(bytes) {
  if (!bytes) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function siteUrl() {
  return (process.env.SITE_URL || "https://yzhdentallab.com").replace(/\/$/, "");
}

function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    const contentType = req.headers["content-type"] || "";
    if (!contentType.toLowerCase().includes("multipart/form-data")) {
      reject(makeHttpError(400, "Multipart form data is required."));
      return;
    }

    const fields = {};
    const files = [];
    let totalBytes = 0;
    let fileIndex = 0;
    let settled = false;

    function fail(error) {
      if (settled) return;
      settled = true;
      reject(error);
    }

    const busboy = Busboy({
      headers: req.headers,
      limits: {
        fields: 50,
        files: MAX_FILES,
        fieldSize: 64 * 1024,
        fileSize: MAX_BODY_BYTES
      }
    });

    req.on("data", (chunk) => {
      totalBytes += chunk.length;
      if (totalBytes > MAX_BODY_BYTES) {
        fail(makeHttpError(413, "Request is larger than 25MB."));
        req.destroy();
      }
    });

    busboy.on("field", (name, value) => {
      fields[name] = String(value || "").trim();
    });

    busboy.on("file", (field, stream, info) => {
      const originalName = info.filename || "";
      if (!originalName) {
        stream.resume();
        return;
      }

      fileIndex += 1;
      const sanitizedName = sanitizeFilename(originalName, fileIndex);
      const ext = extensionFor(sanitizedName);
      const mimeType = (info.mimeType || "").toLowerCase();
      const chunks = [];
      let size = 0;
      let limited = false;

      stream.on("limit", () => {
        limited = true;
      });

      stream.on("data", (chunk) => {
        size += chunk.length;
        chunks.push(chunk);
      });

      stream.on("end", () => {
        if (limited || size > MAX_BODY_BYTES) {
          fail(makeHttpError(413, "Uploaded file is larger than 25MB."));
          return;
        }
        files.push({
          field,
          originalName,
          sanitizedName,
          ext,
          mimeType,
          size,
          buffer: Buffer.concat(chunks)
        });
      });
    });

    busboy.on("filesLimit", () => fail(makeHttpError(400, `Please upload no more than ${MAX_FILES} files.`)));
    busboy.on("error", fail);
    busboy.on("finish", () => {
      if (!settled) {
        settled = true;
        resolve({ fields, files, totalBytes });
      }
    });

    req.pipe(busboy);
  });
}

function validateSubmission(fields, files) {
  if (fields.website) throw makeHttpError(400, "Submission blocked.");

  const missing = REQUIRED_FIELDS.filter((key) => !fields[key]);
  if (missing.length) throw makeHttpError(400, `Missing required fields: ${missing.join(", ")}`);

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email)) {
    throw makeHttpError(400, "Please enter a valid email address.");
  }

  for (const file of files) {
    if (!ALLOWED_EXTENSIONS.has(file.ext)) {
      throw makeHttpError(400, "Only STL, PLY, ZIP, PDF, JPG, JPEG and PNG files are accepted.");
    }
    if (!isSupportedMime(file.ext, file.mimeType)) {
      throw makeHttpError(400, `File type does not match the extension for ${file.originalName}.`);
    }
  }
}

async function storeSubmission(caseId, fields, files, submittedAt) {
  if (!isR2Backend()) throw makeHttpError(500, "R2 storage is not configured.");
  if (process.env.SIMULATE_STORAGE_FAILURE === "1") throw makeHttpError(500, "Simulated storage failure.");

  const { put } = await storageClient();
  const usedNames = new Map();
  const storedFiles = [];

  for (const file of files) {
    const count = usedNames.get(file.sanitizedName) || 0;
    usedNames.set(file.sanitizedName, count + 1);
    const safeName = count ? file.sanitizedName.replace(/(\.[^.]+)?$/, `-${count}$1`) : file.sanitizedName;
    const pathname = `cases/${caseId}/${safeName}`;
    const blob = await put(pathname, file.buffer, {
      access: "private",
      allowOverwrite: false,
      contentType: file.mimeType || "application/octet-stream"
    });
    const token = signDownloadPath(pathname);
    storedFiles.push({
      originalName: file.originalName,
      filename: safeName,
      pathname,
      size: file.size,
      contentType: file.mimeType || "application/octet-stream",
      url: blob.url,
      downloadUrl: `${siteUrl()}/api/download-case-file?path=${encodeURIComponent(pathname)}&token=${token}`
    });
  }

  const metadata = {
    caseId,
    submittedAt,
    fields,
    files: storedFiles.map(({ originalName, filename, pathname, size, contentType, downloadUrl }) => ({
      originalName,
      filename,
      pathname,
      size,
      contentType,
      downloadUrl
    }))
  };

  await put(`cases/${caseId}/submission.json`, JSON.stringify(metadata, null, 2), {
    access: "private",
    allowOverwrite: false,
    contentType: "application/json"
  });

  return storedFiles;
}

function emailHtml({ caseId, fields, files, submittedAt }) {
  const rows = [
    ["Case ID", caseId],
    ["Name", fields.name],
    ["Company", fields.company],
    ["Email", fields.email],
    ["WhatsApp", fields.whatsapp],
    ["Country", fields.country],
    ["Case Type", fields.case_type],
    ["Implant Brand", fields.implant_brand],
    ["Implant System", fields.implant_system],
    ["Platform", fields.platform],
    ["Restoration Type", fields.restoration_type],
    ["Material", fields.material],
    ["Shade", fields.shade],
    ["Quantity", fields.quantity],
    ["Due Date", fields.due_date],
    ["Instructions", fields.instructions],
    ["Submission Timestamp", submittedAt]
  ];

  const fieldRows = rows.map(([label, value]) => `<tr><th align="left">${escapeHtml(label)}</th><td>${escapeHtml(value || "-")}</td></tr>`).join("");
  const fileRows = files.length
    ? files.map((file) => `<li>${escapeHtml(file.filename)} (${formatBytes(file.size)}) — <a href="${escapeHtml(file.downloadUrl)}">Download</a></li>`).join("")
    : "<li>No files uploaded.</li>";

  return `
    <h2>New YZH Case Submission</h2>
    <table cellpadding="6" cellspacing="0" border="1" style="border-collapse:collapse">${fieldRows}</table>
    <h3>Uploaded files</h3>
    <ul>${fileRows}</ul>
  `;
}

function emailText({ caseId, fields, files, submittedAt }) {
  const lines = [
    `Case ID: ${caseId}`,
    `Name: ${fields.name || "-"}`,
    `Company: ${fields.company || "-"}`,
    `Email: ${fields.email || "-"}`,
    `WhatsApp: ${fields.whatsapp || "-"}`,
    `Country: ${fields.country || "-"}`,
    `Case Type: ${fields.case_type || "-"}`,
    `Implant Brand: ${fields.implant_brand || "-"}`,
    `Implant System: ${fields.implant_system || "-"}`,
    `Platform: ${fields.platform || "-"}`,
    `Restoration Type: ${fields.restoration_type || "-"}`,
    `Material: ${fields.material || "-"}`,
    `Shade: ${fields.shade || "-"}`,
    `Quantity: ${fields.quantity || "-"}`,
    `Due Date: ${fields.due_date || "-"}`,
    `Instructions: ${fields.instructions || "-"}`,
    `Submission Timestamp: ${submittedAt}`,
    "",
    "Uploaded files:"
  ];
  if (!files.length) {
    lines.push("- No files uploaded.");
  } else {
    for (const file of files) {
      lines.push(`- ${file.filename} (${formatBytes(file.size)}): ${file.downloadUrl}`);
    }
  }
  return lines.join("\n");
}

async function sendNotification(payload) {
  const notificationEmail = process.env.CASE_NOTIFICATION_EMAIL || "yzhdentallab@gmail.com";
  const fromEmail = process.env.CASE_FROM_EMAIL;
  if (!process.env.RESEND_API_KEY) throw makeHttpError(500, "RESEND_API_KEY is not configured.");
  if (!fromEmail) throw makeHttpError(500, "CASE_FROM_EMAIL is not configured.");
  if (process.env.SIMULATE_EMAIL_FAILURE === "1") throw makeHttpError(500, "Simulated email notification failure.");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [notificationEmail],
      reply_to: payload.fields.email,
      subject: `New YZH Case Submission — ${payload.caseId} — ${payload.fields.case_type}`,
      html: emailHtml(payload),
      text: emailText(payload)
    })
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw makeHttpError(500, `Email notification failed${detail ? `: ${detail.slice(0, 240)}` : "."}`);
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    json(res, 405, { ok: false, error: "POST required" });
    return;
  }

  try {
    const { fields, files } = await parseMultipart(req);
    validateSubmission(fields, files);

    const caseId = generateCaseId();
    const submittedAt = new Date().toISOString();
    const storedFiles = await storeSubmission(caseId, fields, files, submittedAt);
    const payload = { caseId, fields, files: storedFiles, submittedAt };
    await sendNotification(payload);

    console.log(JSON.stringify({
      event: "case_submission_stored_and_notified",
      caseId,
      fileCount: storedFiles.length,
      submittedAt
    }));

    json(res, 200, {
      ok: true,
      caseId,
      message: "Your files were uploaded successfully. Our technical team will review the submission and reply by email or WhatsApp."
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    console.error(JSON.stringify({
      event: "case_submission_failed",
      statusCode,
      message: error.message
    }));
    json(res, statusCode, { ok: false, error: error.message || "Submission failed" });
  }
};
