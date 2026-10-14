const crypto = require('node:crypto');

function configured(page) {
  return Array.isArray(page?.selectedWork?.caseIds);
}

function ids(page) {
  return configured(page) ? [...new Set(page.selectedWork.caseIds.filter(Boolean))] : null;
}

function legacyIds(records, page) {
  const order = ids(page) || [];
  return records.filter(item => item.status === 'published' && item.featured)
    .sort((a, b) => {
      const left = order.indexOf(a.id), right = order.indexOf(b.id);
      return (left < 0 ? 999 : left) - (right < 0 ? 999 : right);
    }).slice(0, 9).map(item => item.id);
}

function publicIds(page, records) {
  const selection = ids(page);
  const published = new Set(records.filter(item => item.status === 'published').map(item => item.id));
  return (selection === null ? legacyIds(records, page) : selection).filter(id => published.has(id));
}

function changes(before, after) {
  return { added: after.filter(id => !before.includes(id)), removed: before.filter(id => !after.includes(id)),
    reordered: before.filter(id => after.includes(id)).join('|') !== after.filter(id => before.includes(id)).join('|') };
}

function fingerprint(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function state(config, records) {
  const publishedIds = publicIds(config.published, records);
  const mirrorIds = legacyIds(records, config.published);
  const draftIds = ids(config.draft);
  const mismatch = publishedIds.length !== mirrorIds.length || publishedIds.some(id => !mirrorIds.includes(id));
  // Legacy [] was previously rendered from case.featured. It is only a migration
  // candidate now; it never becomes a normal public rendering fallback.
  const migrationRequired = !configured(config.published) || mismatch;
  const legacyEmpty = !configured(config.published) || (publishedIds.length === 0 && mirrorIds.length > 0 && !config.published?.selectedWork?.migrationApproval);
  const sourceIds = legacyEmpty ? mirrorIds : publishedIds;
  const migrationToken = fingerprint({ published: ids(config.published), sourceIds });
  const imported = config.draft?.selectedWork?.migrationApproval === migrationToken;
  return { publishedIds, draftIds, legacyPublicIds: sourceIds, migrationRequired, imported,
    draftDiffers: JSON.stringify(draftIds) !== JSON.stringify(publishedIds),
    draftMismatch: JSON.stringify(draftIds) !== JSON.stringify(sourceIds), migrationToken,
    publishBlocked: migrationRequired && !imported };
}

function preflight(config, records, action = 'publish') {
  const current = state(config, records);
  const target = action === 'restore' ? config.previous : config.draft;
  const targetIds = ids(target);
  return { ...current, targetIds, ...changes(current.publishedIds, targetIds || []),
    confirmationToken: fingerprint({ action, published: config.published, target, mirror: current.legacyPublicIds }) };
}

module.exports = { configured, ids, legacyIds, publicIds, changes, fingerprint, state, preflight };
