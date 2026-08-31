const fs = require("fs");
const path = require("path");
const cheerio = require("cheerio");

const PAGE_TEMPLATES = {
  home: "templates/index.tpl",
  implant: "templates/implant-restorations.tpl",
  fullArch: "templates/full-arch-all-on-x.tpl",
  cases: "templates/cases.tpl",
  crownBridge: "templates/crown-bridge.tpl",
  digital: "templates/digital-dentistry.tpl",
  surgicalGuides: "templates/surgical-guides.tpl",
  about: "templates/about.tpl",
  submitCase: "templates/submit-case.tpl",
  privacy: "templates/privacy-policy.tpl"
};

const SERVICES = [
  ["/implant-restorations", "Implant Restorations"],
  ["/full-arch-all-on-x", "Full-Arch / All-on-X"],
  ["/crown-bridge", "Crown & Bridge"],
  ["/digital-dentistry", "Digital Dentistry / CAD-CAM"],
  ["/surgical-guides", "Surgical Guides"]
];

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function absoluteUrl(value) {
  const input = String(value || "");
  if (!input) return "";
  if (/^https:\/\//i.test(input)) return input;
  return `https://yzhdentallab.com${input.startsWith("/") ? input : `/${input}`}`;
}

function valueAt(object, objectPath) {
  return String(objectPath || "").split(".").reduce((value, key) => value?.[key], object);
}

function logoMarkup(settings, footer = false) {
  const url = footer ? (settings.darkLogoUrl || settings.primaryLogoUrl) : settings.primaryLogoUrl;
  const source = url || "/assets/brand/yzh-mark.svg";
  return `<img class="brand-logo" src="${escapeHtml(source)}" alt="" width="72" height="72"><span>${escapeHtml(settings.companyName || "YZH Dental Lab")}</span>`;
}

function activeFor(page, href) {
  if (href === "/") return page === "home";
  if (href === "/cases") return page === "cases";
  if (href === "/about") return page === "about";
  if (href === "/submit-case") return page === "submitCase";
  return false;
}

function headerMarkup(page, settings) {
  const servicesActive = ["implant", "fullArch", "crownBridge", "digital", "surgicalGuides"].includes(page);
  const serviceLinks = SERVICES.map(([href, label]) => `<a href="${href}">${escapeHtml(label)}</a>`).join("");
  const link = (href, label) => `<a href="${href}"${activeFor(page, href) ? ' class="active" aria-current="page"' : ""}>${label}</a>`;
  return `<header class="site-header"><div class="wrap nav">
    <a class="brand" href="/" aria-label="YZH Dental Lab home">${logoMarkup(settings)}</a>
    <button class="menu-toggle" type="button" aria-controls="primaryNav" aria-expanded="false">Menu</button>
    <nav class="navlinks" id="primaryNav" aria-label="Primary">
      ${link("/", "Home")}
      <div class="nav-dropdown${servicesActive ? " active" : ""}">
        <button class="nav-dropdown-toggle" type="button" aria-expanded="false" aria-controls="servicesMenu">Services <span aria-hidden="true">▾</span></button>
        <div class="nav-dropdown-menu" id="servicesMenu">${serviceLinks}</div>
      </div>
      ${link("/cases", "Cases")}
      ${link("/about", "About")}
    </nav>
    <a class="btn btn-primary nav-cta" href="/submit-case">Send a Trial Case</a>
  </div></header>`;
}

function footerMarkup(settings) {
  const email = settings.publicEmail || "yzhdentallab@gmail.com";
  const whatsapp = settings.whatsapp || settings.phone || "+86 137 1473 0109";
  const whatsappUrl = settings.whatsappUrl || "https://wa.me/8613714730109";
  const phone = settings.phone || "";
  const linkedin = settings.linkedinUrl || "";
  return `<footer class="site-footer"><div class="wrap footer-grid">
    <div><a class="footer-brand" href="/">${logoMarkup(settings, true)}</a><p>Digital dental laboratory in China supporting overseas labs and clinics with implant, full-arch and CAD/CAM restorative workflows.</p></div>
    <div><h3>Services</h3>${SERVICES.map(([href, label]) => `<a href="${href}">${escapeHtml(label)}</a>`).join("")}</div>
    <div><h3>Company</h3><a href="/cases">Cases</a><a href="/about">About</a><a href="/submit-case">Send a Trial Case</a><a href="/privacy-policy">Privacy Policy</a></div>
    <div><h3>Contact</h3><a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a><button type="button" class="contact-copy-link" data-copy-email="${escapeHtml(email)}">Copy Email</button><a href="${escapeHtml(whatsappUrl)}" target="_blank" rel="noopener noreferrer">WhatsApp: ${escapeHtml(whatsapp)}</a>${phone ? `<a href="tel:${escapeHtml(phone.replace(/[^+\d]/g, ""))}">Phone: ${escapeHtml(phone)}</a>` : ""}${linkedin ? `<a href="${escapeHtml(linkedin)}" target="_blank" rel="noopener noreferrer" data-contact-linkedin>LinkedIn</a>` : ""}</div>
    <p class="footer-copyright">© ${new Date().getFullYear()} ${escapeHtml(settings.companyName || "YZH Dental Lab")}. All rights reserved.</p>
  </div></footer>`;
}

function mediaMarkup(slot, hero = false) {
  const url = slot?.url || slot?.fallbackPath;
  if (!url) return "";
  const focus = { center: "center center", top: "center top", bottom: "center bottom", left: "left center", right: "right center" }[slot.focalPosition] || "center center";
  const fit = slot.fit === "contain" ? "contain" : "cover";
  if (slot.mediaType === "video") {
    return `<video src="${escapeHtml(url)}"${slot.posterUrl ? ` poster="${escapeHtml(slot.posterUrl)}"` : ""} ${slot.autoplay ? "autoplay" : "controls"} muted ${slot.loop ? "loop" : ""} playsinline preload="${hero ? "metadata" : "none"}" style="object-fit:${fit};object-position:${focus}" data-media-fit="${fit}" data-media-focus="${escapeHtml(slot.focalPosition || "center")}"></video>`;
  }
  return `<img src="${escapeHtml(url)}" alt="${escapeHtml(slot.altText || "YZH Dental Lab work")}" width="1600" height="900" loading="${hero ? "eager" : "lazy"}" decoding="async"${hero ? ' fetchpriority="high"' : ""} style="object-fit:${fit};object-position:${focus}" data-media-fit="${fit}" data-media-focus="${escapeHtml(slot.focalPosition || "center")}">`;
}

function applyManagedPage($, pageConfig) {
  if (!pageConfig) return;
  $("[data-manager-text]").each((_, element) => {
    const value = valueAt(pageConfig, $(element).attr("data-manager-text"));
    if (value) $(element).text(value);
  });
  $("[data-manager-href]").each((_, element) => {
    const value = valueAt(pageConfig, $(element).attr("data-manager-href"));
    if (value) $(element).attr("href", value);
  });
  $("[data-manager-media]").each((_, element) => {
    const node = $(element);
    const slot = valueAt(pageConfig, node.attr("data-manager-media"));
    const url = slot?.url || slot?.fallbackPath;
    const hideTarget = node.closest("[data-hide-when-empty]");
    if (!url) {
      if (hideTarget.length) hideTarget.attr("hidden", "");
      return;
    }
    if (hideTarget.length) hideTarget.removeAttr("hidden");
    const isHero = node.closest(".hero,.page-hero").length > 0;
    const markup = mediaMarkup(slot, isHero);
    if (node.is("img,video")) node.replaceWith(markup);
    else {
      const existing = node.find("img,video").first();
      if (existing.length) existing.replaceWith(markup);
      else node.prepend(markup);
    }
  });
}

function caseTechnicalLine(item) {
  const values = [item.restorationType, item.material, item.implantSystem, item.platform, item.shade]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .filter((value, index, all) => all.findIndex((other) => other.toLowerCase() === value.toLowerCase()) === index)
    .filter((value) => value.toLowerCase() !== String(item.category || "").toLowerCase());
  return values.join(" · ");
}

function caseCard(item, featured = false) {
  const line = caseTechnicalLine(item);
  return `<article class="${featured ? "featured-public-case" : "public-case-card"}"><a href="/cases/${encodeURIComponent(item.slug)}">
    <img src="${escapeHtml(item.coverImage?.url || "/assets/real/anterior-crown-model-12.jpg")}" alt="${escapeHtml(item.title)}" width="1200" height="900" loading="lazy" decoding="async">
    <div><span class="case-category">${escapeHtml(featured ? "Featured Case Study" : item.category)}</span><h3>${escapeHtml(item.title)}</h3>${line ? `<p class="case-technical-line">${escapeHtml(line)}</p>` : ""}${item.shortNote ? `<p>${escapeHtml(item.shortNote)}</p>` : ""}<span class="text-link">${featured ? "View Case Study" : "View Work"}</span></div>
  </a></article>`;
}

function renderCasesPage($, cases, dataLoadFailed) {
  const featured = cases.filter((item) => item.contentType === "case_study");
  const recent = cases.filter((item) => item.contentType !== "case_study");
  const categories = [...new Set(cases.map((item) => item.category).filter(Boolean))];
  const labels = { "Full-Arch / All-on-X": "Full-Arch", "Implant Bridge": "Implant" };
  $("#caseFilters").html([['', 'All'], ...categories.map((category) => [category, labels[category] || category])]
    .map(([category, label], index) => `<button class="${index === 0 ? "active" : ""}" type="button" data-category="${escapeHtml(category)}">${escapeHtml(label)}</button>`).join(""));
  if (!featured.length) $("#featuredCaseSection").remove();
  else $("#featuredCaseList").html(featured.map((item) => caseCard(item, true)).join(""));
  if (dataLoadFailed) {
    $("#recentWorkList").html('<p class="case-library-state">Published work is temporarily unavailable. Please try again shortly.</p>');
  } else if (!recent.length) {
    $("#recentWorkList").html('<p class="case-library-state">No published work yet.</p>');
  } else $("#recentWorkList").html(recent.map((item) => caseCard(item)).join(""));
  $("body").append(`<script id="publicCaseData" type="application/json">${JSON.stringify(cases).replace(/</g, "\\u003c")}</script>`);
}

function renderSelectedCases($, data) {
  if (!data.selectedCases?.length) return;
  const selectedWork = data.homepage?.selectedWork || {};
  if (selectedWork.eyebrow) $("#featured-cases .section-head .eyebrow").text(selectedWork.eyebrow);
  if (selectedWork.heading) $("#featured-cases .section-head h2").text(selectedWork.heading);
  if (selectedWork.description) $("#featured-cases .section-head .copy").text(selectedWork.description);
  $("#featured-cases .priority-case-grid").html(data.selectedCases.map((item, index) => {
    const line = caseTechnicalLine(item) || item.shortNote || item.summary;
    return `<a class="priority-case${index === 0 ? " large" : ""}" href="/cases/${encodeURIComponent(item.slug)}"><img src="${escapeHtml(item.coverImage?.url)}" alt="${escapeHtml(item.title)}" width="1200" height="900" loading="lazy" decoding="async"><div><p class="case-category">${escapeHtml(item.category)}</p><h3>${escapeHtml(item.title)}</h3>${line ? `<p>${escapeHtml(line)}</p>` : ""}<span class="text-link">View Work</span></div></a>`;
  }).join(""));
}

function applyCommonContent($, page, data) {
  const settings = data.settings;
  $("header.site-header").replaceWith(headerMarkup(page, settings));
  $("footer.site-footer").replaceWith(footerMarkup(settings));
  $('link[rel="icon"]').attr("href", settings.faviconUrl || "/favicon.svg");
  $("a[href^='mailto:']").attr("href", `mailto:${settings.publicEmail || "yzhdentallab@gmail.com"}`);
  $("a[href*='wa.me']").attr({ href: settings.whatsappUrl || "https://wa.me/8613714730109", target: "_blank", rel: "noopener noreferrer" });

  const ogImage = $("meta[property='og:image']");
  if (ogImage.length) ogImage.attr("content", absoluteUrl(ogImage.attr("content") || settings.defaultOgImageUrl));
  const organization = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: settings.companyName || "YZH Dental Lab",
    url: "https://yzhdentallab.com/",
    logo: "https://yzhdentallab.com/assets/brand/yzh-mark.svg",
    email: settings.publicEmail,
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "sales",
      email: settings.publicEmail,
      telephone: settings.phone,
      availableLanguage: ["English", "Chinese"]
    }
  };
  const schema = $('script[type="application/ld+json"]').first();
  if (schema.length) schema.text(JSON.stringify(organization));
  else $("head").append(`<script type="application/ld+json">${JSON.stringify(organization)}</script>`);

  if (page === "about" || page === "submitCase") {
    const target = page === "about" ? $(".trial .cta-panel").first() : $(".contact-links").first();
    if (target.length && !target.find("[data-central-contact-row]").length) {
      target.append(`<div class="central-contact-row" data-central-contact-row><a href="mailto:${escapeHtml(settings.publicEmail)}">Email</a><button type="button" class="contact-copy-link" data-copy-email="${escapeHtml(settings.publicEmail)}">Copy Email</button>${settings.phone ? `<a href="tel:${escapeHtml(settings.phone.replace(/[^+\d]/g, ""))}">Phone</a>` : ""}${settings.linkedinUrl ? `<a href="${escapeHtml(settings.linkedinUrl)}" target="_blank" rel="noopener noreferrer">LinkedIn</a>` : ""}</div>`);
    }
  }
}

