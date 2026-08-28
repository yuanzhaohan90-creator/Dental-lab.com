const { clearSessionCookie, hasValidOrigin, isAdmin, setSessionCookie, verifyPassword } = require("../lib/case-auth");

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

module.exports = async function handler(req, res) {
  try {
    if (req.method === "GET") return reply(res, 200, { authenticated: isAdmin(req) });
    if (!hasValidOrigin(req)) return reply(res, 403, { ok: false, error: "Invalid request origin." });
    if (req.method === "POST") {
      const body = await readJson(req);
      if (!verifyPassword(body.password)) return reply(res, 401, { ok: false, error: "Invalid password." });
      const sessionToken = setSessionCookie(res);
      return reply(res, 200, { ok: true, authenticated: true, sessionToken });
    }
    if (req.method === "DELETE") {
      clearSessionCookie(res);
      return reply(res, 200, { ok: true, authenticated: false });
    }
    res.setHeader("Allow", "GET, POST, DELETE");
    return reply(res, 405, { ok: false, error: "Method not allowed." });
  } catch (error) {
    console.error("admin_auth_error", error);
    return reply(res, 500, { ok: false, error: "Authentication is temporarily unavailable." });
  }
};
