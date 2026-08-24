const assert = require("assert");
const crypto = require("crypto");
const { createSession, verifyPassword, verifySession } = require("../lib/case-auth");
const { CATEGORIES, IMAGE_TYPES, normalizeFields } = require("../lib/case-store");

const password = "test-admin-password";
const salt = "unit-test-salt";
process.env.CASE_ADMIN_PASSWORD_HASH = `scrypt$${salt}$${crypto.scryptSync(password, salt, 64).toString("hex")}`;
process.env.CASE_SESSION_SECRET = "unit-test-session-secret-with-sufficient-entropy";

assert.equal(verifyPassword(password), true);
assert.equal(verifyPassword("wrong-password"), false);

const session = createSession(1000);
assert.equal(verifySession(session, 2000), true);
assert.equal(verifySession(session, 1000 + 13 * 60 * 60 * 1000), false);
assert.equal(verifySession(`${session}x`, 2000), false);

const normalized = normalizeFields({
  title: "  Full-Arch Test  ",
  category: CATEGORIES[0],
  tags: "zirconia, MUA, zirconia",
  featured: true,
  status: "published"
});
assert.equal(normalized.title, "Full-Arch Test");
assert.equal(normalized.category, "Full-Arch / All-on-X");
assert.equal(normalized.status, "published");
assert.equal(normalized.featured, true);
assert.deepEqual(normalized.tags, ["zirconia", "MUA", "zirconia"]);
assert.equal(IMAGE_TYPES.includes("QC"), true);

console.log("case-library unit tests passed");
