const { protect, query, readJson, reply } = require("../lib/admin-http");
const { DEFAULT_HOMEPAGE, getConfig, normalizeHomepage, publishConfig, restoreConfig, saveConfigDraft } = require("../lib/admin-store");
const { listRecords, publicRecord, saveRecord } = require("../lib/case-store");

async function validateSelection(value) {
  const ids = value?.selectedWork?.caseIds || [];
  if (!Array.isArray(ids)) throw Object.assign(new Error("Selected cases must be a list."), { statusCode: 400 });
  if (ids.length > 3) throw Object.assign(new Error("Select no more than three homepage cases."), { statusCode: 400 });
  const cases = await listRecords();
  const published = new Set(cases.filter((item) => item.status === "published").map((item) => item.id));
  if (ids.some((id) => !published.has(id))) throw Object.assign(new Error("Homepage work must use published cases."), { statusCode: 400 });
}

async function syncFeaturedCases(ids) {
  const selected = new Set(ids);
  const cases = await listRecords();
  for (const item of cases.filter((record) => record.featured && !selected.has(record.id))) {
    await saveRecord({ ...item, featured: false, updatedAt: new Date().toISOString() });
  }
  for (const id of ids) {
    const item = cases.find((record) => record.id === id);
    if (item && !item.featured) await saveRecord({ ...item, featured: true, updatedAt: new Date().toISOString() });
  }
}

async function responseData(config) {
  const cases = await listRecords();
  return {
    config,
    publishedCases: cases.filter((item) => item.status === "published").map((item) => publicRecord(item))
  };
}

module.exports = async function handler(req, res) {
  if (!protect(req, res)) return;
  try {
    if (req.method === "GET") return reply(res, 200, { ok: true, ...(await responseData(await getConfig("homepage", DEFAULT_HOMEPAGE))) });
    if (req.method === "PUT") {
      const body = await readJson(req);
      await validateSelection(body);
      const saved = await saveConfigDraft("homepage", DEFAULT_HOMEPAGE, body, normalizeHomepage);
      return reply(res, 200, { ok: true, ...(await responseData(saved)) });
    }
    if (req.method === "POST") {
      const action = query(req, "action");
      const current = await getConfig("homepage", DEFAULT_HOMEPAGE);
      const target = action === "restore" ? current.previous : current.draft;
      if (!target) throw Object.assign(new Error("No previous published version is available."), { statusCode: 400 });
      await validateSelection(target);
      await syncFeaturedCases(target.selectedWork.caseIds);
      const saved = action === "restore" ? await restoreConfig("homepage", DEFAULT_HOMEPAGE, normalizeHomepage) : await publishConfig("homepage", DEFAULT_HOMEPAGE, normalizeHomepage);
      return reply(res, 200, { ok: true, ...(await responseData(saved)) });
    }
    return reply(res, 405, { ok: false, error: "Method not allowed." });
  } catch (error) {
    console.error("admin_homepage_error", error);
    return reply(res, error.statusCode || 500, { ok: false, error: error.statusCode ? error.message : "Homepage content could not be updated." });
  }
};
