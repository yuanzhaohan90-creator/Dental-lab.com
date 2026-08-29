const assert = require("assert");
const { DEFAULT_HOMEPAGE, DEFAULT_PAGE_CONFIGS, DEFAULT_SETTINGS, isValidLinkedInUrl, normalizeHomepage, normalizePageConfig, normalizeSettings } = require("../lib/admin-store");

const long = "x".repeat(1000);
const homepage = normalizeHomepage({
  hero: {
    eyebrow: long,
    heading: "  Preview Heading  ",
    description: long,
    imageMediaId: "MEDIA-ABC",
    imagePath: "/assets/approved.webp",
    fit: "contain",
    focalPosition: "top",
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
assert.equal(homepage.hero.media.mediaId, "MEDIA-ABC");
assert.equal(homepage.hero.media.fit, "contain");
assert.equal(homepage.hero.media.focalPosition, "top");
assert.deepEqual(homepage.selectedWork.caseIds, ["CASE-1", "CASE-2", "CASE-3"]);
assert.equal(homepage.workflow.items.length, 4);

const fallbackHomepage = normalizeHomepage({});
assert.equal(fallbackHomepage.hero.heading, DEFAULT_HOMEPAGE.hero.heading);
assert.equal(fallbackHomepage.selectedWork.caseIds.length, 0);
assert.equal(fallbackHomepage.hero.media.fallbackPath, DEFAULT_HOMEPAGE.hero.media.fallbackPath);
assert.equal(fallbackHomepage.hero.media.fit, "cover");
assert.equal(fallbackHomepage.technicalProof.media.fit, "contain");

const implant = normalizePageConfig("implant", { hero: { heading: "Implant Editor", media: { mediaId: "MEDIA-IMPLANT" } }, featuredWork: { caseId: "CASE-1" } });
assert.equal(implant.hero.heading, "Implant Editor");
assert.equal(implant.hero.media.mediaId, "MEDIA-IMPLANT");
assert.equal(implant.featuredWork.caseId, "CASE-1");
assert.equal(implant.customAbutments.media.fit, "contain");

const fullArch = normalizePageConfig("fullArch", { restorationOptions: [{ heading: "PMMA Updated", media: { mediaType: "video", mediaId: "MEDIA-VIDEO" } }] });
assert.equal(fullArch.restorationOptions.length, 3);
assert.equal(fullArch.restorationOptions[0].heading, "PMMA Updated");
assert.equal(fullArch.restorationOptions[0].media.mediaType, "video");
assert.equal(fullArch.restorationOptions[0].media.fit, "cover");
assert.equal(fullArch.hero.heading, DEFAULT_PAGE_CONFIGS.fullArch.hero.heading);

const about = normalizePageConfig("about", { packing: { media: { mediaId: "MEDIA-PACKING" } } });
assert.equal(about.packing.media.mediaId, "MEDIA-PACKING");
assert.equal(about.production.media.fit, "contain");

const safeMedia = normalizePageConfig("implant", { hero: { media: { fit: "stretch", focalPosition: "random" } } });
assert.equal(safeMedia.hero.media.fit, "cover");
assert.equal(safeMedia.hero.media.focalPosition, "center");

const settings = normalizeSettings({
  companyName: "  YZH Lab  ",
  publicEmail: "owner@example.com",
  whatsapp: "+86 000",
  whatsappUrl: "https://wa.me/86000",
  phone: "+86 000",
  linkedinUrl: "https://www.linkedin.com/company/yzh-dental-lab",
  location: "China",
  defaultSeoTitle: long,
  defaultSeoDescription: long,
  defaultOgMediaId: "MEDIA-SEO",
  primaryLogoMediaId: "MEDIA-LOGO",
  darkLogoMediaId: "MEDIA-DARK-LOGO",
  faviconMediaId: "MEDIA-FAVICON",
  defaultOgImagePath: "/assets/seo.webp"
});

assert.equal(settings.companyName, "YZH Lab");
assert.equal(settings.publicEmail, "owner@example.com");
assert.equal(settings.linkedinUrl, "https://www.linkedin.com/company/yzh-dental-lab");
assert.equal(isValidLinkedInUrl("https://www.linkedin.com/in/wei-dai-25b911325"), true);
assert.equal(isValidLinkedInUrl("https://example.com/company/yzh"), false);
assert.equal(settings.defaultSeoTitle.length, 180);
assert.equal(settings.defaultSeoDescription.length, 320);
assert.equal(settings.defaultOgMediaId, "MEDIA-SEO");
assert.equal(settings.primaryLogoMediaId, "MEDIA-LOGO");
assert.equal(settings.darkLogoMediaId, "MEDIA-DARK-LOGO");
assert.equal(settings.faviconMediaId, "MEDIA-FAVICON");

const fallbackSettings = normalizeSettings({});
assert.equal(fallbackSettings.companyName, DEFAULT_SETTINGS.companyName);
assert.equal(fallbackSettings.publicEmail, DEFAULT_SETTINGS.publicEmail);
assert.equal(fallbackSettings.linkedinUrl, DEFAULT_SETTINGS.linkedinUrl);

console.log("admin-v1 unit tests passed");
