const { protect, reply } = require("../lib/admin-http");
const { listSubmissions } = require("../lib/admin-store");
const { listRecords } = require("../lib/case-store");

module.exports = async function handler(req, res) {
  if (!protect(req, res)) return;
  if (req.method !== "GET") return reply(res, 405, { ok: false, error: "Method not allowed." });
  try {
    const [cases, submissions] = await Promise.all([listRecords(), listSubmissions()]);
    const published = cases.filter((item) => item.status === "published");
    const drafts = cases.filter((item) => item.status !== "published");
    const fresh = submissions.filter((item) => item.status === "New");
    return reply(res, 200, {
      ok: true,
      counts: { publishedCases: published.length, draftCases: drafts.length, newSubmissions: fresh.length },
      recentSubmissions: submissions.slice(0, 5).map((item) => ({ caseId: item.caseId, submittedAt: item.submittedAt, name: item.fields?.name || "", company: item.fields?.company || "", caseType: item.fields?.case_type || "", status: item.status })),
      recentPublished: published.slice(0, 5).map((item) => ({ id: item.id, title: item.title, category: item.category, publishedAt: item.publishedAt }))
    });
  } catch (error) {
    console.error("admin_dashboard_error", error);
    return reply(res, 500, { ok: false, error: "Dashboard data is temporarily unavailable." });
  }
};
