const { isAdmin } = require("../lib/case-auth");
const { getRecordBySlug, listRecords, publicRecord } = require("../lib/case-store");
const { DEFAULT_SETTINGS, getConfig, normalizeSettings } = require("../lib/admin-store");
const { canonicalPublicRecords, canonicalSlugFor, isDuplicateCaseSlug, normalizePublicCase } = require("../lib/public-cases");
const { footerMarkup, headerMarkup } = require("../lib/public-page-renderer");

function query(req, key) {
  if (req.query && req.query[key]) return String(req.query[key]);
  return new URL(req.url, "https://yzhdentallab.com").searchParams.get(key) || "";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function paragraph(value) {
  return escapeHtml(value).replace(/\n+/g, "</p><p>");
}

function metaItems(item) {
  const seen = new Set();
  return [
    ["Category", item.category],
    ["Restoration Type", item.restorationType],
    ["Material", item.material],
    ["Implant System", item.implantSystem],
    ["Platform", item.platform],
    ["Shade", String(item.shade || "").toUpperCase()]
  ].filter(([, value]) => {
    const key = String(value || "").trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("");
}

function heroProofItems(item) {
  const values = [
    ["Case Type", item.restorationType || item.category],
    ["Material", item.material],
    ["Implant System", item.implantSystem],
    ["Workflow", item.workflow ? "Documented" : item.cadDesign ? "CAD / Design" : ""]
  ].filter(([, value]) => String(value || "").trim()).slice(0, 4);
  if (!values.length) return "";
  return `<div class="case-proof-strip">${values.map(([label, value]) => `<span><strong>${escapeHtml(label)}</strong>${escapeHtml(value)}</span>`).join("")}</div>`;
}

function galleryLabel(image, index) {
  const caption = String(image.caption || "");
  if (/smile/i.test(caption)) return "Smile View";
  if (/model|detail/i.test(caption)) return "Detail View";
  if (image.imageType === "Final") return "Final Restoration";
  if (image.imageType && image.imageType !== "Other") return image.imageType;
  return ["Detail View", "Smile View", "Additional View"][index] || "Additional View";
}

function textSection(id, eyebrow, title, value) {
  if (!value) return "";
  return `<section class="section case-detail-section" id="case-${escapeHtml(id)}"><div class="wrap case-reading"><p class="eyebrow">${escapeHtml(eyebrow)}</p><h2>${escapeHtml(title)}</h2><div class="case-rich-text"><p>${paragraph(value)}</p></div></div></section>`;
}

function storySection(id, eyebrow, title, value, mediaItems = []) {
  if (!value && !mediaItems.length) return "";
  const media = mediaItems.length ? `<div class="case-stage-media">${mediaItems.map((image) => `<figure>${galleryMedia({ title }, image)}${image.caption ? `<figcaption>${escapeHtml(image.caption)}</figcaption>` : ""}</figure>`).join("")}</div>` : "";
  return `<section class="section case-detail-stage" id="case-${escapeHtml(id)}"><div class="wrap case-stage-grid"><div><p class="eyebrow">${escapeHtml(eyebrow)}</p><h2>${escapeHtml(title)}</h2>${value ? `<div class="case-rich-text"><p>${paragraph(value)}</p></div>` : ""}</div>${media}</div></section>`;
}

function journeyNav(stages) {
  if (!stages.length) return "";
  return `<nav class="case-journey-nav" aria-label="Case sections"><div class="wrap"><p class="eyebrow">Case Story</p><div class="case-journey-links">${stages.map(({ id, label }) => `<a href="#case-${escapeHtml(id)}">${escapeHtml(label)}</a>`).join("")}</div></div></nav>`;
}

function galleryMedia(item, image) {
  const alt = escapeHtml(image.caption || `${item.title} additional view`);
  if (image.mediaType === "video" || String(image.contentType || "").startsWith("video/")) {
    return `<video src="${escapeHtml(image.url)}" controls playsinline preload="metadata" aria-label="${alt}"></video>`;
  }
  return `<a class="case-media-zoom" href="${escapeHtml(image.url)}" target="_blank" rel="noopener" aria-label="Open larger image"><img src="${escapeHtml(image.url)}" alt="${alt}" width="1200" height="900" loading="lazy" decoding="async"></a>`;
}

function relatedCaseCards(current, records) {
  const explicit = new Set(current.relatedCaseIds || []);
  const candidates = canonicalPublicRecords(records)
    .filter((record) => record.id !== current.id && record.status === "published")
    .filter((record) => explicit.size ? explicit.has(record.id) : record.category === current.category)
    .slice(0, 3)
    .map((record) => normalizePublicCase(publicRecord(record)));
  if (!candidates.length) return "";
  return `<section class="section section-soft"><div class="wrap"><div class="section-head"><p class="eyebrow">Related Cases</p><h2>More work in this technical area.</h2><p class="copy">Compare similar restorative challenges, materials and workflows before sending your own case.</p></div><div class="public-case-grid">${candidates.map((item) => `<article class="public-case-card case-portfolio-card"><a href="/cases/${encodeURIComponent(item.slug)}"><div class="case-card-media"><img src="${escapeHtml(item.coverImage?.url || "/assets/real/anterior-crown-model-12.jpg")}" alt="${escapeHtml(item.title)}" width="1200" height="900" loading="lazy" decoding="async"><div class="case-card-hover"><span><strong>Material</strong>${escapeHtml(item.material || "-")}</span><span><strong>Implant</strong>${escapeHtml(item.implantSystem || "-")}</span><em>View Case</em></div></div><div><span class="case-category">${escapeHtml(item.category)}</span><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.technicalSummary || item.shortNote || "View the technical case details.")}</p><span class="text-link">View Case</span></div></a></article>`).join("")}</div></div></section>`;
}

function render(record, preview, settings, allRecords = []) {
  const item = normalizePublicCase(publicRecord(record, true));
  const cover = item.coverImage;
  const canonical = `https://yzhdentallab.com/cases/${encodeURIComponent(item.slug)}`;
  const isCaseStudy = item.contentType === "case_study";
  const description = (item.summary || `${item.title}, ${item.category} work by YZH Dental Lab.`).slice(0, 160);
  const gallery = item.images.filter((image) => !image.isCover);
  const mediaByStage = (stage) => gallery.filter((image) => String(image.imageType || "").toLowerCase() === stage.toLowerCase());
  const title = `${item.title} | ${item.category} | YZH Dental Lab`;
  const previewBanner = preview ? `<div class="preview-banner">Private draft preview. This case is not public.</div>` : "";
  const galleryHtml = gallery.length ? `<section class="section section-soft" id="case-gallery"><div class="wrap"><div class="section-head"><p class="eyebrow">Case Gallery</p><h2>Case Gallery</h2></div><div class="case-library-gallery">${gallery.map((image, index) => `<figure>${galleryMedia(item, image)}<figcaption><span>${escapeHtml(galleryLabel(image, index))}</span>${image.caption ? escapeHtml(image.caption) : ""}</figcaption></figure>`).join("")}</div></div></section>` : "";
  const restorativeDetails = metaItems(item);
  const sections = [
    { id: "overview", label: "Case Story", html: textSection("overview", "Case Overview", "Case Overview", item.caseOverview || item.technicalSummary || item.summary) },
    { id: "restorative-details", label: "Technical Details", html: restorativeDetails ? `<section class="section" id="case-restorative-details"><div class="wrap case-summary-layout"><div><p class="eyebrow">Restorative Details</p><h2>Restoration Technical Details</h2></div><dl class="case-specs">${restorativeDetails}</dl></div></section>` : "" },
    { id: "challenge", label: "Challenge", html: storySection("challenge", "Challenge", "Challenge", item.challenge) },
    { id: "planning", label: "Planning", html: storySection("planning", "Planning", "Planning", item.planning || item.recordsReceived || item.technicalReview, [...mediaByStage("Planning"), ...mediaByStage("Model")]) },
    { id: "design", label: "Design", html: storySection("design", "Design", "Design", item.cadDesign, [...mediaByStage("Design"), ...mediaByStage("CAD")]) },
    { id: "framework", label: "Framework", html: storySection("framework", "Framework", "Framework", item.framework || item.provisional, [...mediaByStage("Framework"), ...mediaByStage("Ti-base"), ...mediaByStage("PMMA")]) },
    { id: "try-in", label: "Clinical Try-in", html: storySection("try-in", "Clinical Try-in", "Clinical Try-in", item.workflow || item.clinicalNotes, mediaByStage("Try-in")) },
    { id: "quality-control", label: "Quality Control", html: storySection("quality-control", "Quality Control", "Quality Control", item.qc, mediaByStage("QC")) },
    { id: "final", label: "Final Restoration", html: storySection("final", "Final Restoration", "Final Restoration", item.finalRestoration || item.technicalOutcome || item.result || item.shortNote, mediaByStage("Final")) },
    { id: "gallery", label: "Case Gallery", html: galleryHtml }
  ].filter((section) => section.html);
  const detailedSections = sections.map((section) => section.html).join("");
  const related = relatedCaseCards(item, allRecords);
  return `<!DOCTYPE html>
<html lang="en" data-server-rendered="true"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title><meta name="description" content="${escapeHtml(description)}"><link rel="canonical" href="${canonical}">
${preview ? '<meta name="robots" content="noindex,nofollow">' : ""}<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<meta property="og:title" content="${escapeHtml(item.title)}"><meta property="og:description" content="${escapeHtml(description)}"><meta property="og:type" content="article"><meta property="og:url" content="${canonical}">${cover ? `<meta property="og:image" content="https://yzhdentallab.com${escapeHtml(cover.url)}">` : ""}
<link rel="preload" as="image" href="${cover ? escapeHtml(cover.url) : ""}" fetchpriority="high"><link rel="stylesheet" href="/assets/site.css?v=case-nav-1"></head><body>${previewBanner}
${headerMarkup("cases", settings)}
<main><section class="case-library-hero"><div class="wrap case-library-hero-grid"><div><p class="eyebrow">${isCaseStudy ? "Featured Case Study" : "Recent Work"} · ${escapeHtml(item.category)}</p><h1>${escapeHtml(item.title)}</h1>${item.summary ? `<p class="lead">${escapeHtml(item.summary)}</p>` : ""}${heroProofItems(item)}</div>${cover ? `<figure><a class="case-media-zoom" href="${escapeHtml(cover.url)}" target="_blank" rel="noopener" aria-label="Open larger image"><img src="${escapeHtml(cover.url)}" alt="${escapeHtml(item.title)}" width="1200" height="900" loading="eager" fetchpriority="high" decoding="async"></a><figcaption>${escapeHtml(cover.caption || "Final restoration")}</figcaption></figure>` : ""}</div></section>
${journeyNav(sections)}
${detailedSections}
${related}
<section class="section trial"><div class="wrap two-col"><div><p class="eyebrow">Technical Case Review</p><h2>Send a Similar Case</h2><p class="copy">Share the available files and restoration requirements. Our technical team will review the records before production.</p></div><div class="cta-panel"><a class="btn btn-primary" href="/submit-case">Send a Similar Case</a><a class="btn btn-green" href="https://wa.me/8613714730109" target="_blank" rel="noreferrer">WhatsApp Technical Team</a></div></div></section></main>
${footerMarkup(settings)}<script src="/assets/site.js?v=case-nav-1" defer></script></body></html>`;
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.statusCode = 405;
    res.setHeader("Allow", "GET");
    return res.end("Method not allowed");
  }
  try {
    const requestedSlug = query(req, "slug");
    if (isDuplicateCaseSlug(requestedSlug)) {
      res.statusCode = 308;
      res.setHeader("Location", `/cases/${encodeURIComponent(canonicalSlugFor(requestedSlug))}`);
      res.setHeader("Cache-Control", "public, max-age=3600");
      return res.end();
    }
    const [record, settingsConfig, records] = await Promise.all([
      getRecordBySlug(requestedSlug),
      getConfig("settings", DEFAULT_SETTINGS),
      listRecords()
    ]);
    const preview = query(req, "preview") === "1";
    if (!record || (record.status !== "published" && !(preview && isAdmin(req)))) {
      res.statusCode = 404;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.end("<!doctype html><title>Case Not Found | YZH Dental Lab</title><h1>Case not found</h1>");
    }
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    return res.end(render(record, preview, normalizeSettings(settingsConfig.published || DEFAULT_SETTINGS), records));
  } catch (error) {
    console.error("case_page_error", error);
    res.statusCode = 500;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.end("<!doctype html><title>Case Library Unavailable</title><h1>Case library temporarily unavailable</h1>");
  }
};

module.exports.renderCasePage = render;
