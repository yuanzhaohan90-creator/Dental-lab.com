const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const base = 'https://yzhdentallab.com';
const expected = ['CASE-MV6O4JIY-BE0183', 'CASE-MV6GPYMW-380048', 'CASE-MV6871W1-5EC0B5',
  'CASE-MUZGEHFM-B7F15D', 'CASE-MUXMID60-04B3BF', 'CASE-MUDZ5E3H-37CB87', 'CASE-MU3QD0N3-1CB1AE'];
const output = path.resolve('test-results/featured-production-stage1');
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
function otherContent(page) {
  const copy = structuredClone(page);
  delete copy.selectedWork.caseIds;
  delete copy.selectedWork.migrationApproval;
  return hash(copy);
}

async function main() {
  assert(process.env.YZH_ADMIN_PASSWORD, 'An existing admin credential must be supplied in process memory.');
  fs.mkdirSync(output, { recursive: true });
  const report = { phase: 1, productionWorkerOnly: true, stage2Executed: false, steps: [], runtimeErrors: [], serverErrors: [] };
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  let auditPage;
  const record = (step, data = {}) => { report.steps.push({ step, ...data }); console.log(JSON.stringify({ step, ...data })); };
  const read = async route => {
    if (auditPage) return auditPage.evaluate(async route => {
      const response = await fetch(route, { cache: 'no-store', signal: AbortSignal.timeout(45000) });
      if (response.status !== 200) throw new Error('Read HTTP ' + response.status + ': ' + route);
      return response.json();
    }, route);
    const response = await context.request.get(base + route, { timeout: 45000 });
    assert.equal(response.status(), 200, 'Read failed: ' + route);
    return response.json();
  };
  const readCases = async () => {
    const snapshot = path.join(output, 'before.json');
    if (!fs.existsSync(snapshot)) return read('/api/admin-cases');
    const ids = Object.keys(JSON.parse(fs.readFileSync(snapshot, 'utf8')).caseHashes);
    const cases = [];
    for (let index = 0; index < ids.length; index += 2) {
      const batch = await Promise.all(ids.slice(index, index + 2).map(id => read('/api/admin-cases?id=' + encodeURIComponent(id))));
      cases.push(...batch.map(item => item.case));
    }
    return { cases };
  };
  try {
    const login = await context.request.post(base + '/api/admin-auth', {
      data: { password: process.env.YZH_ADMIN_PASSWORD }, headers: { origin: base }, timeout: 45000
    });
    delete process.env.YZH_ADMIN_PASSWORD;
    assert.equal(login.status(), 200, 'Existing production admin login failed');
    record('Admin login', { status: login.status() });
    auditPage = await context.newPage();
    await auditPage.goto(base + '/robots.txt?migrationAudit=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 45000 });
    const before = await read('/api/admin?module=page-editor&page=home');
    const original = await readCases();
    assert.equal(before.publishedCases.length, 14);
    assert.equal(original.cases.filter(item => item.status === 'published').length, 14);
    assert.deepEqual(before.config.published.selectedWork.caseIds, []);
    assert.deepEqual(before.config.draft.selectedWork.caseIds, ['CASE-MUXMID60-04B3BF']);
    assert.deepEqual(before.frontendFeaturedCases.map(item => item.id), expected);
    assert.deepEqual(original.cases.filter(item => item.status === 'published' && item.featured).map(item => item.id).sort(), [...expected].sort());
    assert.deepEqual(original.cases.filter(item => item.featured).map(item => item.id).sort(), [...expected].sort(), 'No additional compatibility flags may be changed');
    const caseHashes = Object.fromEntries(original.cases.map(item => [item.id, hash(item)]));
    report.before = { publishedIds: before.config.published.selectedWork.caseIds, draftIds: before.config.draft.selectedWork.caseIds,
      publicIds: before.frontendFeaturedCases.map(item => item.id), publishedCount: 14, caseHashes,
      draftOtherContentHash: otherContent(before.config.draft), publishedOtherContentHash: otherContent(before.config.published) };
    fs.writeFileSync(path.join(output, 'before.json'), JSON.stringify(report.before, null, 2));
    record('Before snapshot', { published: [], draft: before.config.draft.selectedWork.caseIds, public: expected });
    if (!process.argv.includes('--execute')) return;
    assert.equal(before.featured?.frontendMode, 'legacy-migration-only', 'Canonical frontend must not be deployed in phase 1');
    assert.equal(before.featured.publishBlocked, true);
    const page = await context.newPage();
    page.on('pageerror', error => report.runtimeErrors.push(error.message));
    page.on('response', response => { if (response.status() >= 500) report.serverErrors.push({ url: response.url(), status: response.status() }); });
    await page.goto(base + '/admin/website/home?stage1=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.locator('[data-featured-import]').waitFor({ timeout: 45000 });
    assert.equal(await page.locator('[data-case-slot="0"]').inputValue(), 'CASE-MUXMID60-04B3BF');
    await page.locator('[data-featured-import]').click();
    const dialog = page.getByRole('dialog');
    await dialog.waitFor();
    const text = await dialog.innerText();
    assert.match(text, /Current public \(legacy\): 7 cases/);
    assert.match(text, /Current draft: 1 cases/);
    assert.match(text, /After import: 7 cases/);
    for (const id of expected) assert(text.includes(id));
    await dialog.screenshot({ path: path.join(output, 'import-confirm.png') });
    assert.deepEqual(report.runtimeErrors, []); assert.deepEqual(report.serverErrors, []);
    await page.locator('[data-featured-confirm]').click();
    await page.getByText('已导入并保存草稿，公开首页未改变。', { exact: true }).waitFor({ timeout: 45000 });
    const imported = await read('/api/admin?module=page-editor&page=home');
    assert.deepEqual(imported.config.draft.selectedWork.caseIds, expected);
    assert.deepEqual(imported.config.published.selectedWork.caseIds, []);
    assert.equal(otherContent(imported.config.draft), report.before.draftOtherContentHash);
    assert.equal(otherContent(imported.config.published), report.before.publishedOtherContentHash);
    record('Confirmed import', { draft: expected, published: [], publicUnchanged: true });
    await page.locator('#pageEditorForm button[type=submit]').click();
    await page.getByText('草稿已保存，正式网站尚未改变。', { exact: true }).waitFor({ timeout: 45000 });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('[data-case-slot]').first().waitFor({ timeout: 45000 });
    assert.deepEqual(await page.locator('[data-case-slot]').evaluateAll(nodes => nodes.map(node => node.value).filter(Boolean)), expected);
    const saved = await read('/api/admin?module=page-editor&page=home');
    assert.equal(otherContent(saved.config.draft), report.before.draftOtherContentHash);
    record('Draft saved and refreshed', { draft: expected });
    const plan = (await read('/api/admin?module=page-editor&page=home&action=featured-preflight')).featured;
    assert.deepEqual(plan.publicVisibleIds, expected);
    assert.deepEqual(plan.targetIds, expected);
    assert.deepEqual(plan.added, []); assert.deepEqual(plan.removed, []); assert.equal(plan.reordered, false);
    await page.locator('#publishPage').click();
    await page.getByRole('dialog').waitFor({ timeout: 45000 });
    const publishText = await page.getByRole('dialog').innerText();
    assert.match(publishText, /Current Public Featured: 7 cases/);
    assert.match(publishText, /Draft Featured to publish: 7 cases/);
    for (const id of expected) assert(publishText.includes(id));
    await page.getByRole('dialog').screenshot({ path: path.join(output, 'publish-confirm.png') });
    assert.deepEqual(report.runtimeErrors, []); assert.deepEqual(report.serverErrors, []);
    await page.locator('[data-featured-confirm]').click();
    await page.getByText('发布成功。', { exact: true }).waitFor({ timeout: 45000 });
    record('Confirmed migration publish', { added: [], removed: [], reordered: false });
    const after = await read('/api/admin?module=page-editor&page=home');
    const cases = await readCases();
    assert.deepEqual(after.config.published.selectedWork.caseIds, expected);
    assert.deepEqual(after.config.draft.selectedWork.caseIds, expected);
    assert.deepEqual(after.frontendFeaturedCases.map(item => item.id), expected);
    assert.equal(otherContent(after.config.draft), report.before.draftOtherContentHash);
    assert.equal(otherContent(after.config.published), report.before.publishedOtherContentHash);
    assert.deepEqual(cases.cases.filter(item => item.status === 'published' && item.featured).map(item => item.id).sort(), [...expected].sort());
    assert.deepEqual(Object.fromEntries(cases.cases.map(item => [item.id, hash(item)])), caseHashes, 'Case data must be unchanged');
    report.after = { publishedIds: after.config.published.selectedWork.caseIds, draftIds: after.config.draft.selectedWork.caseIds,
      publicIds: after.frontendFeaturedCases.map(item => item.id), mirrorIds: cases.cases.filter(item => item.status === 'published' && item.featured).map(item => item.id),
      caseDataUnchanged: true, otherHomepageContentUnchanged: true };
    record('After configuration and case checks', report.after);
    const home = await context.newPage();
    home.on('pageerror', error => report.runtimeErrors.push(error.message));
    home.on('response', response => { if (response.status() >= 500) report.serverErrors.push({ url: response.url(), status: response.status() }); });
    const response = await home.goto(base + '/?stage1=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 45000 });
    assert.equal(response.status(), 200);
    const grid = home.locator('#featured-cases .priority-case-grid');
    await grid.scrollIntoViewIfNeeded();
    const publicIds = await grid.locator('a img').evaluateAll(images => images.map(image => new URL(image.src).searchParams.get('caseId')));
    assert.deepEqual(publicIds, expected);
    for (const image of await grid.locator('img').all()) await image.scrollIntoViewIfNeeded();
    await home.waitForFunction(() => [...document.querySelectorAll('#featured-cases .priority-case-grid img')].length === 7 &&
      [...document.querySelectorAll('#featured-cases .priority-case-grid img')].every(image => image.complete && image.naturalWidth > 0), undefined, { timeout: 120000 });
    report.coverResults = await grid.locator('img').evaluateAll(images => images.map(image => ({ src: image.src, loaded: image.complete && image.naturalWidth > 0 })));
    assert.deepEqual(report.runtimeErrors, []); assert.deepEqual(report.serverErrors, []);
    await grid.screenshot({ path: path.join(output, 'public-seven.png') });
    record('Public seven/order/covers', { ids: publicIds, coversLoaded: 7 });
    report.phase1Complete = true;
  } catch (error) { report.failure = error.message.split('\n')[0]; throw error; }
  finally {
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
    await browser.close();
  }
}
main().catch(error => { console.error(error.message.split('\n')[0]); process.exitCode = 1; });
