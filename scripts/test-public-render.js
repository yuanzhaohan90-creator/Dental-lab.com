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

const workflow = renderPublicPage("workflow", data);
assert.match(workflow, /Submit Files/);
assert.match(workflow, /Technical Review/);
assert.match(workflow, /Workflow Confirmation/);
assert.match(workflow, /CAD \/ Production/);
assert.match(workflow, /Quality Control/);
assert.match(workflow, /Delivery/);
assert.match(workflow, /href="\/submit-case"/);

const designOnly = renderPublicPage("designOnly", data);
assert.match(designOnly, /Crown \/ Bridge CAD/);
assert.match(designOnly, /Implant Crown/);
assert.match(designOnly, /Custom Abutment/);
assert.match(designOnly, /Full-Arch Design/);
assert.match(designOnly, /Surgical Guide Design/);
assert.match(designOnly, /Printable Model/);
assert.match(designOnly, /Exocad \/ 3Shape Support/);
assert.match(designOnly, /href="\/submit-case"/);

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

const featuredRecord = {
  id: "CASE-FEATURED",
  slug: "owner-approved-full-arch-work",
  title: "Owner Approved Full-Arch Work",
  status: "published",
  contentType: "case_study",
  category: "Full-Arch / All-on-X",
  shortNote: "Technical review and final restoration.",
  coverImage: { url: "/assets/real/full-arch-titanium-framework-10.jpg" }
};
const fullArch = renderPublicPage("fullArch", {
  ...data,
  publishedCases: [featuredRecord],
  pages: {
    ...data.pages,
    fullArch: {
      ...data.pages.fullArch,
      featuredCase: { ...data.pages.fullArch.featuredCase, caseId: featuredRecord.id },
      restorationOptions: data.pages.fullArch.restorationOptions.map((option, index) => ({ ...option, caseId: index === 0 ? featuredRecord.id : "" }))
    }
  }
});
assert.match(fullArch, /Featured Full-Arch Case/);
assert.match(fullArch, /href="\/cases\/owner-approved-full-arch-work"/);
assert.doesNotMatch(fullArch, /data-featured-case="fullArch" hidden/);

console.log("public SSR render tests passed");
