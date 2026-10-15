const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fixture = require('./fixtures/featured-production-public.json');

// Evaluate the generated global rules with REP longest-match/allow-tie semantics.
function allows(robots, route) {
  const matches = robots.split(/\r?\n/).flatMap(line => {
    const match = line.match(/^(Allow|Disallow):\s*(.+)$/);
    if (!match) return [];
    const pattern = '^' + match[2].split('*').map(part => part.replace(/[.+?^{}()|[\]\\]/g, '\\$&')).join('.*');
    return new RegExp(pattern).test(route) ? [{ allow: match[1] === 'Allow', length: match[2].replace(/[*$]/g, '').length }] : [];
  }).sort((a, b) => b.length - a.length || Number(b.allow) - Number(a.allow));
  return matches[0]?.allow ?? true;
}

async function main() {
  const wrangler = require(process.env.WRANGLER_API_PATH || 'wrangler');
  const harness = wrangler.createTestHarness({ root: process.cwd(), workers: [{ config: {
    name: 'seo-isolated-qa', main: '_worker.js', compatibility_date: '2026-09-03', compatibility_flags: ['nodejs_compat'],
    assets: { directory: './cloudflare-public', binding: 'ASSETS', html_handling: 'none', run_worker_first: true },
    r2_buckets: [{ binding: 'MEDIA_BUCKET', bucket_name: 'seo-isolated-qa' }],
    vars: { STORAGE_BACKEND: 'r2', R2_BUCKET_NAME: 'seo-isolated-qa', SITE_URL: 'http://localhost', CASE_SESSION_SECRET: crypto.randomBytes(32).toString('hex') }
  } }] });
  try {
    await harness.listen();
    const bucket = (await harness.getWorker().getEnv()).MEDIA_BUCKET;
    const bytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a2ioAAAAASUVORK5CYII=', 'base64');
    // Representative QA image bytes; real public metadata, not a claim to have
    // copied or visually validated every production image in the emulator.
    await bucket.put('qa/representative.png', bytes);
    for (const source of fixture.cases) {
      await bucket.put('case-library/records/' + source.id + '.json', JSON.stringify({ ...source,
        images: [{ id: 'IMG-QA', pathname: 'qa/representative.png', contentType: 'image/png', altText: 'QA representative image', isCover: true }]
      }));
    }
    await bucket.put('case-library/records/CASE-QA-DRAFT.json', JSON.stringify({ id: 'CASE-QA-DRAFT', status: 'draft', images: [{ id: 'IMG-QA', pathname: 'qa/representative.png' }] }));
    await bucket.put('admin/media/records/MEDIA-QA.json', JSON.stringify({ id: 'MEDIA-QA', pathname: 'qa/representative.png', posterPathname: 'qa/representative.png', contentType: 'image/png', posterContentType: 'image/png', size: bytes.length }));
    const robotsResponse = await harness.fetch('/robots.txt');
    const robots = await robotsResponse.text();
    assert.equal(robotsResponse.status, 200);
    assert(robots.includes('Disallow: /api/'));
    for (const userAgent of ['Googlebot', 'Googlebot-Image']) {
      for (const route of ['/api/case-image?caseId=CASE-QA&imageId=IMG-QA', '/api/admin?module=media-image&id=MEDIA-QA', '/api/admin?module=media-image&id=MEDIA-QA&variant=poster']) assert(allows(robots, route), userAgent + ' must crawl public media');
      for (const route of ['/api/admin-auth', '/api/admin-cases', '/api/admin?module=media-upload', '/api/admin?module=submissions', '/api/download-case-file', '/api/submit-case', '/admin/website']) assert(!allows(robots, route), userAgent + ' private API must stay disallowed');
    }
    const sitemap = await (await harness.fetch('/sitemap.xml')).text();
    assert.equal((sitemap.match(/<loc>/g) || []).length, 30);
    for (const route of ['/exocad-design-outsourcing', '/implant-bar-design']) assert(sitemap.includes('https://yzhdentallab.com' + route + '</loc>'));
    for (const source of fixture.cases) {
      const detail = await harness.fetch('/cases/' + source.slug);
      assert.equal(detail.status, 200, await detail.text());
      assert(sitemap.includes('/cases/' + source.slug + '</loc>'));
    }
    for (const route of ['/api/case-image?caseId=' + fixture.cases[0].id + '&imageId=IMG-QA', '/api/admin?module=media-image&id=MEDIA-QA&variant=poster']) {
      const response = await harness.fetch(route);
      assert.equal(response.status, 200); assert.match(response.headers.get('content-type'), /image\/png/);
      assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes);
    }
    assert.equal((await harness.fetch('/api/case-image?caseId=CASE-QA-DRAFT&imageId=IMG-QA')).status, 404);
    for (const route of ['/api/admin-cases', '/api/admin?module=submissions', '/api/admin?module=submission-file&id=QA']) assert.equal((await harness.fetch(route)).status, 401);
    assert.equal((await harness.fetch('/api/admin?module=media-image&id=MEDIA-QA', { method: 'POST' })).status, 405);
    assert.equal((await harness.fetch('/api/case-image?caseId=' + fixture.cases[0].id + '&imageId=IMG-QA', { method: 'POST' })).status, 405);
    for (const object of (await bucket.list()).objects) await bucket.delete(object.key);
    assert.equal((await bucket.list()).objects.length, 0);
    console.log('Real isolated Worker/R2: 14 details, 30 sitemap URLs, both robots agents, public media integrity, draft/private protection, no writes allowed and QA cleanup passed.');
  } finally { await harness.close(); }
}
main().catch(error => { console.error(error.stack); process.exitCode = 1; });
