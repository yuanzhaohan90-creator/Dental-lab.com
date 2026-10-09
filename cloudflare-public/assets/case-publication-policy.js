(function (root, factory) {
  const policy = factory();
  if (typeof module === "object" && module.exports) module.exports = policy;
  else root.CasePublicationPolicy = policy;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function hasPublicationHistory(record) {
    return Boolean(record && (record.hasBeenPublished === true || record.firstPublishedAt || record.publishedAt || record.status === "published" || record.previousStatus === "published"));
  }
  function missingPublicationFields(record) {
    const text = (value) => String(value || "").trim();
    const images = record.images || [];
    const missing = [];
    if (text(record.title).split(/\s+/).filter(Boolean).length < 3) missing.push("专业案例标题（至少三个词）");
    if (!text(record.category)) missing.push("案例分类");
    if (!images.some((image) => image.isCover)) missing.push("封面图");
    if (![record.technicalSummary, record.caseOverview, record.shortNote, record.challenge, record.planning, record.technicalOutcome].some(text)) missing.push("真实案例说明");
    if (![record.material, record.restorationType, record.implantSystem, record.platform, record.technicalReview].some(text)) missing.push("修复体技术信息");
    if (!images.length || images.some((image) => !text(image.altText))) missing.push("所有图片的 ALT");
    if (!text(record.seoTitle) || !text(record.metaDescription)) missing.push("SEO 标题和描述");
    return missing;
  }
  function publicationErrors(record, current) {
    return record.status === "published" && !hasPublicationHistory(current) ? missingPublicationFields(record) : [];
  }
  return { hasPublicationHistory, missingPublicationFields, publicationErrors };
});
