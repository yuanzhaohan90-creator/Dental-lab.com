const CANONICAL_CASE_SLUG = "anterior-zirconia-esthetic-restorations-7-10";
const { publicField } = require("./seo-presentation");
const DUPLICATE_CASE_SLUGS = new Set([
  "copy-of-4-unit-anterior-zirconia-esthetic-restoration",
  "4-unit-anterior-zirconia-esthetic-restoration"
]);

function canonicalSlugFor(slug) {
  return DUPLICATE_CASE_SLUGS.has(String(slug || "")) ? CANONICAL_CASE_SLUG : String(slug || "");
}

function isDuplicateCaseSlug(slug) {
  return DUPLICATE_CASE_SLUGS.has(String(slug || ""));
}

function normalizePublicCase(item) {
  if (!item) return item;
  const title = String(item.title || "").replace(/^Copy of\s+/i, "").trim();
  const technical = Object.fromEntries(["platform", "implantSystem", "material"]
    .filter((key) => Object.hasOwn(item, key)).map((key) => [key, publicField(item[key])]));
  return {
    ...item,
    ...technical,
    title,
    shade: String(publicField(item.shade) || "").toUpperCase()
  };
}

function canonicalPublicRecords(records = []) {
  const published = records.filter((record) => record?.status === "published");
  const canonicalExists = published.some((record) => record.slug === CANONICAL_CASE_SLUG);
  return published.filter((record) => {
    if (!isDuplicateCaseSlug(record.slug)) return true;
    return !canonicalExists;
  });
}

module.exports = {
  CANONICAL_CASE_SLUG,
  DUPLICATE_CASE_SLUGS,
  canonicalPublicRecords,
  canonicalSlugFor,
  isDuplicateCaseSlug,
  normalizePublicCase
};
