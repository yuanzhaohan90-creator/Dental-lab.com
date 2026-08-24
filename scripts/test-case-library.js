const assert = require("assert");
const crypto = require("crypto");
const { createSession, verifyPassword, verifySession } = require("../lib/case-auth");
const { CATEGORIES, IMAGE_TYPES, normalizeFields, validateRecord } = require("../lib/case-store");

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
  contentType: "quick_work",
  shortNote: "  Everyday completed work  ",
  tags: "zirconia, MUA, zirconia",
  featured: true,
  status: "published"
});
assert.equal(normalized.title, "Full-Arch Test");
assert.equal(normalized.category, "Full-Arch / All-on-X");
assert.equal(normalized.contentType, "quick_work");
assert.equal(normalized.shortNote, "Everyday completed work");
assert.equal(normalized.status, "published");
assert.equal(normalized.featured, true);
assert.deepEqual(normalized.tags, ["zirconia", "MUA", "zirconia"]);
assert.equal(IMAGE_TYPES.includes("QC"), true);
assert.equal(IMAGE_TYPES.includes("Ti-base"), true);

assert.doesNotThrow(() => validateRecord({
  ...normalized,
  images: [{ isCover: true }, { isCover: false }]
}));
assert.throws(() => validateRecord({ ...normalized, images: [{ isCover: true }] }), /additional image/);
const study = normalizeFields({ title: "Featured", category: CATEGORIES[1], contentType: "case_study" });
assert.doesNotThrow(() => validateRecord({ ...study, images: [{ isCover: true }] }));

console.log("case-library unit tests passed");
