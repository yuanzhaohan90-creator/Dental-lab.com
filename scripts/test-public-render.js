const assert = require("assert");
const { defaultPublicSiteData } = require("../lib/public-site-data");
const { renderPublicPage } = require("../lib/public-page-renderer");

const data = defaultPublicSiteData();
const home = renderPublicPage("home", data);
assert.match(home, /data-server-rendered="true"/);
assert.match(home, /Complex Implant Cases\. Solved\./);
assert.match(home, /Services/);
assert.match(home, /fetchpriority="high"/);
assert.doesNotMatch(home, />Loading/);

const cases = renderPublicPage("cases", {
  ...data,
  publishedCases: [{
    id: "CASE-1",
    slug: "anterior-zirconia-esthetic-restorations-7-10",
    title: "Anterior Zirconia Esthetic Restorations",
    status: "published",
    contentType: "quick_work",
    category: "Crown & Bridge",
    restorationType: "Crown & Bridge",
    material: "Zirconia",
    shade: "A3",
    coverImage: { url: "/assets/real/anterior-crown-model-12.jpg" }
  }]
});
assert.match(cases, /Anterior Zirconia Esthetic Restorations/);
assert.match(cases, /data-category="Crown &amp; Bridge"/);
assert.doesNotMatch(cases, /id="featuredCaseSection"/);
assert.doesNotMatch(cases, /Crown &amp; Bridge · Crown &amp; Bridge/);
assert.match(cases, /Zirconia · A3/);

console.log("public SSR render tests passed");
