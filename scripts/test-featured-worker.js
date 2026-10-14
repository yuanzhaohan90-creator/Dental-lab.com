const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { chromium } = require('playwright');
const { DEFAULT_HOMEPAGE, normalizeHomepage } = require('../lib/admin-store');
const policy = require('../lib/featured-selection');
const fixture = require('./fixtures/featured-production-public.json');

async function main() {
  const wrangler = require(process.env.WRANGLER_API_PATH || 'wrangler');
  const password = crypto.randomBytes(24).toString('hex');
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = 'hmac-sha256$' + salt + '$' + crypto.createHmac('sha256', salt).update(password).digest('hex');
  const output = path.resolve('test-results/featured-canonical');
  const cache = path.join(output, 'source-images');
  fs.mkdirSync(cache, { recursive: true });
  const seven = policy.legacyIds(fixture.cases, {});
  const migrationOnly = process.argv.includes('--migration-only');
  const addedId = 'CASE-MV6D8PS7-24BD6E';
  const requiredImages = new Set([...seven, addedId]);
  const sourceImageWarnings = [];
  // Only read publicly exposed production covers. All writes below target the
  // test harness's isolated, in-memory R2 emulator, never a remote bucket.
  const pending = fixture.cases.filter(item => requiredImages.has(item.id));
  await Promise.all([0, 1, 2].map(async () => {
    while (pending.length) {
      const record = pending.shift(), target = path.join(cache, record.id);
      if (!fs.existsSync(target)) {
        if (process.argv.includes('--metadata-only')) { sourceImageWarnings.push(record.id); continue; }
        try {
          const { stdout } = await promisify(execFile)('curl.exe', ['-4', '--fail', '--silent', '--show-error', '--ssl-no-revoke', '--max-time', '90',
            new URL(record.coverImage.url, fixture.source).href], { maxBuffer: 20 * 1024 * 1024, encoding: 'buffer' });
          fs.writeFileSync(target, stdout);
        } catch { sourceImageWarnings.push(record.id); }
      }
      console.log('Read-only cover cached: ' + record.id);
    }
  }));
  const harness = wrangler.createTestHarness({ root: process.cwd(), workers: [{ config: {
    name: 'yzh-featured-isolated-qa', main: '_worker.js', compatibility_date: '2026-09-03', compatibility_flags: ['nodejs_compat'],
    assets: { directory: './cloudflare-public', binding: 'ASSETS', html_handling: 'none',
      run_worker_first: ['/admin', '/admin/*', '/api/*', '/cases/*', '/assets/admin.js', '/assets/site.js', '/assets/site.css', '/assets/cases.js'] },
    r2_buckets: [{ binding: 'MEDIA_BUCKET', bucket_name: 'yzh-featured-isolated-qa' }],
    vars: { STORAGE_BACKEND: 'r2', R2_BUCKET_NAME: 'yzh-featured-isolated-qa', SITE_URL: 'http://localhost',
      CASE_ADMIN_PASSWORD_HASH: hash, CASE_SESSION_SECRET: crypto.randomBytes(32).toString('hex') }
  } }] });
  const results = [], errors = [], network = [];
  let browser;
  const recordStep = (step, detail = {}) => { results.push({ step, result: 'PASS', ...detail }); console.log('PASS ' + step); };
  try {
    const { url } = await harness.listen();
    const base = url.origin;
    console.log('Isolated Worker URL: ' + base);
    const bucket = (await harness.getWorker().getEnv()).MEDIA_BUCKET;
    for (const source of fixture.cases) {
      const cover = source.coverImage;
      const image = { ...cover, pathname: 'qa/cover/' + source.id, isCover: true, sortOrder: -1,
        contentType: cover?.contentType || 'image/png' };
      const record = { ...source, images: cover ? [image] : [] };
      await bucket.put('case-library/records/' + record.id + '.json', JSON.stringify(record), { httpMetadata: { contentType: 'application/json' } });
      if (requiredImages.has(source.id) && fs.existsSync(path.join(cache, source.id))) await bucket.put(image.pathname, fs.readFileSync(path.join(cache, source.id)), { httpMetadata: { contentType: image.contentType } });
    }
    const initial = { draft: normalizeHomepage({ ...DEFAULT_HOMEPAGE, selectedWork: { caseIds: ['CASE-MUXMID60-04B3BF'] } }),
      published: normalizeHomepage({ ...DEFAULT_HOMEPAGE, selectedWork: { caseIds: [] } }), previous: null };
    if (migrationOnly) initial.draft.hero.heading = 'Unrelated pending hero draft';
    await bucket.put('admin/config/homepage.json', JSON.stringify(initial));
    const login = await harness.fetch('/api/admin-auth', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password }) });
    assert.equal(login.status, 200);
    const auth = await login.json();
    const headers = { authorization: 'Bearer ' + auth.sessionToken, 'content-type': 'application/json' };
    const blocked = await harness.fetch('/api/admin?module=page-editor&page=home&action=publish', { method: 'POST', headers, body: '{}' });
    assert.equal(blocked.status, 409);
    assert.deepEqual((await (await bucket.get('admin/config/homepage.json')).json()).published.selectedWork.caseIds, []);
    recordStep('API refuses stale draft publish without storage mutation');
    if (migrationOnly) {
      const html = await (await harness.fetch('/')).text();
      assert.equal((html.match(/class="priority-case"/g) || []).length, 7);
      recordStep('Migration-only legacy frontend keeps seven before import');
    }
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('response', response => { if (response.status() >= 400) network.push({ status: response.status(), url: response.url() }); });
    await page.goto(base + '/admin/website/home');
    await page.locator('#ownerLoginForm input[name=password]').fill(password);
    await page.locator('#ownerLoginForm button[type=submit]').click();
    await page.locator('[data-featured-import]').waitFor();
    assert.equal(await page.locator('[data-case-slot="0"] option').count(), 15, '14 published options plus empty');
    await page.locator('[data-featured-import]').click();
    const dialog = page.getByRole('dialog');
    await dialog.waitFor();
    assert.match(await dialog.innerText(), /Current public \(legacy\): 7 cases/);
    assert.match(await dialog.innerText(), /Current draft: 1 cases/);
    assert.match(await dialog.innerText(), /After import: 7 cases/);
    await dialog.screenshot({ path: path.join(output, 'migration-1440.png') });
    await page.locator('[data-featured-confirm]').click();
    await page.getByText('已导入并保存草稿，公开首页未改变。', { exact: true }).waitFor();
    const editorIds = () => page.locator('[data-case-slot]').evaluateAll(elements => elements.map(el => el.value).filter(Boolean));
    assert.deepEqual(await editorIds(), seven);
    const refresh = async expected => { await page.reload(); await page.locator('[data-case-slot]').first().waitFor(); assert.deepEqual(await editorIds(), expected); };
    await refresh(seven);
    const noConfirmation = await harness.fetch('/api/admin?module=page-editor&page=home&action=publish', { method: 'POST', headers, body: '{}' });
    assert.equal(noConfirmation.status, 409, 'publish always requires a fresh difference confirmation');
    recordStep('UI import confirmation, real API/R2 write and refresh persistence');
    await page.locator('#selectedWork').screenshot({ path: path.join(output, 'editor-1440.png') });
    await page.locator('[data-case-index="0"] [data-case-remove]').click();
    const six = seven.slice(1);
    assert.deepEqual(await editorIds(), six);
    const save = async () => { await page.locator('#pageEditorForm button[type=submit]').click(); await page.getByText('草稿已保存，正式网站尚未改变。', { exact: true }).waitFor(); };
    await save(); await refresh(six);
    assert.deepEqual((await (await bucket.get('admin/config/homepage.json')).json()).published.selectedWork.caseIds, []);
    recordStep('UI remove/save/refresh leaves published config unchanged');
    await page.locator('[data-case-slot="6"]').selectOption(addedId);
    const sevenNew = [...six, addedId];
    await save(); await refresh(sevenNew);
    recordStep('UI add from 14 published cases/save/refresh');
    await page.setViewportSize({ width: 1440, height: 2400 });
    await page.locator('#selectedWork').scrollIntoViewIfNeeded();
    await page.locator('[data-featured-drag="6"] .featured-drag-handle').dragTo(page.locator('[data-featured-drag="0"] .featured-drag-handle'));
    const sorted = [addedId, ...six];
    assert.deepEqual(await editorIds(), sorted);
    await save(); await refresh(sorted);
    recordStep('Real HTML5 drag order persisted through API/R2 and refresh');
    await page.locator('#publishPage').click();
    await page.getByRole('dialog').waitFor();
    assert.match(await page.getByRole('dialog').innerText(), /Draft Featured to publish: 7 cases/);
    await page.screenshot({ path: path.join(output, 'publish-diff-1440.png'), fullPage: true });
    await page.locator('[data-featured-confirm]').click();
    await page.getByText('发布成功。', { exact: true }).waitFor();
    const stored = await (await bucket.get('admin/config/homepage.json')).json();
    assert.deepEqual(stored.published.selectedWork.caseIds, sorted);
    if (migrationOnly) {
      assert.equal(stored.published.hero.heading, initial.published.hero.heading);
      assert.equal(stored.draft.hero.heading, initial.draft.hero.heading);
      recordStep('Migration publish preserves unrelated published and draft homepage content');
    }
    for (const source of fixture.cases) {
      const record = await (await bucket.get('case-library/records/' + source.id + '.json')).json();
      assert.equal(record.featured, sorted.includes(source.id));
      assert.equal(record.title, source.title);
      assert.equal(record.status, source.status);
    }
    const home = await browser.newPage();
    await home.goto(base + '/');
    const actual = await home.locator('#featured-cases .priority-case-grid a').evaluateAll(elements => elements.map(el => el.querySelector('img').src));
    assert.deepEqual(actual.map(src => new URL(src).searchParams.get('caseId')), sorted);
    await home.close();
    recordStep('Publish exact membership/order, compatible mirrors and public HTML sync');
    for (const width of [390, 430]) {
      await page.setViewportSize({ width, height: 900 });
      await page.locator('[data-case-index="1"] [data-case-move="up"]').click();
      [sorted[0], sorted[1]] = [sorted[1], sorted[0]];
      await save(); await refresh(sorted);
      const lastId = sorted.at(-1);
      await page.locator('[data-case-index="6"] [data-case-remove]').click();
      await save(); await refresh(sorted.slice(0, 6));
      await page.locator('[data-case-slot="6"]').selectOption(lastId);
      await save(); await refresh(sorted);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.locator('#selectedWork').screenshot({ path: path.join(output, 'editor-' + width + '.png') });
      recordStep('Mobile ' + width + ' move/save/refresh without overflow');
    }
    if (!migrationOnly) {
    // Clear through the actual UI; intentional [] must never resurrect mirrors.
    await page.setViewportSize({ width: 1440, height: 1000 });
    while (await page.locator('[data-case-remove]').count()) await page.locator('[data-case-remove]').first().click();
    await save(); await refresh([]);
    await page.locator('#publishPage').click(); await page.getByRole('dialog').waitFor();
    await page.locator('[data-featured-confirm]').click(); await page.getByText('发布成功。', { exact: true }).waitFor();
    const emptyHtml = await (await harness.fetch('/')).text();
    assert(!emptyHtml.includes('class="priority-case"'));
    recordStep('UI explicit [] publish yields zero Featured without fallback');
    const legacy = fixture.cases.find(source => source.id === seven[0]);
    const legacyRecord = await (await bucket.get('case-library/records/' + legacy.id + '.json')).json();
    await bucket.put('case-library/records/' + legacy.id + '.json', JSON.stringify({ ...legacyRecord, featured: true }));
    assert(!(await (await harness.fetch('/')).text()).includes('class="priority-case"'), 'stale mirror must not resurrect an explicit []');
    const emptyConfig = await (await bucket.get('admin/config/homepage.json')).json();
    for (const missing of [null, undefined]) {
      const legacyConfig = structuredClone(emptyConfig);
      if (missing === undefined) delete legacyConfig.published.selectedWork.caseIds;
      else legacyConfig.published.selectedWork.caseIds = null;
      await bucket.put('admin/config/homepage.json', JSON.stringify(legacyConfig));
      assert((await (await harness.fetch('/')).text()).includes('class="priority-case"'), 'only missing/null enables legacy read fallback');
    }
    recordStep('Real Worker [] ignores stale mirror; missing/null permit legacy fallback');
    const subset = [sorted[2], sorted[0]];
    const subsetConfig = structuredClone(emptyConfig);
    subsetConfig.published.selectedWork.caseIds = subset;
    await bucket.put('admin/config/homepage.json', JSON.stringify(subsetConfig));
    for (const source of fixture.cases) {
      const key = 'case-library/records/' + source.id + '.json';
      const record = await (await bucket.get(key)).json();
      await bucket.put(key, JSON.stringify({ ...record, featured: true }));
    }
    await page.goto(base + '/');
    const subsetCards = await page.locator('#featured-cases .priority-case-grid > a img').evaluateAll(elements =>
      elements.map(el => new URL(el.src).searchParams.get('caseId')));
    assert.deepEqual(subsetCards, subset, 'real public frontend must exclude extra mirrors and preserve explicit order');
    recordStep('Real Worker explicit subset/order ignores every additional featured mirror');
    }
    const expectedMissingImages = network.filter(entry => entry.status === 404 && entry.url.includes('/api/case-image?') && sourceImageWarnings.includes(new URL(entry.url).searchParams.get('caseId')));
    const unexpected = network.filter(entry => !expectedMissingImages.includes(entry));
    assert.deepEqual(unexpected, []);
    const runtimeLogs = errors.filter(message => !message.startsWith('Failed to load resource:'));
    assert.deepEqual(runtimeLogs, []);
    recordStep('Browser runtime errors and unexpected API failures: 0');
    if (sourceImageWarnings.length) results.push({ step: 'Production cover copy/full image regression', result: 'NOT TESTED', caseIds: sourceImageWarnings, expectedMissingImages });
    const objects = await bucket.list();
    for (const item of objects.objects) await bucket.delete(item.key);
    assert.equal((await bucket.list()).objects.length, 0);
    recordStep('Isolated QA storage cleaned; production mutations 0');
  } catch (error) {
    results.push({ result: 'FAIL', error: error.message });
    throw error;
  } finally {
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({ results, errors, network, sourceImageWarnings }, null, 2));
    await browser?.close();
    await harness.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
