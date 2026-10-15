const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { load } = require('cheerio');
const { defaultPublicSiteData } = require('../lib/public-site-data');
const { renderPublicPage } = require('../lib/public-page-renderer');
const { renderCasePage } = require('../api/case-page');
const { caseTopics, relatedServices, serviceCases } = require('../lib/service-case-links');
const { CASE_DESCRIPTION_CORRECTIONS } = require('../lib/seo-presentation');
const { SERVICES } = require('../lib/service-content');
const fixture = require('./fixtures/seo-phase2a-public.json');
const before = JSON.stringify(fixture);
const data = { ...defaultPublicSiteData(), publishedCases: fixture.cases };
const output = path.resolve('test-results/seo-phase2a');
fs.mkdirSync(output, { recursive: true });
const relations = [], descriptions = [];
assert.equal(fixture.cases.length, 14);
const tiBase = fixture.cases.find(c => c.id === 'CASE-MU3QD0N3-1CB1AE');
assert.equal(caseTopics(tiBase).bar, false);
assert.equal(caseTopics(fixture.cases.find(c => c.id === 'CASE-MV6GPYMW-380048')).bar, false);
for (const material of ['titanium', 'Titanium base', 'Ti-base', 'Titanium abutment']) assert.equal(caseTopics({ title: 'Implant Crown', material }).bar, false);
for (const title of ['Titanium bar', 'Split-bar design', 'Metal Framework']) assert.equal(caseTopics({ title }).bar, true);
for (const c of fixture.cases) {
  const $ = load(renderCasePage(c, false, {}, fixture.cases));
  assert.equal($('h1').text(), c.title);
  assert.equal($('link[rel=canonical]').attr('href'), 'https://yzhdentallab.com/cases/' + c.slug);
  for (const a of $('.case-journey-nav a').toArray()) assert.equal($($(a).attr('href')).length, 1);
  const links = relatedServices(c);
  relations.push({ id: c.id, topics: caseTopics(c), links });
  const expected = CASE_DESCRIPTION_CORRECTIONS[c.id];
  if (expected) {
    assert.equal(c.metaDescription, expected[0]);
    const actual = $('meta[name=description]').attr('content');
    assert.equal(actual, expected[1]); assert(actual.length <= 160 && actual.endsWith('.'));
    assert.equal($('meta[property="og:description"]').attr('content'), actual);
    descriptions.push({ id: c.id, before: c.metaDescription, after: actual, result: 'PASS' });
    const custom = load(renderCasePage({ ...c, metaDescription: 'A later owner-written complete description.' }, false, {}));
    assert.equal(custom('meta[name=description]').attr('content'), 'A later owner-written complete description.');
  }
}
assert.equal(descriptions.length, 6);
for (const [page, definition] of Object.entries(SERVICES)) {
  const pageData = structuredClone(data);
  if (page === 'implant') pageData.pages.implant.hero.primaryDestination = '/cases';
  const $ = load(renderPublicPage(page, pageData));
  assert.equal($('h1').length, 1);
  assert.equal($('link[rel=canonical]').length, 1);
  assert.equal($('link[rel=canonical]').attr('href'), 'https://yzhdentallab.com' + definition.path);
  assert.equal($('.page-hero .btn-primary').attr('href'), '/submit-case');
  const cards = $('[data-service-cases] .case-portfolio-card > a');
  assert(cards.length > 0, page + ' matching real Published evidence');
  for (const a of cards.toArray()) {
    const record = fixture.cases.find(c => $(a).attr('href') === '/cases/' + c.slug);
    assert(record && serviceCases(page, fixture.cases).some(c => c.id === record.id));
    assert.equal(record.status, 'published');
  }
  const schemas = $('script[type="application/ld+json"]').toArray().map(el => JSON.parse($(el).text()));
  assert.equal(schemas.filter(s => s['@type'] === 'BreadcrumbList').length, 1);
  assert.equal(schemas.filter(s => s['@type'] === 'Service').length, 1);
  assert(!schemas.some(s => s['@type'] === 'VideoObject'));
  assert.equal(new Set($('main h2').toArray().map(el => $(el).text())).size, $('main h2').length, page + ' duplicate headings');
  if (page === 'implant') assert.equal($('.implant-reference-card').length, 4);
  if (page === 'exocadOutsourcing') assert.equal($('h2').filter((_, el) => $(el).text() === 'Design Scope').closest('.wrap').length, 1);
  const empty = load(renderPublicPage(page, { ...data, publishedCases: [{ ...fixture.cases[0], status: 'draft' }] }));
  assert.equal(empty('[data-service-cases]').length, 0);
}
assert.equal(JSON.stringify(fixture), before, 'Rendering must not mutate case data');
assert.equal(fixture.cases.find(c => c.slug === 'implant').title, 'implant');
fs.writeFileSync(path.join(output, 'unit.json'), JSON.stringify({ cases:14, descriptions, relations, result:'PASS' }, null, 2));
console.log('SEO Phase 2A: five services, 14 real case records, six descriptions, draft exclusion, Ti-base/bar rules, schemas and no data mutation passed.');
