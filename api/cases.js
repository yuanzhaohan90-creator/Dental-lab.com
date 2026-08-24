const { getRecordBySlug, listRecords, publicRecord } = require("../lib/case-store");

function reply(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

function query(req, key) {
  if (req.query && req.query[key]) return String(req.query[key]);
  return new URL(req.url, "https://yzhdentallab.com").searchParams.get(key) || "";
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return reply(res, 405, { ok: false, error: "Method not allowed." });
  }
  try {
    const slug = query(req, "slug");
    if (slug) {
      const record = await getRecordBySlug(slug);
      if (!record || record.status !== "published") return reply(res, 404, { ok: false, error: "Case not found." });
      return reply(res, 200, { ok: true, case: publicRecord(record, true) });
    }
    const records = (await listRecords()).filter((record) => record.status === "published");
    return reply(res, 200, { ok: true, cases: records.map((record) => publicRecord(record)) });
  } catch (error) {
    console.error("public_cases_error", error);
    return reply(res, 500, { ok: false, error: "The case library is temporarily unavailable." });
  }
};
