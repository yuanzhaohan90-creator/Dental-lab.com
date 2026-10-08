const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const css = fs.readFileSync(path.join(__dirname, "..", "cloudflare-public", "assets", "site.css"), "utf8");
const viewports = [
  { width: 375, height: 844, columns: 1 },
  { width: 390, height: 844, columns: 1 },
  { width: 430, height: 932, columns: 1 },
  { width: 768, height: 1024, columns: 2 },
  { width: 1440, height: 1000, columns: 3 }
];

function browserExecutable() {
  const candidates = [
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium"
  ].filter(Boolean);
  return candidates.find((candidate) => fs.existsSync(candidate));
}

function cards(count) {
  return Array.from({ length: count }, (_, index) => `
    <a class="priority-case${index === 0 ? " large" : ""}" href="/cases/qa-case-${index + 1}">
      <img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1200' height='900'%3E%3Crect width='1200' height='900' fill='%23d9e8f2'/%3E%3C/svg%3E" alt="QA case ${index + 1}">
      <div><p class="case-category">Full-Arch / All-on-X</p><h3>Complex Full-Arch Implant Restoration With Digital Esthetic Planning and Precision Verification ${index + 1}</h3><p>Technical description for a complete restorative workflow and quality review.</p><span class="text-link">View Work</span></div>
    </a>`).join("");
}

async function main() {
  const executablePath = browserExecutable();
  const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
  const results = [];
  try {
    for (const count of [1, 2, 3]) {
      for (const viewport of viewports) {
        const page = await browser.newPage({ viewport });
        const consoleErrors = [];
        page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
        await page.setContent(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><main><section id="featured-cases" class="home-v3-selected"><div class="wrap"><div class="priority-case-grid">${cards(count)}</div></div></section></main></body></html>`);
        const metrics = await page.evaluate(() => {
          const grid = document.querySelector("#featured-cases .priority-case-grid");
          const items = [...document.querySelectorAll("#featured-cases .priority-case")];
          const columns = getComputedStyle(grid).gridTemplateColumns.split(" ").filter(Boolean).length;
          return {
            columns,
            overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            gridWidth: grid.getBoundingClientRect().width,
            cards: items.map((item) => {
              const image = item.querySelector("img");
              const title = item.querySelector("h3");
              const label = item.querySelector(".case-category");
              const description = item.querySelector("div>p:not(.case-category)");
              const link = item.querySelector(".text-link");
              return {
                width: item.getBoundingClientRect().width,
                imageRatio: image.getBoundingClientRect().width / image.getBoundingClientRect().height,
                titleVisible: title.getBoundingClientRect().height > 0 && getComputedStyle(title).overflow !== "hidden",
                labelVisible: label.getBoundingClientRect().height > 0,
                descriptionVisible: description.getBoundingClientRect().height > 0,
                linkText: link.textContent.trim(),
                href: item.getAttribute("href")
              };
            })
          };
        });
        assert.equal(metrics.columns, viewport.columns, `${count} cards at ${viewport.width}px use the wrong grid definition`);
        assert.ok(metrics.overflow <= 0, `${count} cards at ${viewport.width}px overflow horizontally by ${metrics.overflow}px`);
        for (const card of metrics.cards) {
          if (count === 1) assert.ok(card.width >= metrics.gridWidth - 1, `single featured case must fill the grid at ${viewport.width}px`);
          if (viewport.width <= 760) assert.ok(card.width >= metrics.gridWidth - 1, `mobile card is not full width at ${viewport.width}px`);
          assert.ok(Math.abs(card.imageRatio - 4 / 3) < 0.02, `image ratio is not 4:3 at ${viewport.width}px`);
          assert.ok(card.titleVisible && card.labelVisible && card.descriptionVisible, `card content is clipped at ${viewport.width}px`);
          assert.equal(card.linkText, "View Work");
          assert.match(card.href, /^\/cases\/qa-case-/);
        }
        await page.evaluate(() => {
          document.addEventListener("click", (event) => {
            const card = event.target.closest("#featured-cases .priority-case");
            if (!card) return;
            event.preventDefault();
            document.documentElement.dataset.clickedCase = card.getAttribute("href");
          }, { once: true });
        });
        await page.locator("#featured-cases .priority-case").first().click();
        assert.equal(await page.locator("html").getAttribute("data-clicked-case"), "/cases/qa-case-1", `whole-card click failed at ${viewport.width}px`);
        assert.equal(consoleErrors.length, 0, `console errors at ${viewport.width}px: ${consoleErrors.join("; ")}`);
        results.push({ count, viewport: viewport.width, columns: metrics.columns, overflow: metrics.overflow });
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }
  console.log(JSON.stringify(results, null, 2));
  console.log("featured cases responsive tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
