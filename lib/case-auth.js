const crypto = require("node:crypto");

const COOKIE_NAME = "yzh_case_admin";
const SESSION_SECONDS = 12 * 60 * 60;
const PBKDF2_ITERATIONS = 310000;

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
  const cookieSession = parseCookies(req.headers.cookie)[COOKIE_NAME];
  const authorization = String(req.headers.authorization || "");
  const bearerSession = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  return verifySession(cookieSession) || verifySession(bearerSession);
}

function fromHex(value) {
  return Uint8Array.from(String(value || "").match(/.{1,2}/g) || [], (byte) => Number.parseInt(byte, 16));
}

function toHex(value) {
  return Buffer.from(value).toString("hex");
}

async function pbkdf2Hex(password, salt, iterations = PBKDF2_ITERATIONS) {
  const subtle = globalThis.crypto?.subtle || crypto.webcrypto?.subtle;
  if (!subtle) {
    return crypto.pbkdf2Sync(String(password || ""), salt, iterations, 64, "sha256").toString("hex");
  }
  const key = await subtle.importKey(
    "raw",
    new TextEncoder().encode(String(password || "")),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: new TextEncoder().encode(salt), iterations },
    key,
    512
  );
  return toHex(new Uint8Array(bits));
}

async function verifyPassword(password) {
  const parts = env("CASE_ADMIN_PASSWORD_HASH").split("$");
  const [scheme] = parts;
  let actual = "";
  let expected = "";
  if (scheme === "scrypt") {
    const [, salt, scryptExpected] = parts;
    if (!salt || !scryptExpected) return false;
    actual = crypto.scryptSync(String(password || ""), salt, 64).toString("hex");
    expected = scryptExpected;
  } else if (scheme === "pbkdf2") {
    const [, iterationsRaw, salt, pbkdfExpected] = parts;
    const iterations = Number(iterationsRaw);
    if (!salt || !pbkdfExpected || !Number.isSafeInteger(iterations) || iterations < 100000) return false;
    actual = await pbkdf2Hex(password, salt, iterations);
    expected = pbkdfExpected;
  } else if (scheme === "hmac-sha256") {
    const [, salt, hmacExpected] = parts;
    if (!salt || !hmacExpected) return false;
    actual = crypto.createHmac("sha256", salt).update(String(password || "")).digest("hex");
    expected = hmacExpected;
  } else {
    return false;
  }
  return actual.length === expected.length && crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
}

function setSessionCookie(res) {
  const token = createSession();
  const expires = new Date(Date.now() + SESSION_SECONDS * 1000).toUTCString();
  res.setHeader("Set-Cookie", `${COOKIE_NAME}=${token}; Path=/; Max-Age=${SESSION_SECONDS}; Expires=${expires}; HttpOnly; Secure; SameSite=Lax`);
  return token;
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
  pbkdf2Hex,
  PBKDF2_ITERATIONS,
  setSessionCookie,
  verifyPassword,
  verifySession
};
