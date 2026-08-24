const crypto = require("crypto");

const COOKIE_NAME = "yzh_case_admin";
const SESSION_SECONDS = 12 * 60 * 60;

function env(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

function parseCookies(header = "") {
  return Object.fromEntries(
    String(header)
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf("=");
        return index === -1 ? [part, ""] : [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
      })
  );
}

function sign(value) {
  return crypto.createHmac("sha256", env("CASE_SESSION_SECRET")).update(value).digest("base64url");
}

function createSession(now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ issuedAt: now, expiresAt: now + SESSION_SECONDS * 1000 })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

function verifySession(token, now = Date.now()) {
  if (!token || !token.includes(".")) return false;
  const [payload, signature] = token.split(".");
  const expected = sign(payload);
  if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return Number(data.expiresAt) > now && Number(data.issuedAt) <= now;
  } catch {
    return false;
  }
}

function isAdmin(req) {
  return verifySession(parseCookies(req.headers.cookie)[COOKIE_NAME]);
}

function verifyPassword(password) {
  const [scheme, salt, expected] = env("CASE_ADMIN_PASSWORD_HASH").split("$");
  if (scheme !== "scrypt" || !salt || !expected) return false;
  const actual = crypto.scryptSync(String(password || ""), salt, 64).toString("hex");
  return actual.length === expected.length && crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
}

function setSessionCookie(res) {
  res.setHeader("Set-Cookie", `${COOKIE_NAME}=${createSession()}; Path=/; Max-Age=${SESSION_SECONDS}; HttpOnly; Secure; SameSite=Strict`);
}

function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", `${COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`);
}

function hasValidOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    const host = String(req.headers["x-forwarded-host"] || req.headers.host || "").split(",")[0].trim();
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

module.exports = {
  clearSessionCookie,
  createSession,
  hasValidOrigin,
  isAdmin,
  setSessionCookie,
  verifyPassword,
  verifySession
};
