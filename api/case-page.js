const { isAdmin } = require("../lib/case-auth");
const { getRecordBySlug, publicRecord } = require("../lib/case-store");

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
  return [
    ["Category", item.category],
    ["Restoration Type", item.restorationType],
    ["Material", item.material],
    ["Implant System", item.implantSystem],
    ["Platform", item.platform],
    ["Shade", item.shade]
  ].filter(([, value]) => value).map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("");
}

function textSection(eyebrow, title, value) {
  if (!value) return "";
  return `<section class="section case-detail-section"><div class="wrap case-reading"><p class="eyebrow">${escapeHtml(eyebrow)}</p><h2>${escapeHtml(title)}</h2><div class="case-rich-text"><p>${paragraph(value)}</p></div></div></section>`;
}

function render(record, preview) {
  const item = publicRecord(record, true);
  const cover = item.coverImage;
  const canonical = `https://yzhdentallab.com/cases/${encodeURIComponent(item.slug)}`;
  const isCaseStudy = item.contentType === "case_study";
  const description = (item.summary || `${item.title}, ${item.category} work by YZH Dental Lab.`).slice(0, 160);
  const gallery = item.images.filter((image) => !image.isCover);
  const title = `${item.title} | ${item.category} | YZH Dental Lab`;
  const previewBanner = preview ? `<div class="preview-banner">Private draft preview. This case is not public.</div>` : "";
  const galleryHtml = gallery.length ? `<section class="section section-soft"><div class="wrap"><div class="section-head"><p class="eyebrow">Image Gallery</p><h2>${isCaseStudy ? "Design, production and quality review." : "Completed work and technical views."}</h2></div><div class="case-library-gallery">${gallery.map((image) => `<figure><img src="${escapeHtml(image.url)}" alt="${escapeHtml(image.caption || `${item.title} ${image.imageType}`)}" loading="lazy"><figcaption><span>${escapeHtml(image.imageType)}</span>${image.caption ? escapeHtml(image.caption) : ""}</figcaption></figure>`).join("")}</div></div></section>` : "";
  const detailedSections = isCaseStudy ? [
    textSection("Case Overview", "Technical case overview.", item.caseOverview),
    textSection("Challenge", "What required careful review.", item.challenge),
    textSection("Records Received", "Records available for review.", item.recordsReceived),
    textSection("Technical Review", "Checks completed before production.", item.technicalReview),
    textSection("CAD / Design", "Digital design approach.", item.cadDesign),
    textSection("Provisional", "Provisional stage.", item.provisional),
    textSection("Framework / Ti-base", "Framework and component stage.", item.framework),
    textSection("Final Restoration", "Final restorative stage.", item.finalRestoration),
    textSection("QC", "Quality-control review.", item.qc),
    textSection("Technical Outcome", "Final technical outcome.", item.technicalOutcome)
  ].join("") : textSection("Work Note", "Basic technical information.", item.shortNote);
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title><meta name="description" content="${escapeHtml(description)}"><link rel="canonical" href="${canonical}">
${preview ? '<meta name="robots" content="noindex,nofollow">' : ""}<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<meta property="og:title" content="${escapeHtml(item.title)}"><meta property="og:description" content="${escapeHtml(description)}"><meta property="og:type" content="article"><meta property="og:url" content="${canonical}">${cover ? `<meta property="og:image" content="https://yzhdentallab.com${escapeHtml(cover.url)}">` : ""}
<link rel="stylesheet" href="/assets/site.css"></head><body>${previewBanner}
<header class="site-header"><div class="wrap nav"><a class="brand" href="/"><span class="brand-mark">Y</span><span>YZH Dental Lab</span></a><button class="menu-toggle" type="button" aria-controls="primaryNav" aria-expanded="false">Menu</button><nav class="navlinks" id="primaryNav"><a href="/">Home</a><a href="/implant-restorations">Implant</a><a href="/full-arch-all-on-x">Full Arch</a><a href="/cases">Cases</a><a href="/about">About</a><a href="/submit-case">Contact</a></nav><a class="btn btn-primary nav-cta" href="/submit-case">Send a Trial Case</a></div></header>
<main><section class="case-library-hero"><div class="wrap case-library-hero-grid"><div><p class="eyebrow">${isCaseStudy ? "Featured Case Study" : "Recent Work"} · ${escapeHtml(item.category)}</p><h1>${escapeHtml(item.title)}</h1>${item.summary ? `<p class="lead">${escapeHtml(item.summary)}</p>` : ""}</div>${cover ? `<figure><img src="${escapeHtml(cover.url)}" alt="${escapeHtml(item.title)}"><figcaption>${escapeHtml(cover.caption || "Final restoration")}</figcaption></figure>` : ""}</div></section>
<section class="section"><div class="wrap case-summary-layout"><div><p class="eyebrow">${isCaseStudy ? "Case Summary" : "Work Details"}</p><h2>${isCaseStudy ? "Technical case information." : "Key restorative information."}</h2></div><dl class="case-specs">${metaItems(item)}</dl></div></section>
${detailedSections}
${galleryHtml}
<section class="section trial"><div class="wrap two-col"><div><p class="eyebrow">Technical Case Review</p><h2>Send a Similar Case</h2><p class="copy">Share the available files and restoration requirements. Our technical team will review the records before production.</p></div><div class="cta-panel"><a class="btn btn-primary" href="/submit-case">Send a Similar Case</a><a class="btn btn-green" href="https://wa.me/8613714730109" target="_blank" rel="noreferrer">WhatsApp Technical Team</a></div></div></section></main>
<footer class="site-footer"><div class="wrap footer-grid"><div><h3>YZH Dental Lab</h3><p>Digital dental laboratory in China for implant, full-arch and CAD/CAM restorative workflows.</p></div><div><h3>Services</h3><a href="/implant-restorations">Implant Restorations</a><a href="/full-arch-all-on-x">Full Arch / All-on-X</a><a href="/cases">Case Library</a></div><div><h3>Company</h3><a href="/about">About</a><a href="/submit-case">Submit a Case</a><a href="/privacy-policy">Privacy Policy</a></div><div><h3>Contact</h3><a href="mailto:yzhdentallab@gmail.com">yzhdentallab@gmail.com</a><a href="https://wa.me/8613714730109" target="_blank" rel="noreferrer">WhatsApp: +86 137 1473 0109</a></div></div></footer><script src="/assets/site.js" defer></script></body></html>`;
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.statusCode = 405;
    res.setHeader("Allow", "GET");
    return res.end("Method not allowed");
  }
  try {
    const record = await getRecordBySlug(query(req, "slug"));
    const preview = query(req, "preview") === "1";
    if (!record || (record.status !== "published" && !(preview && isAdmin(req)))) {
      res.statusCode = 404;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.end("<!doctype html><title>Case Not Found | YZH Dental Lab</title><h1>Case not found</h1>");
    }
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    return res.end(render(record, preview));
  } catch (error) {
    console.error("case_page_error", error);
    res.statusCode = 500;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.end("<!doctype html><title>Case Library Unavailable</title><h1>Case library temporarily unavailable</h1>");
  }
};
