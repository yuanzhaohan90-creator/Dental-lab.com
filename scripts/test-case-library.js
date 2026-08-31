const assert = require("assert");
const crypto = require("crypto");
const { createSession, isAdmin, verifyPassword, verifySession } = require("../lib/case-auth");
const { CATEGORIES, IMAGE_TYPES, duplicateRecordData, normalizeFields, validateRecord } = require("../lib/case-store");
const { CANONICAL_CASE_SLUG, canonicalPublicRecords, canonicalSlugFor, normalizePublicCase } = require("../lib/public-cases");

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
assert.equal(isAdmin({ headers: { cookie: `yzh_case_admin=${createSession()}` } }), true);
assert.equal(isAdmin({ headers: { authorization: `Bearer ${createSession()}` } }), true);
assert.equal(isAdmin({ headers: { authorization: "Bearer invalid" } }), false);

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
assert.doesNotThrow(() => validateRecord({ ...normalized, images: [{ isCover: true }] }));
assert.throws(() => validateRecord({ ...normalized, images: [{ isCover: true }, ...Array.from({ length: 7 }, () => ({ isCover: false }))] }), /up to 6/);
const study = normalizeFields({ title: "Featured", category: CATEGORIES[1], contentType: "case_study" });
assert.doesNotThrow(() => validateRecord({ ...study, images: [{ isCover: true }] }));

const source = {
  ...study,
  id: "CASE-ORIGINAL",
  slug: "featured",
  title: "Featured",
  status: "published",
  featured: true,
  material: "Zirconia",
  implantSystem: "Test system",
  caseOverview: "Overview",
  images: [{ id: "IMG-ORIGINAL", pathname: "case-library/images/shared.webp", caption: "Final", imageType: "Final", sortOrder: -1, isCover: true }],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  publishedAt: "2026-01-01T00:00:00.000Z"
};
const duplicate = duplicateRecordData(source, { id: "CASE-COPY", slug: "copy-of-featured", now: "2026-02-01T00:00:00.000Z" });
assert.equal(duplicate.id, "CASE-COPY");
assert.equal(duplicate.slug, "copy-of-featured");
assert.equal(duplicate.title, "Copy of Featured");
assert.equal(duplicate.status, "draft");
assert.equal(duplicate.featured, false);
assert.equal(duplicate.publishedAt, null);
assert.equal(duplicate.material, source.material);
assert.equal(duplicate.implantSystem, source.implantSystem);
assert.equal(duplicate.caseOverview, source.caseOverview);
assert.equal(duplicate.images[0].pathname, source.images[0].pathname);
assert.equal(duplicate.images[0].caption, source.images[0].caption);
assert.notEqual(duplicate.images[0].id, source.images[0].id);

const publicRecords = canonicalPublicRecords([
  { status: "published", slug: CANONICAL_CASE_SLUG },
  { status: "published", slug: "4-unit-anterior-zirconia-esthetic-restoration" },
  { status: "published", slug: "copy-of-4-unit-anterior-zirconia-esthetic-restoration" }
]);
assert.deepEqual(publicRecords.map((item) => item.slug), [CANONICAL_CASE_SLUG]);
assert.equal(canonicalSlugFor("4-unit-anterior-zirconia-esthetic-restoration"), CANONICAL_CASE_SLUG);
assert.deepEqual(normalizePublicCase({ title: "Copy of Anterior Zirconia", shade: "a3" }), { title: "Anterior Zirconia", shade: "A3" });

console.log("case-library unit tests passed");
