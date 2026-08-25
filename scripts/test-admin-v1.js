const assert = require("assert");
const { DEFAULT_HOMEPAGE, DEFAULT_SETTINGS, normalizeHomepage, normalizeSettings } = require("../lib/admin-store");

const long = "x".repeat(1000);
const homepage = normalizeHomepage({
  hero: {
    eyebrow: long,
    heading: "  Preview Heading  ",
    description: long,
    imageMediaId: "MEDIA-ABC",
    imagePath: "/assets/approved.webp",
    primaryLabel: "Start",
    primaryDestination: "/submit-case",
    secondaryLabel: "WhatsApp",
    secondaryDestination: "https://wa.me/8613714730109"
  },
  selectedWork: {
    eyebrow: "Featured",
    heading: "Selected work",
    description: "Only owner-selected cases.",
    caseIds: ["CASE-1", "CASE-2", "CASE-2", "CASE-3", "CASE-4"]
  }
});

assert.equal(homepage.hero.eyebrow.length, 160);
assert.equal(homepage.hero.heading, "Preview Heading");
assert.equal(homepage.hero.description.length, 500);
assert.deepEqual(homepage.selectedWork.caseIds, ["CASE-1", "CASE-2", "CASE-3"]);

const fallbackHomepage = normalizeHomepage({});
assert.equal(fallbackHomepage.hero.heading, DEFAULT_HOMEPAGE.hero.heading);
assert.equal(fallbackHomepage.selectedWork.caseIds.length, 0);

const settings = normalizeSettings({
  companyName: "  YZH Lab  ",
  publicEmail: "owner@example.com",
  whatsapp: "+86 000",
  whatsappUrl: "https://wa.me/86000",
  phone: "+86 000",
  location: "China",
  defaultSeoTitle: long,
  defaultSeoDescription: long,
  defaultOgMediaId: "MEDIA-SEO",
  defaultOgImagePath: "/assets/seo.webp"
});

assert.equal(settings.companyName, "YZH Lab");
assert.equal(settings.publicEmail, "owner@example.com");
assert.equal(settings.defaultSeoTitle.length, 180);
assert.equal(settings.defaultSeoDescription.length, 320);
assert.equal(settings.defaultOgMediaId, "MEDIA-SEO");

const fallbackSettings = normalizeSettings({});
assert.equal(fallbackSettings.companyName, DEFAULT_SETTINGS.companyName);
assert.equal(fallbackSettings.publicEmail, DEFAULT_SETTINGS.publicEmail);

console.log("admin-v1 unit tests passed");
