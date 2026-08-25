const { protect, query, readJson, reply } = require("../lib/admin-http");
const { DEFAULT_SETTINGS, getConfig, normalizeSettings, publishConfig, restoreConfig, saveConfigDraft } = require("../lib/admin-store");

module.exports = async function handler(req, res) {
  if (!protect(req, res)) return;
  try {
    if (req.method === "GET") return reply(res, 200, { ok: true, settings: await getConfig("settings", DEFAULT_SETTINGS) });
    if (req.method === "PUT") {
      const saved = await saveConfigDraft("settings", DEFAULT_SETTINGS, await readJson(req), normalizeSettings);
      return reply(res, 200, { ok: true, settings: saved });
    }
    if (req.method === "POST") {
      const action = query(req, "action");
      const saved = action === "restore" ? await restoreConfig("settings", DEFAULT_SETTINGS, normalizeSettings) : await publishConfig("settings", DEFAULT_SETTINGS, normalizeSettings);
      return reply(res, 200, { ok: true, settings: saved });
    }
    return reply(res, 405, { ok: false, error: "Method not allowed." });
  } catch (error) {
    console.error("admin_settings_error", error);
    return reply(res, error.statusCode || 500, { ok: false, error: error.statusCode ? error.message : "Settings could not be updated." });
  }
};
