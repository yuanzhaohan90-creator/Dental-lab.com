const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const base = 'https://yzhdentallab.com';
const expected = ['CASE-MV6O4JIY-BE0183', 'CASE-MV6GPYMW-380048', 'CASE-MV6871W1-5EC0B5',
  'CASE-MUZGEHFM-B7F15D', 'CASE-MUXMID60-04B3BF', 'CASE-MUDZ5E3H-37CB87', 'CASE-MU3QD0N3-1CB1AE'];
const output = path.resolve('test-results/featured-production-stage2');
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');

async function main() {
  assert(process.env.YZH_ADMIN_PASSWORD, 'Existing admin credential required in process memory');
  fs.mkdirSync(output, { recursive: true });
  const baseline = process.argv.includes('--baseline');
  const report = { baseline, steps: [], runtimeErrors: [], serverErrors: [], failedRequests: [], blockedWrites: [] };
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.route('**/api/**', route => {
    const request = route.request();
    if (!['GET', 'HEAD'].includes(request.method()) && !new URL(request.url()).pathname.endsWith('/admin-auth')) {
      report.blockedWrites.push({ url: request.url(), method: request.method() });
      return route.abort();
    }
    return route.continue();
  });
  const record = (step, detail = {}) => {
    report.steps.push({ step, ...detail });
    console.log(JSON.stringify({ step, ...detail }));
  };
  try {
    const page = await context.newPage();
    page.on('pageerror', error => report.runtimeErrors.push(error.message.split('\n')[0]));
    page.on('response', response => {
      if (response.status() >= 500) report.serverErrors.push({ url: response.url(), status: response.status() });
    });
    page.on('requestfailed', request => report.failedRequests.push({ url: request.url(), error: request.failure()?.errorText }));
    await page.goto(base + '/admin/website/home?stage2=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.locator('#ownerLoginForm input[name=password]').fill(process.env.YZH_ADMIN_PASSWORD);
    delete process.env.YZH_ADMIN_PASSWORD;
    const loginResponse = page.waitForResponse(response => response.url().includes('/api/admin-auth') && response.request().method() === 'POST');
    await page.locator('#ownerLoginForm button[type=submit]').click();
    assert.equal((await loginResponse).status(), 200);
    await page.locator('[data-case-slot]').first().waitFor({ timeout: 60000 });
    const read = route => page.evaluate(async route => {
      const response = await fetch(route, { cache: 'no-store', signal: AbortSignal.timeout(60000) });
      if (response.status !== 200) throw new Error('Read HTTP ' + response.status + ': ' + route);
      return response.json();
    }, route);
    const data = await read('/api/admin?module=page-editor&page=home');
    assert.deepEqual(data.config.published.selectedWork.caseIds, expected);
    assert.deepEqual(data.config.draft.selectedWork.caseIds, expected);
    assert.deepEqual(data.frontendFeaturedCases.map(item => item.id), expected);
    assert.equal(data.featured.frontendMode, baseline ? 'legacy-migration-only' : 'canonical');
    assert.equal(data.publishedCases.length, 14);
    const caseIds = Object.keys(JSON.parse(fs.readFileSync('test-results/featured-production-stage1/before.json', 'utf8')).caseHashes);
    const caseHashes = {};
    const mirrorIds = [];
    for (const id of caseIds) {
      const result = await read('/api/admin-cases?id=' + encodeURIComponent(id));
      caseHashes[id] = hash(result.case);
      if (result.case.featured) mirrorIds.push(id);
    }
    assert.deepEqual(mirrorIds.sort(), [...expected].sort());
    const snapshot = { configHash: hash(data.config), caseHashes, publishedIds: expected, draftIds: expected };
    if (baseline) fs.writeFileSync(path.join(output, 'before.json'), JSON.stringify(snapshot, null, 2));
    else assert.deepEqual(snapshot, JSON.parse(fs.readFileSync(path.join(output, 'before.json'), 'utf8')), 'Production configuration and cases must remain unchanged');
    report.snapshot = snapshot;
    assert.deepEqual(await page.locator('[data-case-slot]').evaluateAll(elements => elements.map(el => el.value).filter(Boolean)), expected);
    assert.equal(await page.locator('[data-case-slot="0"] option').count(), 15);
    await page.locator('#selectedWork').screenshot({ path: path.join(output, baseline ? 'admin-before.png' : 'admin-after.png') });
    record('Admin readonly editor and storage', { count: 7, publishedCount: 14, frontendMode: data.featured.frontendMode, casesUnchanged: true });
    if (!baseline) {
      const homeResponse = await page.goto(base + '/?stage2=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 60000 });
      assert.equal(homeResponse.status(), 200);
      const cards = page.locator('#featured-cases .priority-case-grid > a');
      await cards.first().waitFor();
      const actual = await cards.evaluateAll(elements => elements.map(el => ({
        id: new URL(el.querySelector('img').src).searchParams.get('caseId'), href: el.getAttribute('href')
      })));
      assert.deepEqual(actual.map(item => item.id), expected);
      for (const item of actual) {
        const source = data.publishedCases.find(record => record.id === item.id);
        assert.equal(item.href, '/cases/' + encodeURIComponent(source.slug));
      }
      for (let index = 0; index < 7; index++) await cards.nth(index).locator('img').scrollIntoViewIfNeeded();
      await page.waitForFunction(() => [...document.querySelectorAll('#featured-cases .priority-case-grid > a img')].every(img => img.complete && img.naturalWidth > 0), undefined, { timeout: 120000 });
      record('Public exact membership/order and covers', { cards: actual, coversLoaded: 7 });
      for (const width of [390, 430, 768, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        const layout = await page.evaluate(() => ({
          overflow: document.documentElement.scrollWidth > innerWidth,
          columns: getComputedStyle(document.querySelector('#featured-cases .priority-case-grid')).gridTemplateColumns.split(' ').length,
          count: document.querySelectorAll('#featured-cases .priority-case-grid > a').length
        }));
        assert.equal(layout.overflow, false);
        assert.equal(layout.count, 7);
        assert.equal(layout.columns, width < 761 ? 1 : width <= 1060 ? 2 : 3);
        await page.locator('#featured-cases').screenshot({ path: path.join(output, 'public-' + width + '.png') });
        record('Layout ' + width, layout);
      }
      for (const item of actual) {
        const result = await page.evaluate(async href => {
          const response = await fetch(href, { cache: 'no-store', signal: AbortSignal.timeout(60000) });
          return { status: response.status, html: (await response.text()).includes('<h1') };
        }, item.href);
        assert.equal(result.status, 200); assert(result.html);
        record('Featured detail link', { url: item.href, status: 200 });
      }
      for (const route of ['/cases', '/submit-case']) {
        const response = await page.goto(base + route + '?stage2=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 60000 });
        assert.equal(response.status(), 200);
        assert(await page.locator('h1').first().isVisible());
        record('Readonly smoke', { route, status: 200 });
      }
      await page.goto(base + '/admin/website/home?stage2Final=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.locator('[data-case-slot]').first().waitFor({ timeout: 60000 });
      const final = await read('/api/admin?module=page-editor&page=home');
      assert.equal(hash(final.config), snapshot.configHash);
      assert.deepEqual(await page.locator('[data-case-slot]').evaluateAll(elements => elements.map(el => el.value).filter(Boolean)), expected);
    }
    assert.deepEqual(report.runtimeErrors, []);
    assert.deepEqual(report.serverErrors, []);
    assert.deepEqual(report.blockedWrites, []);
    report.result = 'PASS';
    record('Read-only audit complete', { runtimeErrors: 0, http5xx: 0, dataWrites: 0 });
  } catch (error) {
    report.result = 'FAIL'; report.error = error.message.split('\n')[0];
    throw new Error(report.error);
  } finally {
    fs.writeFileSync(path.join(output, baseline ? 'baseline-report.json' : 'report.json'), JSON.stringify(report, null, 2));
    await browser.close();
  }
}
main().catch(error => { console.error(error.message.split('\n')[0]); process.exitCode = 1; });
