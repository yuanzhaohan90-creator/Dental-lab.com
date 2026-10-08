const { chromium } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");

async function main() {
  const base = process.env.QA_PUBLIC_URL || "https://yzh-dental-lab-preview.yzh-dental-lab-site.workers.dev";
  if (!new URL(base).hostname.startsWith("yzh-dental-lab-preview.")) throw new Error("Preview-only browser audit");
  const output = path.join(process.cwd(), "test-results", "public-audit");
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const results = [];
  const context = await browser.newContext();
  const api = await context.request.get(`${base}/api/cases`);
  const body = await api.json();
  const cases = body.cases || body.items || [];
  const routes = ["/", "/services", "/services/implant", "/services/full-arch", "/services/crown-bridge", "/services/digital-workflow", "/services/design-only", "/services/surgical-guide", "/about", "/workflow", "/cases", "/submit-case", "/privacy-policy", "/terms", ...cases.map(item => `/cases/${item.slug}`)];
  for (const width of [390, 430, 768, 1440]) {
    const page = await context.newPage();
    await page.setViewportSize({ width, height: 900 });
    for (const route of routes) {
      console.log(`Browser audit ${width}px ${route}`);
      const errors = [];
      const onError = error => errors.push(error.message);
      page.on("pageerror", onError);
      const response = await page.goto(`${base}${route}?qa=${Date.now()}`, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForTimeout(1200);
      const height = await page.evaluate(() => document.body.scrollHeight);
      for (let top = 0; top < height; top += 900) {
        await page.evaluate(top => window.scrollTo({ top, behavior: "instant" }), top);
        await page.waitForTimeout(70);
      }
      await page.waitForTimeout(1500);
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
      await page.waitForTimeout(300);
      const state = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth > innerWidth + 1,
        brokenImages: [...document.images].filter(image => image.offsetParent !== null && image.complete && !image.naturalWidth).map(image => image.src),
        badAnchors: [...document.querySelectorAll(".case-journey-nav a")].filter(link => !document.getElementById(link.hash.slice(1))).map(link => link.hash),
        placeholders: /\bNew Item\b|Publish implant work|appears here when published|微信图片/.test(document.querySelector("main").textContent),
        headerHeight: document.querySelector("header")?.getBoundingClientRect().height,
        headings: [...document.querySelectorAll("h1,h2")].map(node => node.textContent.trim())
      }));
      for (const link of await page.locator(".case-journey-nav a").all()) {
        await link.click();
        await page.waitForTimeout(350);
        if (!(await link.getAttribute("class") || "").includes("active")) errors.push("Case navigation did not highlight");
      }
      if (["/", "/about", "/cases"].includes(route) || route.startsWith("/cases/")) await page.screenshot({ path: path.join(output, `${width}-${route.replace(/\W/g, "_") || "home"}.png`), fullPage: true });
      results.push({ width, route, status: response.status(), ...state, errors });
      page.off("pageerror", onError);
    }
    await page.close();
  }
  const sitemapResponse = await context.request.get(`${base}/sitemap.xml?qa=${Date.now()}`);
  const sitemap = await sitemapResponse.text();
  const redirects = [];
  for (const route of ["/implant-restorations", "/full-arch-all-on-x", "/crown-bridge", "/digital-dentistry", "/surgical-guides"]) {
    const response = await context.request.get(`${base}${route}`, { maxRedirects: 0 });
    redirects.push({ route, status: response.status(), location: response.headers().location });
  }
  await browser.close();
  const failures = results.filter(item => item.status !== 200 || item.overflow || item.brokenImages.length || item.badAnchors.length || item.placeholders || item.errors.length);
  const report = { base, caseCount: cases.length, results, redirects, sitemapStatus: sitemapResponse.status(), missingSitemapCases: cases.filter(item => !sitemap.includes(`/cases/${item.slug}`)).map(item => item.slug), failures };
  fs.writeFileSync(path.join(output, "report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ pages: results.length, caseCount: cases.length, failures, redirects, missingSitemapCases: report.missingSitemapCases }, null, 2));
  if (failures.length || redirects.some(item => item.status !== 308) || report.missingSitemapCases.length) process.exitCode = 1;
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
