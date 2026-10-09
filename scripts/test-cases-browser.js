const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const assert = require("node:assert/strict");
const { spawn, execFileSync } = require("node:child_process");
const { chromium } = require("playwright");
const root = path.resolve(__dirname, "..");
const work = path.join(root, ".wrangler", "cases-portfolio-qa");
const output = path.join(root, "test-results", "cases-filters");
const remote = process.env.QA_CASES_BASE_URL;
const cli = process.env.WRANGLER_CLI;
const config = ["--config", "wrangler.production.toml", "--local", "--persist-to", work];
const env = { ...process.env, GOMAXPROCS: "2", GOMEMLIMIT: "64MiB" };
delete env.CLOUDFLARE_API_TOKEN;
delete env.CLOUDFLARE_API_KEY;
const report = { scenarios: [], errors: [], productionMutations: 0 };
let dev, browser;
async function read(url) {
  for (let i = 0; ; i++) {
    try { const response = await fetch(url, { signal: AbortSignal.timeout(40000) }); assert.equal(response.status, 200, String(url)); return response; }
    catch (error) { if (i === 3) throw error; await new Promise(resolve => setTimeout(resolve, 1000)); }
  }
}
async function recordsAt(base) {
  const list = await (await read(base + "/api/cases")).json();
  const records = [];
  for (const record of list.cases) records.push((await (await read(base + "/api/cases?slug=" + encodeURIComponent(record.slug))).json()).case);
  return records;
}
const hash = value => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
function wrangler(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--no-opt", "--no-maglev", "--max-old-space-size=256", cli, ...args, ...config], { cwd: root, env, stdio: "ignore", windowsHide: true });
    child.on("error", reject);
    child.on("exit", code => code === 0 ? resolve() : reject(new Error("Local Wrangler failed: " + code)));
  });
}
async function store(record) {
  const filename = path.join(work, record.id + ".json");
  fs.writeFileSync(filename, JSON.stringify(record));
  await wrangler(["r2", "object", "put", "yzh-dental-lab-media/case-library/records/" + record.id + ".json", "--file", filename, "--content-type", "application/json"]);
}
async function suite(base, records, scenario) {
  const page = await browser.newPage();
  page.on("pageerror", error => report.errors.push({ scenario, url: page.url(), error: error.message }));
  page.on("console", message => { if (message.type() === "error") report.errors.push({ scenario, url: page.url(), error: message.text() }); });
  const categories = [...new Set(records.map(record => record.category))];
  async function verify(category) {
    const expected = records.filter(record => !category || record.category === category);
    const cards = await page.locator('.case-portfolio-card:visible > a').evaluateAll(links => links.map(link => ({ href: link.getAttribute("href"), title: link.querySelector("h3").textContent.trim() })));
    assert.equal(cards.length, expected.length, scenario + " " + category);
    assert.equal(new Set(cards.map(card => card.href)).size, cards.length, "Duplicate cards");
    assert.deepEqual(cards.map(card => card.href).sort(), expected.map(record => "/cases/" + record.slug).sort());
    for (const card of cards) assert.equal(card.title, expected.find(record => "/cases/" + record.slug === card.href).title);
    const featuredCount = expected.filter(record => record.featured || record.contentType === "case_study").length;
    assert.equal(await page.locator('#featuredCaseList .case-portfolio-card:visible').count(), featuredCount);
    assert.equal(await page.locator('#recentWorkList .case-portfolio-card:visible').count(), expected.length - featuredCount);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    if (expected.length) {
      const button = page.locator('#caseFilters button[data-category="' + category + '"]');
      assert.equal(await button.getAttribute("aria-pressed"), "true");
    } else assert.match(await page.locator('#recentWorkList').innerText(), /No published work in this category yet/);
    return cards;
  }
  for (const width of [390, 430, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const response = await page.goto(base + "/cases?qa=" + Date.now(), { waitUntil: "networkidle" });
    assert.equal(response.status(), 200);
    const actualButtons = await page.locator('#caseFilters button').evaluateAll(buttons => buttons.map(button => button.dataset.category));
    assert.deepEqual(actualButtons, ["", ...categories]);
    const checks = [];
    await verify("");
    for (const category of ["", ...categories]) {
      await page.locator('#caseFilters button[data-category="' + category + '"]').click();
      assert.equal(new URL(page.url()).searchParams.get("category") || "", category);
      const cards = await verify(category);
      await page.reload({ waitUntil: "networkidle" });
      await verify(category);
      for (const card of cards) {
        await page.locator('.case-portfolio-card:visible > a[href="' + card.href + '"]').click();
        await page.waitForURL(url => url.pathname === card.href);
        assert.equal(await page.locator('h1').innerText(), card.title);
        await page.goBack({ waitUntil: "networkidle" });
        await verify(category);
      }
      checks.push({ category: category || "All", count: cards.length, titles: cards.map(card => card.title), links: cards.map(card => card.href), reload: "PASS", cardClickBack: "PASS" });
    }
    await page.locator('#caseFilters button[data-category=""]').click();
    await verify("");
    await page.locator('#caseFilters button[data-category="' + categories[0] + '"]').click();
    await verify(categories[0]);
    await page.goBack({ waitUntil: "networkidle" });await verify("");
    await page.goForward({ waitUntil: "networkidle" });await verify(categories[0]);
    await page.goto(base + "/cases?category=QA-EMPTY-CATEGORY", { waitUntil: "networkidle" });
    await verify("QA-EMPTY-CATEGORY");
    await page.locator('#caseFilters button[data-category=""]').click();await verify("");
    for (const image of await page.locator('.case-portfolio-card:visible img').all()) {
      await image.scrollIntoViewIfNeeded();
      await image.evaluate(element => element.complete ? undefined : new Promise(resolve => { element.onload = resolve; element.onerror = resolve; }));
      assert(await image.evaluate(element => element.naturalWidth > 0), "Broken cover");
    }
    await page.screenshot({ path: path.join(output, scenario + "-" + width + ".png"), fullPage: true });
    report.scenarios.push({ scenario, width, checks, history: "PASS", emptyResults: "PASS", covers: "PASS", overflow: 0 });
    console.log("PASS browser filters", scenario, width, checks.map(check => check.category + ":" + check.count).join(", "));
  }
  await page.close();
  assert.equal(report.errors.length, 0, JSON.stringify(report.errors));
}
async function main() {
  fs.mkdirSync(work, { recursive: true });fs.mkdirSync(output, { recursive: true });
  const productionRecords = await recordsAt("https://yzhdentallab.com");
  const before = hash(productionRecords);
  browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--disable-gpu", "--renderer-process-limit=2"] });
  if (remote) {
    await suite(remote, await recordsAt(remote), "remote-preview");
  } else {
    assert(cli && fs.existsSync(cli), "Set WRANGLER_CLI to the installed Wrangler CLI");
    assert.equal(productionRecords.length, 4);
    const localRecords = [];
    for (const original of productionRecords) {
      const record = structuredClone(original);
      for (const image of record.images) {
        const cached = path.join(root, ".wrangler", "publication-qa", image.id + ".bin");
        const bytes = fs.existsSync(cached) ? fs.readFileSync(cached) : Buffer.from(await (await read(new URL(image.url, "https://yzhdentallab.com"))).arrayBuffer());
        const filename = path.join(work, image.id + ".bin");fs.writeFileSync(filename, bytes);
        image.pathname = "case-library/images/" + record.id + "/" + image.id + ".jpg";
        await wrangler(["r2", "object", "put", "yzh-dental-lab-media/" + image.pathname, "--file", filename, "--content-type", image.contentType || "image/jpeg"]);
      }
      await store(record);localRecords.push(record);
    }
    const base = "http://127.0.0.1:8794";
    dev = spawn(process.execPath, ["--no-opt", "--no-maglev", "--max-old-space-size=256", cli, "dev", ...config, "--port", "8794", "--ip", "127.0.0.1", "--var", "SITE_URL:" + base], { cwd: root, env, stdio: "ignore", windowsHide: true });
    let ready = false;
    for (let i = 0; i < 60; i++) { try { if ((await fetch(base + "/cases")).status === 200) { ready = true;break; } } catch {} await new Promise(resolve => setTimeout(resolve, 1000)); }
    assert(ready, "Isolated Worker unavailable");
    await suite(base, localRecords, "production-records");
    const mixed = localRecords.map((record, index) => index === 0 ? { ...record, featured: false, contentType: "quick_work" } : record);
    await store(mixed[0]);await suite(base, mixed, "isolated-mixed");
    const recent = mixed.map(record => ({ ...record, featured: false, contentType: "quick_work" }));
    for (const record of recent) await store(record);
    await suite(base, recent, "isolated-no-featured");
    for (const record of localRecords) await store(record);
  }
  assert.equal(hash(await recordsAt("https://yzhdentallab.com")), before, "Production public data changed");
  report.result = "PASS";
}
main().catch(error => { report.result = "FAIL";report.error = error.message;console.error(error.message);process.exitCode = 1; }).finally(async () => {
  if (browser) await browser.close();
  if (dev?.pid) { try { execFileSync("taskkill", ["/PID", String(dev.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true }); } catch {} }
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(path.join(output, remote ? "remote-report.json" : "local-report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ result: report.result, viewportScenarios: report.scenarios.length, consoleErrors: report.errors, productionMutations: 0, error: report.error }));
});
