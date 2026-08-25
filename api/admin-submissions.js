const { protect, query, readJson, reply } = require("../lib/admin-http");
const { getSubmission, listSubmissions, saveSubmissionStatus } = require("../lib/admin-store");

function adminSubmission(item, detail = false) {
  const base = {
    caseId: item.caseId,
    submittedAt: item.submittedAt,
    status: item.status,
    fields: item.fields || {},
    fileCount: item.files?.length || 0
  };
  if (!detail) return base;
  return {
    ...base,
    files: (item.files || []).map((file, index) => ({
      index,
      originalName: file.originalName,
      filename: file.filename,
      size: file.size,
      contentType: file.contentType,
      downloadUrl: `/api/admin-submission-file?caseId=${encodeURIComponent(item.caseId)}&file=${index}`
    }))
  };
}

module.exports = async function handler(req, res) {
  if (!protect(req, res)) return;
  try {
    if (req.method === "GET") {
      const id = query(req, "id");
      if (id) {
        const item = await getSubmission(id);
        return item ? reply(res, 200, { ok: true, submission: adminSubmission(item, true) }) : reply(res, 404, { ok: false, error: "Submission not found." });
      }
      const items = await listSubmissions();
      return reply(res, 200, { ok: true, submissions: items.map((item) => adminSubmission(item)) });
    }
    if (req.method === "PUT") {
      const body = await readJson(req);
      await saveSubmissionStatus(body.caseId, body.status);
      const item = await getSubmission(body.caseId);
      return reply(res, 200, { ok: true, submission: adminSubmission(item, true) });
    }
    return reply(res, 405, { ok: false, error: "Method not allowed." });
  } catch (error) {
    console.error("admin_submissions_error", error);
    return reply(res, error.statusCode || 500, { ok: false, error: error.statusCode ? error.message : "Submissions are temporarily unavailable." });
  }
};