function ensureHeroPriority($) {
  const heroMedia = $(".hero img,.page-hero img,.hero video,.page-hero video").first();
  if (!heroMedia.length) return;
  if (heroMedia.is("img")) heroMedia.attr({ loading: "eager", fetchpriority: "high", decoding: "async", width: "1600", height: "900" });
  const preloadUrl = heroMedia.is("video") ? heroMedia.attr("poster") : heroMedia.attr("src");
  if (preloadUrl && !$(`link[rel='preload'][href='${preloadUrl}']`).length) $("head").append(`<link rel="preload" as="image" href="${escapeHtml(preloadUrl)}" fetchpriority="high">`);
}

function renderPublicPage(page, data, options = {}) {
  const template = PAGE_TEMPLATES[page];
  if (!template) return null;
  const html = fs.readFileSync(path.join(process.cwd(), template), "utf8");
  const $ = cheerio.load(html, { decodeEntities: false });
  $("html").attr("data-server-rendered", "true");
  if (options.dataLoadFailed) $("html").attr("data-public-data", "fallback");
  applyCommonContent($, page, data);
  if (page === "home") {
    applyManagedPage($, data.homepage);
    renderSelectedCases($, data);
  }
  if (page === "implant") applyManagedPage($, data.pages.implant);
  if (page === "fullArch") applyManagedPage($, data.pages.fullArch);
  if (page === "about") applyManagedPage($, data.pages.about);
  if (page === "cases") renderCasesPage($, data.publishedCases || [], options.dataLoadFailed);
  ensureHeroPriority($);
  return $.html();
}

module.exports = { PAGE_TEMPLATES, footerMarkup, headerMarkup, renderPublicPage };
