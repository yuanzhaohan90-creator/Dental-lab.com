const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { load } = require("cheerio");
const { renderCasePage } = require("../api/case-page");

const record = {
  id: "CASE-NAV-QA",
  slug: "case-navigation-qa",
  title: "Case Navigation QA",
  status: "published",
  contentType: "case_study",
  category: "Full-Arch / All-on-X",
  caseOverview: "A real overview.",
  challenge: "A real challenge.",
  planning: "A real plan.",
  cadDesign: "A real design.",
  framework: "A real framework.",
  workflow: "A real clinical try-in.",
  finalRestoration: "A real final restoration.",
  material: "Zirconia",
  images: [
    { url: "/cover.jpg", isCover: true, imageType: "Final", altText: "Cover" },
    { url: "/design.jpg", imageType: "Design", altText: "Design" }
  ]
};

const html = renderCasePage(record, false, {}, []);
const $ = load(html);
const links = $(".case-journey-nav a").toArray();
assert.ok(links.length >= 7, "expected populated case navigation");
links.forEach((element) => {
  const href = $(element).attr("href");
  assert.match(href, /^#case-[a-z0-9-]+$/);
  assert.equal($(href).length, 1, `missing section for ${href}`);
});
assert.equal($(".case-journey-nav a").filter((_, element) => $(element).text().trim() === "Clinical Try-in").length, 1);
assert.equal($("h2").filter((_, element) => $(element).text().trim() === "Restoration Technical Details").length, 1);
assert.doesNotMatch(html, /Restorative details\./);

const sparseHtml = renderCasePage({
  ...record,
  challenge: "",
  planning: "",
  cadDesign: "",
  framework: "",
  workflow: "",
  finalRestoration: "",
  images: [{ url: "/cover.jpg", isCover: true, imageType: "Other", altText: "Cover" }]
}, false, {}, []);
const sparse = load(sparseHtml);
["Challenge", "Planning", "Design", "Framework", "Clinical Try-in", "Final Restoration"].forEach((label) => {
  assert.equal(sparse(".case-journey-nav a").filter((_, element) => sparse(element).text().trim() === label).length, 0, `${label} should be hidden without content`);
});

const css = fs.readFileSync(path.join(__dirname, "..", "cloudflare-public", "assets", "site.css"), "utf8");
assert.match(css, /\.case-journey-links\{[^}]*overflow-x:auto/);
assert.match(css, /\.case-journey-nav \.wrap\{[^}]*min-width:0/);
assert.match(css, /\[id\^="case-"\]\{scroll-margin-top:/);
assert.match(css, /a\[aria-current="location"\]/);

const siteJs = fs.readFileSync(path.join(__dirname, "..", "cloudflare-public", "assets", "site.js"), "utf8");
assert.match(siteJs, /initCaseJourneyNavigation/);
assert.match(siteJs, /scrollIntoView/);
assert.match(siteJs, /aria-current/);

console.log("case detail navigation tests passed");
