const { hasValidOrigin, isAdmin } = require("./case-auth");

function reply(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function protect(req, res) {
  if (!isAdmin(req)) {
    reply(res, 401, { ok: false, error: "Authentication required." });
    return false;
  }
  if (!["GET", "HEAD"].includes(req.method) && !hasValidOrigin(req)) {
    reply(res, 403, { ok: false, error: "Invalid request origin." });
    return false;
  }
  return true;
}

function query(req, key) {
  if (req.query && req.query[key]) return String(req.query[key]);
  return new URL(req.url, "https://yzhdentallab.com").searchParams.get(key) || "";
}

module.exports = { protect, query, readJson, reply };
