const assert = require('node:assert/strict');
const { load } = require('cheerio');
const { completeText, caseSeoTitle } = require('../lib/seo-presentation');
const { normalizePublicCase } = require('../lib/public-cases');
const { shouldSubmitCase, isAllowedPublicUrl, hasIndexableChange } = require('../lib/indexnow');
const { defaultPublicSiteData } = require('../lib/public-site-data');
const { renderPublicPage } = require('../lib/public-page-renderer');
const { renderCasePage } = require('../api/case-page');
const fixture = require('./fixtures/featured-production-public.json');

assert.equal(completeText('One complete sentence with extra words.', 24), 'One complete sentence');
assert.equal(caseSeoTitle('Real case | YZH | YZH Dental Lab'), 'Real case | YZH Dental Lab');
assert.equal(normalizePublicCase({ shade: 'NOT SPECIFIED IN THE SUPPLIED CASE RECORDS' }).shade, '');
assert.equal(hasIndexableChange({ heading: 'Real work', updatedAt: 'a' }, { heading: 'Real work', updatedAt: 'b' }), false);
assert.equal(hasIndexableChange({ selectedWork: { caseIds: ['A'], migrationApproval: 'old' } }, { selectedWork: { caseIds: ['A'], migrationApproval: 'new' } }), false);
assert.equal(hasIndexableChange({ selectedWork: { caseIds: ['A', 'B'] } }, { selectedWork: { caseIds: ['B', 'A'] } }), true);
assert.equal(hasIndexableChange({ heading: 'Before' }, { heading: 'After' }), true);
assert.equal(hasIndexableChange({ heading: 'Before' }, { heading: 'After', noindex: true }), false);
const data = defaultPublicSiteData();
for (const [page, link] of [['designOnly', '/exocad-design-outsourcing'], ['digital', '/exocad-design-outsourcing'], ['implant', '/implant-bar-design'], ['fullArch', '/implant-bar-design']]) {
  assert(load(renderPublicPage(page, data))(`main a[href='${link}']`).length);
}
const about = load(renderPublicPage('about', { ...data, pages: { ...data.pages, about: {
  ...data.pages.about, equipmentGallery: [{ title: 'YZH_Precision_Abutment_Grinding_Website_16x9', media: { fallbackPath: '/assets/real/production-floor-10.jpg' } }]
} } }));
assert(about('main').text().includes('Precision Abutment Grinding'));
assert(!about('main').text().includes('_Website_16x9'));
for (const record of fixture.cases) {
  const input = { ...record, images: [{ id: 'IMG-QA', isCover: true, altText: 'Independent cover ALT', caption: 'Different caption' },
    { id: 'IMG-QA-2', imageType: 'Design', altText: 'Independent design ALT', caption: 'Design caption' }] };
  const html = load(renderCasePage(input, false, {}, []));
  assert.equal(html('h1').text(), record.title);
  assert.equal(html('link[rel=canonical]').length, 1);
  assert.equal(html('main img').first().attr('alt'), 'Independent cover ALT');
  assert.equal(html('#case-design img').attr('alt'), 'Independent design ALT');
  assert.equal(shouldSubmitCase(input, { ...input, updatedAt: 'later', featured: !input.featured }), false);
  assert.equal(shouldSubmitCase(input, { ...input, title: '  ' + input.title + '  ' }), false);
  assert.equal(shouldSubmitCase(input, { ...input, internalNote: 'Private operations change' }), false);
  assert.equal(shouldSubmitCase(input, { ...input, slug: input.slug + '-new' }), true);
  assert.equal(shouldSubmitCase(input, { ...input, images: input.images.map(image => ({ ...image, altText: 'Updated public ALT' })) }), true);
  assert.equal(shouldSubmitCase(input, { ...input, title: input.title + ' Updated' }), true);
  assert.equal(shouldSubmitCase(input, { ...input, metaDescription: 'New description.' }), true);
  assert.equal(shouldSubmitCase(input, { ...input, status: 'draft' }), false);
  assert.equal(shouldSubmitCase(null, input), true);
  assert.equal(shouldSubmitCase({ ...input, status: 'draft' }, input), true);
  assert.equal(shouldSubmitCase(input, { ...input, noindex: true }), false);
}
for (const route of ['/services', '/services/implant', '/services/full-arch', '/services/design-only', '/services/surgical-guide', '/workflow', '/exocad-design-outsourcing', '/implant-bar-design']) assert(isAllowedPublicUrl('https://yzhdentallab.com' + route));
for (const route of ['/admin', '/api/admin', '/api/case-image', '/assets/image.jpg']) assert(!isAllowedPublicUrl('https://yzhdentallab.com' + route));
console.log('SEO phase 1: 14 real public metadata fixtures, ALT, text boundaries, branding, contextual links and IndexNow material-change checks passed.');
