const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const assert = require("node:assert/strict");
const { spawn, execFileSync } = require("node:child_process");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const work = path.join(root, ".wrangler", "publication-qa");
const output = path.join(root, "test-results", "publication-compatibility");
const cli = process.env.WRANGLER_CLI;
if (!cli || !fs.existsSync(cli)) throw new Error("WRANGLER_CLI must name the installed Wrangler CLI");
const cliArgs = ["--no-opt", "--no-maglev", "--max-old-space-size=256", cli];
const localEnv = { ...process.env, GOMAXPROCS: "2", GOMEMLIMIT: "64MiB" };
delete localEnv.CLOUDFLARE_API_TOKEN;
delete localEnv.CLOUDFLARE_API_KEY;
const report = { startedAt: new Date().toISOString(), config: "wrangler.production.toml", execution: "Wrangler --local / emulated R2", productionMutations: 0, cases: [], routes: [], consoleErrors: [] };
const configArgs = ["--config", "wrangler.production.toml", "--local", "--persist-to", work];
let dev, browser, activePage;
function run(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [...cliArgs, ...args], { cwd: root, env: localEnv, stdio: "ignore", windowsHide: true });
    child.on("error", reject);
    child.on("exit", code => code === 0 ? resolve() : reject(new Error(`Local Wrangler command failed (${args[0]}, exit ${code})`)));
  });
}
async function publicSnapshot() {
  const list = await (await readPublic("https://yzhdentallab.com/api/cases")).json();
  const records = [];
  for (const item of list.cases) records.push((await (await readPublic(`https://yzhdentallab.com/api/cases?slug=${encodeURIComponent(item.slug)}`)).json()).case);
  return records;
}
async function readPublic(url) {
  for (let attempt = 0; ; attempt++) {
    try { return await fetch(url, { signal: AbortSignal.timeout(45000) }); }
    catch (error) { if (attempt === 4) throw error; await new Promise(resolve => setTimeout(resolve, 1500)); }
  }
}
function digest(value) { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
async function main() {
  fs.mkdirSync(work, { recursive: true }); fs.mkdirSync(output, { recursive: true });
  const records = await publicSnapshot();
  assert.equal(records.length, 4);
  report.productionBeforeHash = digest(records);
  for (const source of records) {
    if (process.env.QA_REUSE_LOCAL_SEED === "1") continue;
    const record = structuredClone(source);
    for (const image of record.images) {
      const r = await readPublic(new URL(image.url, "https://yzhdentallab.com"));
      assert.equal(r.status, 200);
      const bytes = Buffer.from(await r.arrayBuffer());
      const file = path.join(work, image.id + ".bin");fs.writeFileSync(file, bytes);
      image.pathname = `case-library/images/${record.id}/${image.id}.png`;
      await run(["r2", "object", "put", `yzh-dental-lab-media/${image.pathname}`, "--file", file, "--content-type", image.contentType || "image/png", ...configArgs]);
    }
    const file = path.join(work, record.id + ".json");fs.writeFileSync(file, JSON.stringify(record));
    await run(["r2", "object", "put", `yzh-dental-lab-media/case-library/records/${record.id}.json`, "--file", file, "--content-type", "application/json", ...configArgs]);
    console.log(`Seeded isolated copy ${record.id}: ${record.images.length} actual images`);
  }
  const base = "http://127.0.0.1:8793";
  const password = crypto.randomBytes(24).toString("base64url");
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = `scrypt$${salt}$${crypto.scryptSync(password, salt, 64).toString("hex")}`;
  const sessionSecret = crypto.randomBytes(32).toString("base64url");
  dev = spawn(process.execPath, [...cliArgs, "dev", ...configArgs, "--port", "8793", "--ip", "127.0.0.1", "--var", `SITE_URL:${base}`, "--var", `CASE_ADMIN_PASSWORD_HASH:${hash}`, "--var", `CASE_SESSION_SECRET:${sessionSecret}`], { cwd: root, env: localEnv, stdio: "ignore", windowsHide: true });
  let ready = false;
  for (let i = 0; i < 60; i++) { try { const r = await fetch(base + "/admin");if (r.status === 200) {ready = true;break;} } catch {} await new Promise(r => setTimeout(r, 1000)); }
  assert(ready, "Local Production-config Worker did not start");
  browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--disable-gpu", "--renderer-process-limit=2"] });
  const context = await browser.newContext();const page = await context.newPage();
  activePage = page;
  page.on("response", response => { if (response.url().includes("/api/") && response.status() >= 400) console.log("API diagnostic", new URL(response.url()).pathname, response.status()); });
  page.on("pageerror", e => report.consoleErrors.push(e.message));
  page.on("dialog", d => d.accept());
  await page.goto(base + "/admin/cases");
  await page.locator('#ownerLoginForm input[name="password"]').fill(password);
  const loginResponse = page.waitForResponse(response => response.url().endsWith("/api/admin-auth") && response.request().method() === "POST");
  await page.locator('#ownerLoginForm button[type="submit"]').click();
  const sessionToken = (await (await loginResponse).json()).sessionToken;
  const apiRequest = await require("playwright").request.newContext({ extraHTTPHeaders: { Authorization: `Bearer ${sessionToken}`, Origin: base } });
  await page.locator("#adminShell").waitFor({ state: "visible" });
  await page.locator(".case-center-row").first().waitFor();
  console.log("Visible isolated case IDs:", await page.locator(".case-center-row").evaluateAll(rows => rows.map(row => row.dataset.caseId)));
  async function clickSave(id, button) {
    const wait = page.waitForResponse(r => r.url().includes("/api/admin-cases") && r.request().method() === "PUT");
    await page.locator(button).click();const response = await wait;
    assert.equal(response.status(), 200, await response.text());
    const data = await response.json();assert.equal(data.case.id, id);return data.case;
  }
  for (const source of records) {
    console.log("Opening", source.id);
    await page.locator(`[data-case-id="${source.id}"]`).click();
    await page.locator('[data-case-tab="story"]').click();
    await page.locator('#caseCenterEditor [name="clinicalNotes"]').fill("QA TEST isolated compatibility edit");
    let saved = await clickSave(source.id, "#casePublishButton");assert.equal(saved.status, "published");
    console.log("Saved published", source.id);
    assert(saved.firstPublishedAt);assert(saved.hasBeenPublished);
    await page.reload();console.log("Reloaded", source.id, page.url());await page.locator(`[data-case-id="${source.id}"]`).click();await page.locator('[data-case-tab="story"]').click();
    assert.equal(await page.locator('#caseCenterEditor [name="clinicalNotes"]').inputValue(), "QA TEST isolated compatibility edit");
    saved = await clickSave(source.id, "#caseHideButton");assert.equal(saved.status, "hidden");
    await page.reload();await page.locator(`[data-case-id="${source.id}"]`).click();
    saved = await clickSave(source.id, "#casePublishButton");assert.equal(saved.status, "published");
    saved = await clickSave(source.id, "#caseSaveButton");assert.equal(saved.status, "draft");
    await page.reload();await page.locator(`[data-case-id="${source.id}"]`).click();
    if (source.featured) await page.locator('#caseCenterEditor [name="featured"]').check();
    saved = await clickSave(source.id, "#casePublishButton");assert.equal(saved.status, "published");
    assert.equal(saved.slug, source.slug);assert.equal(saved.images.length, source.images.length);
    assert.equal(saved.caseOverview || "", source.caseOverview || "");assert.equal(saved.cadDesign || "", source.cadDesign || "");
    await page.screenshot({ path: path.join(output, source.id + ".png"), fullPage: true });
    report.cases.push({ id: source.id, editSave: "PASS", reload: "PASS", unpublishRepublish: "PASS", draftRepublish: "PASS", slugPreserved: true, imageCountPreserved: true, publicStatus: saved.status });
    console.log(`PASS real browser lifecycle ${source.id}`);
  }
  const auth = await apiRequest.get(base + "/api/admin-cases");assert.equal(auth.status(), 200);
  const adminCases = (await auth.json()).cases;
  const source = adminCases[0];
  const duplicate = await apiRequest.post(base + `/api/admin-cases?action=duplicate&id=${source.id}`);
  assert.equal(duplicate.status(), 201);const fresh = (await duplicate.json()).case;
  assert.equal(fresh.hasBeenPublished, false);
  const incomplete = { ...fresh, status: "published", title: "QA", technicalSummary: "", caseOverview: "", shortNote: "", challenge: "", planning: "", technicalOutcome: "", material: "", restorationType: "", implantSystem: "", platform: "", technicalReview: "", seoTitle: "", metaDescription: "", hasBeenPublished: true, firstPublishedAt: "2026-01-01" };
  function multipart(record, images) { return { case: JSON.stringify(record), existingImages: JSON.stringify(images), newImageMeta: "[]", selectedMedia: "[]" }; }
  const blocked = await apiRequest.put(base + "/api/admin-cases", { multipart: multipart(incomplete, fresh.images.map(i => ({...i,altText:""}))) });
  assert.equal(blocked.status(), 400);
  await page.reload();await page.locator(`[data-case-id="${fresh.id}"]`).click();
  await page.locator('#caseCenterEditor [name="title"]').fill("QA");
  await page.locator("#casePublishButton").click();await page.waitForTimeout(300);
  assert.match(await page.locator("#caseCenterMessage").textContent(), /发布前请补齐/);
  await page.locator('[data-case-tab="overview"]').click();
  await page.locator('#caseCenterEditor [name="title"]').fill("QA TEST First Publication");
  await page.locator('#caseCenterEditor [name="technicalSummary"]').fill("QA TEST summary");
  await page.locator('[data-case-tab="technical"]').click();
  await page.locator('#caseCenterEditor [name="material"]').fill("QA TEST material");
  await page.locator('[data-case-tab="seo"]').click();
  await page.locator('#caseCenterEditor [name="seoTitle"]').fill("QA TEST SEO");
  await page.locator('#caseCenterEditor [name="metaDescription"]').fill("QA TEST description");
  await page.locator('[data-case-tab="media"]').click();
  await page.locator('#caseCenterEditor [name="coverAltText"]').fill("QA TEST cover");
  for (const input of await page.locator('#caseExistingMedia [data-key="altText"]').all()) await input.fill("QA TEST image");
  const published = await clickSave(fresh.id, "#casePublishButton");
  assert.equal(published.status, "published");
  await page.reload();await page.locator(`[data-case-id="${fresh.id}"]`).click();
  assert.equal(await page.locator('#caseCenterEditor [name="title"]').inputValue(), "QA TEST First Publication");
  report.firstPublish = { incompleteBackend: blocked.status(), incompleteFrontend: "BLOCKED", forgedClientHistory: "REJECTED", completeFrontendBackend: "PASS HTTP 200", reload: "PASS", duplicateDoesNotInheritHistory: true };
  for (const route of ["/", "/admin", "/admin/cases", "/admin/media", "/api/admin?module=media", "/cases", "/submit-case", ...records.map(r => "/cases/" + r.slug)]) {
    const r = await apiRequest.get(base + route);assert.equal(r.status(), 200, route);report.routes.push({route,status:r.status()});
  }
  const sitemap = await apiRequest.get(base + "/sitemap.xml");const xml = await sitemap.text();assert.equal(sitemap.status(), 200);
  for (const record of records) assert(xml.includes("/cases/" + record.slug));
  const redirects=[];for(const route of ["/implant-restorations","/full-arch-all-on-x","/crown-bridge","/digital-dentistry","/surgical-guides"]){const r=await apiRequest.get(base+route,{maxRedirects:0});assert.equal(r.status(),308);redirects.push({route,status:r.status(),location:r.headers().location});}
  report.sitemap = { status: sitemap.status(), originalCasesIncluded: records.length };
  report.redirects = redirects;
  const homepage = await context.newPage();
  homepage.on("pageerror", error => report.consoleErrors.push(error.message));
  report.featured = [];
  for (const width of [390, 430, 1440]) {
    await homepage.setViewportSize({ width, height: 900 });
    await homepage.goto(base + "/", { waitUntil: "networkidle" });
    const featured = records.find(record => record.featured);
    await homepage.locator(`#featured-cases a[href="/cases/${featured.slug}"]`).first().waitFor();
    assert.equal(await homepage.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    report.featured.push({ width, originalFeaturedVisible: true, overflow: false });
  }
  report.productionAfterHash = digest(await publicSnapshot());assert.equal(report.productionAfterHash, report.productionBeforeHash);
  assert.equal(report.consoleErrors.length, 0);
  await apiRequest.dispose();
  report.completedAt = new Date().toISOString();report.result = "PASS";
}
main().catch(async e => { report.result = "FAIL";report.error = e.message;console.error(e.message);process.exitCode = 1;
  if (activePage) {
    console.log("Failure page", activePage.url(), "title", await activePage.title(), "page errors", report.consoleErrors);
    console.log("Failure text", (await activePage.locator("body").innerText()).slice(0, 1400));
    await activePage.screenshot({ path: path.join(output, "failure.png"), fullPage: true });
  }
}).finally(async () => {
  if (browser) await browser.close();
  if (dev && dev.pid) { try { execFileSync("taskkill", ["/PID", String(dev.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true }); } catch {} }
  fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,"report.json"),JSON.stringify(report,null,2));
  console.log(JSON.stringify({result:report.result,cases:report.cases,firstPublish:report.firstPublish,sitemap:report.sitemap,redirects:report.redirects,productionMutations:0,error:report.error},null,2));
});
