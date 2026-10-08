const assert = require("assert");
const { defaultPublicSiteData } = require("../lib/public-site-data");
const { renderPublicPage } = require("../lib/public-page-renderer");

const data = defaultPublicSiteData();
const home = renderPublicPage("home", data);
assert.match(home, /data-server-rendered="true"/);
assert.match(home, /Complex Implant Cases\. Solved\./);
assert.match(home, /Services/);
assert.match(home, /fetchpriority="high"/);
assert.match(home, /<link rel="canonical" href="https:\/\/yzhdentallab\.com\/">/);
assert.match(home, /property="og:title"/);
assert.match(home, /property="og:description"/);
assert.match(home, /property="og:url"/);
assert.equal((home.match(/rel="canonical"/g) || []).length, 1);
assert.doesNotMatch(home, />Loading/);

const homeSeo = renderPublicPage("home", {
  ...data,
  seo: {
    ...data.seo,
    home: {
      ...data.seo.home,
      title: "QA SEO Home Title | YZH Dental Lab",
      description: "QA SEO home description for render verification.",
      canonicalUrl: "https://yzhdentallab.com/",
      ogTitle: "QA OG Home Title",
      ogDescription: "QA OG description.",
      ogImage: "/assets/real/hero-full-arch-premium-01.jpg",
      noindex: true,
      nofollow: true
    }
  }
}, { adminPreview: false });
assert.match(homeSeo, /<title>QA SEO Home Title \| YZH Dental Lab<\/title>/);
assert.match(homeSeo, /content="QA SEO home description for render verification\."/);
assert.match(homeSeo, /content="QA OG Home Title"/);
assert.match(homeSeo, /content="noindex,nofollow"/);

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

const { load } = require("cheerio");
const portfolio = load(renderPublicPage("cases", { ...data, publishedCases: [featuredRecord] }));
assert.equal(portfolio(`a[href='/cases/${featuredRecord.slug}']`).length, 1, "featured cases must not repeat in all cases");
const about = load(renderPublicPage("about", {
  ...data,
  pages: { ...data.pages, about: { ...data.pages.about,
    workflowSteps: [{ title: "New Item" }, { title: "Review", description: "Review records." }],
    laboratoryGallery: [{ title: "Laboratory", media: {}, caption: "微信图片_20260101.jpg" }],
    equipmentGallery: [], qualityCollection: []
  } }
}));
assert.doesNotMatch(about("main").text(), /New Item|微信图片/);
assert.equal(about("[data-manager-media]:empty").length, 0, "empty media boxes must be absent");
const { renderCasePage } = require("../api/case-page");
const detail = load(renderCasePage({ ...featuredRecord, images: [
  { id: "cover", isCover: true, pathname: "cover.jpg", altText: "Cover" },
  { id: "design", pathname: "design.jpg", imageType: "Design", altText: "Design" }
] }, false, {}, []));
assert.equal(detail("#case-design img").length, 1);
assert.equal(detail("#case-gallery img").length, 0, "stage images must not repeat in gallery");
assert.equal(JSON.parse(detail('script[type="application/ld+json"]').text())["@type"], "Article");
console.log("public audit regression tests passed");
