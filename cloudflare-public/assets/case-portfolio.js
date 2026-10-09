(function (root, factory) {
  const portfolio = factory();
  if (typeof module === "object" && module.exports) module.exports = portfolio;
  else root.CasePortfolio = portfolio;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function select(records, category = "") {
    const seen = new Set();
    const published = records.filter((item) => {
      const key = item.id || item.slug;
      if (!key || seen.has(key) || (item.status && item.status !== "published")) return false;
      seen.add(key);
      return true;
    });
    const filtered = category ? published.filter((item) => item.category === category) : published;
    const featured = filtered.filter((item) => item.featured || item.contentType === "case_study");
    const featuredIds = new Set(featured.map((item) => item.id || item.slug));
    return {
      published, filtered, featured,
      recent: filtered.filter((item) => !featuredIds.has(item.id || item.slug)),
      categories: [...new Set(published.map((item) => item.category).filter(Boolean))]
    };
  }
  return { select };
});
