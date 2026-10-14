const assert = require('node:assert/strict');
const { normalizeHomepage, DEFAULT_HOMEPAGE } = require('../lib/admin-store');
const policy = require('../lib/featured-selection');
const fixture = require('./fixtures/featured-production-public.json');

const records = fixture.cases;
assert.equal(records.length, 14);
const seven = policy.legacyIds(records, {});
assert.equal(seven.length, 7);
const config = { published: normalizeHomepage({ selectedWork: { caseIds: [] } }),
  draft: normalizeHomepage({ selectedWork: { caseIds: ['CASE-MUXMID60-04B3BF'] } }) };
assert.equal(policy.state(config, records).publishBlocked, true, 'stale draft must not publish');
assert.deepEqual(policy.publicIds(config.published, records), [], 'explicit [] never falls back');
for (const page of [{}, { selectedWork: {} }, { selectedWork: { caseIds: null } }]) {
  assert.equal(normalizeHomepage(page).selectedWork.caseIds, null, 'preserve missing/null');
  assert.deepEqual(policy.publicIds(page, records), seven);
}
config.draft.selectedWork.caseIds = seven;
config.draft.selectedWork.migrationApproval = policy.state(config, records).migrationToken;
assert.equal(policy.state(config, records).publishBlocked, false);
assert.deepEqual(JSON.parse(JSON.stringify(config)).draft.selectedWork.caseIds, seven);
const unchangedPublished = structuredClone(config.published);
config.draft.selectedWork.caseIds = seven.slice(1);
assert.equal(config.draft.selectedWork.caseIds.length, 6);
assert.deepEqual(config.published, unchangedPublished);
const newId = records.find(item => !item.featured).id;
config.draft.selectedWork.caseIds.push(newId);
const [last] = config.draft.selectedWork.caseIds.splice(6, 1);
config.draft.selectedWork.caseIds.splice(0, 0, last);
const plan = policy.preflight(config, records);
assert.equal(plan.targetIds[0], newId);
config.published = structuredClone(config.draft);
const mirrors = records.map(record => ({ ...record, featured: config.published.selectedWork.caseIds.includes(record.id) }));
assert.deepEqual(policy.publicIds(config.published, mirrors), config.draft.selectedWork.caseIds);
assert.equal(policy.state(config, mirrors).migrationRequired, false);
const incompleteMirror = mirrors.map((record, index) => ({ ...record, featured: index === 1 ? false : record.featured }));
assert.deepEqual(policy.state(config, incompleteMirror).legacyPublicIds, config.published.selectedWork.caseIds,
  'a partial mirror update must not replace canonical public membership');
config.draft.selectedWork.caseIds = [];
config.published = structuredClone(config.draft);
const emptyMirrors = mirrors.map(record => ({ ...record, featured: false }));
assert.deepEqual(policy.publicIds(config.published, emptyMirrors), []);
assert.equal(policy.state(config, emptyMirrors).migrationRequired, false);
const changed = structuredClone(config);
changed.draft.hero.heading = 'Different draft';
assert.notEqual(policy.preflight(changed, emptyMirrors).confirmationToken, policy.preflight(config, emptyMirrors).confirmationToken);
const unpublished = records.map(record => ({ ...record, status: record.id === seven[0] ? 'draft' : record.status }));
assert(!policy.publicIds({ selectedWork: { caseIds: seven } }, unpublished).includes(seven[0]));
assert.deepEqual(policy.publicIds(DEFAULT_HOMEPAGE, records), []);
console.log('Featured selection: 14-case fixture, stale guard, import, persistence, edit/order, mirror, [], missing/null, draft isolation and confirmation freshness passed.');
