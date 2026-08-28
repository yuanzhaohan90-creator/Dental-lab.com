const crypto = require("crypto");
const { IMAGE_EXTENSIONS, VIDEO_EXTENSIONS, validateMediaFile } = require("./media-validation");

const CONFIG_PREFIX = "admin/config/";
const MEDIA_RECORD_PREFIX = "admin/media/records/";
const MEDIA_FILE_PREFIX = "admin/media/files/";
const SUBMISSION_STATUS_PREFIX = "admin/submission-status/";
const SUBMISSION_PREFIX = "cases/";
const MEDIA_CATEGORIES = ["Cases", "Homepage", "Implant", "Full-Arch", "Lab", "Products", "Other"];
const MEDIA_EXTENSIONS = new Set([...IMAGE_EXTENSIONS, ...VIDEO_EXTENSIONS]);

function mediaDefault(fallbackPath = "", altText = "") {
  return {
    mediaId: "",
    mediaType: "image",
    fallbackPath,
    altText,
    posterMediaId: "",
    autoplay: true,
    muted: true,
    loop: true
  };
}

const DEFAULT_HOMEPAGE = {
  hero: {
    eyebrow: "Digital dental lab in China for overseas partners",
    heading: "Complex Implant Cases. Solved.",
    description: "Implant restorations, full-arch and CAD/CAM support for overseas dental laboratories and clinics.",
    media: mediaDefault("/assets/real/hero-full-arch-premium-01.jpg", "Full arch implant restoration by YZH Dental Lab"),
    primaryLabel: "Send a Trial Case",
    primaryDestination: "/submit-case",
    secondaryLabel: "WhatsApp Technical Team",
    secondaryDestination: "https://wa.me/8613714730109"
  },
  selectedWork: {
    eyebrow: "Selected Complex Implant & Full-Arch Work",
    heading: "Three areas where technical review matters most.",
    description: "Large implant and full-arch cases need clear records, component matching and design decisions before production starts.",
    caseIds: []
  },
  technicalProof: {
    eyebrow: "Technical Review",
    heading: "Complex Cases Need More Than Manufacturing",
    description: "Before production, the case should be checked for the details that most often create remakes or delays.",
    media: mediaDefault("", "Technical review, CAD or quality-control proof")
  },
  workflow: {
    eyebrow: "Digital Workflow",
    heading: "From files to final QC.",
    description: "Files, CAD design, production and QC are coordinated through one technical workflow.",
    items: ["Files", "CAD / Design", "Production", "QC"].map((label) => ({ label, media: mediaDefault("", `${label} workflow`) }))
  },
  finalCta: {
    eyebrow: "Start With One Trial Case",
    heading: "You do not need to move your full workload at once.",
    description: "Send one implant, full-arch or restorative case first. Our technical team will review the files before production.",
    primaryLabel: "Send a Trial Case",
    primaryDestination: "/submit-case",
    media: mediaDefault("", "Trial case technical review")
  }
};

const DEFAULT_PAGE_CONFIGS = {
  implant: {
    hero: {
      eyebrow: "Implant Technical Outsourcing",
      heading: "Implant Restorations for Complex Digital Workflows",
      description: "We support custom abutments, screw-retained restorations, implant bridges and technical case review for overseas dental laboratories and implant-focused clinics.",
      primaryLabel: "Send an Implant Case",
      primaryDestination: "/submit-case",
      media: mediaDefault("/assets/real/screw-retained-implant-bridge-01.png", "Screw-retained implant bridge restoration by YZH Dental Lab")
    },
    featuredWork: { heading: "Featured Implant Work", description: "Choose a published implant case for this position.", caseId: "" },
    customAbutments: {
      heading: "Custom Abutments",
      description: "Emergence profile, gingival support, implant angulation and restorative space are reviewed around the submitted digital records.",
      media: mediaDefault("/assets/real/custom-implant-abutments-poster-04.jpg", "Custom implant abutments")
    },
    implantBridge: {
      heading: "Screw-Retained / Implant Bridge",
      description: "Screw access, retrievability, component matching and framework support are checked before production.",
      media: mediaDefault("/assets/real/screw-retained-implant-bridge-01.png", "Screw-retained implant bridge")
    },
    qc: {
      heading: "Passive Fit / QC",
      description: "Interfaces, model seating, screw access and case details are reviewed before shipment.",
      media: mediaDefault("/assets/real/implant-case-inspection-11.jpg", "Implant restoration quality-control inspection")
    },
    cta: {
      eyebrow: "Trial Case First",
      heading: "Start with one implant case.",
      description: "Send files and technical details. We will confirm what is needed before production.",
      primaryLabel: "Send an Implant Case",
      primaryDestination: "/submit-case",
      media: mediaDefault("", "Implant trial case review")
    }
  },
  fullArch: {
    hero: {
      eyebrow: "Full-Arch Technical Support",
      heading: "Full-Arch & All-on-X Restorations",
      description: "Digital laboratory support for provisional and definitive full-arch restorations, including zirconia, PMMA and titanium-supported workflows.",
      primaryLabel: "Send a Full-Arch Case",
      primaryDestination: "/submit-case",
      media: mediaDefault("/assets/real/full-arch-titanium-framework-10.jpg", "Full arch titanium-supported restoration framework")
    },
    featuredCase: { heading: "Featured Full-Arch Case", description: "Choose a published Featured Case Study.", caseId: "" },
    restorationOptions: [
      { heading: "PMMA Provisional", description: "For immediate-load or staged cases that need a controlled provisional before final production.", caseId: "", media: mediaDefault("/assets/real/full-arch-premium-final-11.jpg", "PMMA provisional full arch restoration") },
      { heading: "Monolithic Zirconia", description: "For definitive full-arch restorations when records, restorative space and material choice are confirmed.", caseId: "", media: mediaDefault("/assets/real/hero-full-arch-premium-02.jpg", "Monolithic zirconia full arch restoration") },
      { heading: "Zirconia + Titanium Bar", description: "For demanding cases that require reinforced support and careful interface review.", caseId: "", media: mediaDefault("/assets/real/full-arch-titanium-framework-10.jpg", "Zirconia restoration on titanium framework") }
    ],
    framework: {
      heading: "Titanium Framework / Bar",
      description: "Show a real titanium bar, framework or manufacturing view.",
      media: mediaDefault("/assets/real/full-arch-titanium-framework-10.jpg", "Full arch titanium framework")
    },
    workflow: {
      heading: "Full-Arch Workflow",
      description: "Records, technical review, design approval, final restoration and QC.",
      media: mediaDefault("", "Full arch digital workflow")
    },
    qc: {
      heading: "Full-Arch QC",
      description: "Interfaces, fit, finish and case details are reviewed before dispatch.",
      media: mediaDefault("/assets/real/full-arch-final-comparison-12.jpg", "Full arch restoration quality-control review")
    },
    cta: {
      eyebrow: "Trial Case First",
      heading: "Send One Full-Arch Case for Review",
      description: "Start with one controlled case and confirm the records before production.",
      primaryLabel: "Send One Full-Arch Case for Review",
      primaryDestination: "/submit-case",
      media: mediaDefault("", "Full arch trial case review")
    }
  },
  about: {
    hero: {
      eyebrow: "About YZH Dental Lab",
      heading: "A Digital Dental Lab Built for Overseas Partners",
      description: "YZH Dental Lab supports overseas laboratories and clinics with implant restorations, full-arch cases and CAD/CAM production from China.",
      primaryLabel: "Start With One Trial Case",
      primaryDestination: "/submit-case",
      media: mediaDefault("/assets/real/cad-design-workstation-02.jpg", "CAD workstation used for digital dental design workflow")
    },
    laboratory: { heading: "Laboratory", description: "Real working areas where cases are received and coordinated.", media: mediaDefault("/assets/real/production-floor-10.jpg", "YZH Dental Lab production floor") },
    cad: { heading: "CAD / Design", description: "Digital design review for implant, full-arch and restorative cases.", media: mediaDefault("/assets/real/cad-design-workstation-02.jpg", "CAD workstation for dental case design") },
    production: { heading: "Production", description: "CAD/CAM production support for approved restorative workflows.", media: mediaDefault("/assets/real/equipment-line-01.jpg", "Dental laboratory production equipment") },
    finishing: { heading: "Finishing", description: "Restoration finishing is checked against the submitted case request.", media: mediaDefault("/assets/real/full-arch-final-07.jpg", "Dental restoration finishing") },
    qc: { heading: "QC", description: "Fit, contact, occlusion, finish and case details are checked before dispatch.", media: mediaDefault("/assets/real/quality-certificates-04.jpg", "Dental laboratory quality documentation") },
    packing: { heading: "Packing / Shipping", description: "Use a real packing or dispatch photo when available.", media: mediaDefault("", "Dental case packing and shipping") }
  }
};

const DEFAULT_SETTINGS = {
  companyName: "YZH Dental Lab",
  publicEmail: "yzhdentallab@gmail.com",
  whatsapp: "+86 137 1473 0109",
  whatsappUrl: "https://wa.me/8613714730109",
  phone: "+86 137 1473 0109",
  location: "China",
  defaultSeoTitle: "YZH Dental Lab | Complex Implant, Full-Arch & CAD/CAM Support",
  defaultSeoDescription: "YZH Dental Lab supports overseas dental laboratories and clinics with complex implant restorations, full-arch cases and CAD/CAM production from China.",
  defaultOgMediaId: "",
  defaultOgImagePath: "/assets/real/hero-full-arch-premium-01.jpg"
};

let blobPromise;
function blob() {
  blobPromise ||= import("@vercel/blob");
  return blobPromise;
}

function cleanText(value, max = 5000) {
  return String(value || "").trim().slice(0, max);
}

function cleanBoolean(value, fallback) {
  return typeof value === "boolean" ? value : fallback;
}

function normalizeMedia(input = {}, fallback = mediaDefault()) {
  return {
    mediaId: cleanText(input.mediaId || input.imageMediaId || fallback.mediaId, 100),
    mediaType: input.mediaType === "video" ? "video" : (fallback.mediaType === "video" ? "video" : "image"),
    fallbackPath: cleanText(input.fallbackPath || input.imagePath || fallback.fallbackPath, 300),
    altText: cleanText(input.altText || fallback.altText, 240),
    posterMediaId: cleanText(input.posterMediaId || fallback.posterMediaId, 100),
    autoplay: cleanBoolean(input.autoplay, fallback.autoplay),
    muted: true,
    loop: cleanBoolean(input.loop, fallback.loop)
  };
}

function normalizeContentSection(input = {}, fallback) {
  return {
    eyebrow: cleanText(input.eyebrow || fallback.eyebrow, 160),
    heading: cleanText(input.heading || fallback.heading, 200),
    description: cleanText(input.description || fallback.description, 800),
    ...(Object.hasOwn(fallback, "primaryLabel") ? {
      primaryLabel: cleanText(input.primaryLabel || fallback.primaryLabel, 80),
      primaryDestination: cleanText(input.primaryDestination || fallback.primaryDestination, 300)
    } : {}),
    media: normalizeMedia(input.media || input, fallback.media)
  };
}

function normalizeCaseSection(input = {}, fallback) {
  return {
    heading: cleanText(input.heading || fallback.heading, 200),
    description: cleanText(input.description || fallback.description, 800),
    caseId: cleanText(input.caseId, 100)
  };
}

function normalizeMediaSection(input = {}, fallback) {
  return {
    heading: cleanText(input.heading || fallback.heading, 200),
    description: cleanText(input.description || fallback.description, 800),
    ...(Object.hasOwn(fallback, "caseId") ? { caseId: cleanText(input.caseId, 100) } : {}),
    media: normalizeMedia(input.media || input, fallback.media)
  };
}

function makeAdminId(prefix) {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
}

async function streamText(stream) {
  return new Response(stream).text();
}

async function readPrivateJson(pathname) {
  const { get } = await blob();
  const result = await get(pathname, { access: "private", useCache: false });
  if (!result || result.statusCode !== 200 || !result.stream) return null;
  return JSON.parse(await streamText(result.stream));
}

async function writePrivateJson(pathname, value) {
  const { put } = await blob();
  await put(pathname, JSON.stringify(value, null, 2), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
    cacheControlMaxAge: 0
  });
  return value;
}

async function listPrivateJson(prefix) {
  const { list } = await blob();
  const records = [];
  let cursor;
  do {
    const result = await list({ prefix, limit: 100, cursor });
    const batch = await Promise.all(result.blobs.filter((item) => item.pathname.endsWith(".json")).map((item) => readPrivateJson(item.pathname)));
    records.push(...batch.filter(Boolean));
    cursor = result.hasMore ? result.cursor : undefined;
  } while (cursor);
  return records;
}

async function deletePrivatePaths(paths) {
  const clean = [...new Set(paths.filter(Boolean))];
  if (!clean.length) return;
  const { del } = await blob();
  await del(clean);
}

function normalizeHomepage(input = {}) {
  const hero = input.hero || {};
  const selectedWork = input.selectedWork || {};
  const technicalProof = input.technicalProof || {};
  const workflow = input.workflow || {};
  const finalCta = input.finalCta || {};
  return {
    hero: {
      eyebrow: cleanText(hero.eyebrow || DEFAULT_HOMEPAGE.hero.eyebrow, 160),
      heading: cleanText(hero.heading || DEFAULT_HOMEPAGE.hero.heading, 160),
      description: cleanText(hero.description || DEFAULT_HOMEPAGE.hero.description, 500),
      media: normalizeMedia(hero.media || hero, DEFAULT_HOMEPAGE.hero.media),
      primaryLabel: cleanText(hero.primaryLabel || DEFAULT_HOMEPAGE.hero.primaryLabel, 80),
      primaryDestination: cleanText(hero.primaryDestination || DEFAULT_HOMEPAGE.hero.primaryDestination, 300),
      secondaryLabel: cleanText(hero.secondaryLabel || DEFAULT_HOMEPAGE.hero.secondaryLabel, 80),
      secondaryDestination: cleanText(hero.secondaryDestination || DEFAULT_HOMEPAGE.hero.secondaryDestination, 300)
    },
    selectedWork: {
      eyebrow: cleanText(selectedWork.eyebrow || DEFAULT_HOMEPAGE.selectedWork.eyebrow, 160),
      heading: cleanText(selectedWork.heading || DEFAULT_HOMEPAGE.selectedWork.heading, 200),
      description: cleanText(selectedWork.description || DEFAULT_HOMEPAGE.selectedWork.description, 500),
      caseIds: [...new Set(Array.isArray(selectedWork.caseIds) ? selectedWork.caseIds.map((id) => cleanText(id, 100)).filter(Boolean) : [])].slice(0, 3)
    },
    technicalProof: normalizeContentSection(technicalProof, DEFAULT_HOMEPAGE.technicalProof),
    workflow: {
      eyebrow: cleanText(workflow.eyebrow || DEFAULT_HOMEPAGE.workflow.eyebrow, 160),
      heading: cleanText(workflow.heading || DEFAULT_HOMEPAGE.workflow.heading, 200),
      description: cleanText(workflow.description || DEFAULT_HOMEPAGE.workflow.description, 800),
      items: DEFAULT_HOMEPAGE.workflow.items.map((fallback, index) => ({
        label: cleanText(workflow.items?.[index]?.label || fallback.label, 80),
        media: normalizeMedia(workflow.items?.[index]?.media || {}, fallback.media)
      }))
    },
    finalCta: normalizeContentSection(finalCta, DEFAULT_HOMEPAGE.finalCta)
  };
}

function normalizePageConfig(page, input = {}) {
  const defaults = DEFAULT_PAGE_CONFIGS[page];
  if (!defaults) throw Object.assign(new Error("Page editor not found."), { statusCode: 404 });
  if (page === "implant") {
    return {
      hero: normalizeContentSection(input.hero || {}, defaults.hero),
      featuredWork: normalizeCaseSection(input.featuredWork || {}, defaults.featuredWork),
      customAbutments: normalizeMediaSection(input.customAbutments || {}, defaults.customAbutments),
      implantBridge: normalizeMediaSection(input.implantBridge || {}, defaults.implantBridge),
      qc: normalizeMediaSection(input.qc || {}, defaults.qc),
      cta: normalizeContentSection(input.cta || {}, defaults.cta)
    };
  }
  if (page === "fullArch") {
    return {
      hero: normalizeContentSection(input.hero || {}, defaults.hero),
      featuredCase: normalizeCaseSection(input.featuredCase || {}, defaults.featuredCase),
      restorationOptions: defaults.restorationOptions.map((fallback, index) => normalizeMediaSection(input.restorationOptions?.[index] || {}, fallback)),
      framework: normalizeMediaSection(input.framework || {}, defaults.framework),
      workflow: normalizeMediaSection(input.workflow || {}, defaults.workflow),
      qc: normalizeMediaSection(input.qc || {}, defaults.qc),
      cta: normalizeContentSection(input.cta || {}, defaults.cta)
    };
  }
  return {
    hero: normalizeContentSection(input.hero || {}, defaults.hero),
    laboratory: normalizeMediaSection(input.laboratory || {}, defaults.laboratory),
    cad: normalizeMediaSection(input.cad || {}, defaults.cad),
    production: normalizeMediaSection(input.production || {}, defaults.production),
    finishing: normalizeMediaSection(input.finishing || {}, defaults.finishing),
    qc: normalizeMediaSection(input.qc || {}, defaults.qc),
    packing: normalizeMediaSection(input.packing || {}, defaults.packing)
  };
}

function normalizeSettings(input = {}) {
  return {
    companyName: cleanText(input.companyName || DEFAULT_SETTINGS.companyName, 120),
    publicEmail: cleanText(input.publicEmail || DEFAULT_SETTINGS.publicEmail, 200),
    whatsapp: cleanText(input.whatsapp || DEFAULT_SETTINGS.whatsapp, 80),
    whatsappUrl: cleanText(input.whatsappUrl || DEFAULT_SETTINGS.whatsappUrl, 300),
    phone: cleanText(input.phone || DEFAULT_SETTINGS.phone, 80),
    location: cleanText(input.location || DEFAULT_SETTINGS.location, 160),
    defaultSeoTitle: cleanText(input.defaultSeoTitle || DEFAULT_SETTINGS.defaultSeoTitle, 180),
    defaultSeoDescription: cleanText(input.defaultSeoDescription || DEFAULT_SETTINGS.defaultSeoDescription, 320),
    defaultOgMediaId: cleanText(input.defaultOgMediaId, 100),
    defaultOgImagePath: cleanText(input.defaultOgImagePath || DEFAULT_SETTINGS.defaultOgImagePath, 300)
  };
}

async function getConfig(name, defaults) {
  const stored = await readPrivateJson(`${CONFIG_PREFIX}${name}.json`);
  if (!stored) return { draft: structuredClone(defaults), published: structuredClone(defaults), previous: null, updatedAt: null, publishedAt: null };
  return stored;
}

async function saveConfigDraft(name, defaults, value, normalize) {
  const current = await getConfig(name, defaults);
  const now = new Date().toISOString();
  return writePrivateJson(`${CONFIG_PREFIX}${name}.json`, { ...current, draft: normalize(value), updatedAt: now });
}

async function publishConfig(name, defaults, normalize) {
  const current = await getConfig(name, defaults);
  const now = new Date().toISOString();
  return writePrivateJson(`${CONFIG_PREFIX}${name}.json`, {
    draft: normalize(current.draft),
    published: normalize(current.draft),
    previous: normalize(current.published),
    updatedAt: now,
    publishedAt: now
  });
}

async function restoreConfig(name, defaults, normalize) {
  const current = await getConfig(name, defaults);
  if (!current.previous) throw Object.assign(new Error("No previous published version is available."), { statusCode: 400 });
  const now = new Date().toISOString();
  return writePrivateJson(`${CONFIG_PREFIX}${name}.json`, {
    draft: normalize(current.previous),
    published: normalize(current.previous),
    previous: normalize(current.published),
    updatedAt: now,
    publishedAt: now
  });
}

function normalizeMediaRecord(input = {}) {
  return {
    displayName: cleanText(input.displayName, 160),
    altText: cleanText(input.altText, 240),
    category: MEDIA_CATEGORIES.includes(input.category) ? input.category : "Other",
    posterMediaId: cleanText(input.posterMediaId, 100),
    format: cleanText(input.format, 20).toUpperCase(),
    codec: cleanText(input.codec, 40).toLowerCase(),
    duration: Math.max(0, Number(input.duration) || 0),
    width: Math.max(0, Math.round(Number(input.width) || 0)),
    height: Math.max(0, Math.round(Number(input.height) || 0)),
    processingStatus: ["uploading", "processing", "ready", "failed"].includes(input.processingStatus) ? input.processingStatus : "ready",
    processingMessage: cleanText(input.processingMessage, 300)
  };
}

function mediaExtension(filename) {
  const match = /\.([^.]+)$/.exec(filename || "");
  return match ? match[1].toLowerCase() : "";
}

async function storeMediaFile(file, metadata) {
  const detected = validateMediaFile({ filename: file.filename, contentType: file.contentType, size: file.buffer.length, bytes: file.buffer.subarray(0, 1024 * 1024), codecHint: metadata.codec });
  const ext = detected.extension;
  const id = makeAdminId("MEDIA");
  const pathname = `${MEDIA_FILE_PREFIX}${id}.${ext}`;
  const now = new Date().toISOString();
  const processingStatus = detected.mediaType === "video" && !detected.webCompatible ? "processing" : "ready";
  const normalized = normalizeMediaRecord({ ...metadata, ...detected, processingStatus, processingMessage: processingStatus === "processing" ? "Original saved. Web playback version is waiting for video processing." : "" });
  const { put } = await blob();
  await put(pathname, file.buffer, {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: false,
    contentType: detected.contentType,
    cacheControlMaxAge: 31536000
  });
  const record = {
    id,
    pathname,
    originalPathname: pathname,
    playbackPathname: detected.webCompatible ? pathname : "",
    contentType: detected.contentType,
    originalFilename: cleanText(file.filename, 160),
    size: file.buffer.length,
    ...normalized,
    createdAt: now,
    updatedAt: now
  };
  await writePrivateJson(`${MEDIA_RECORD_PREFIX}${id}.json`, record);
  return record;
}

async function storeClientMedia(blobResult, metadata = {}, verification = {}) {
  const pathname = cleanText(blobResult?.pathname, 500);
  const contentType = cleanText(verification.contentType || blobResult?.contentType, 100).toLowerCase();
  const ext = mediaExtension(pathname);
  if (!pathname.startsWith(MEDIA_FILE_PREFIX) || !MEDIA_EXTENSIONS.has(ext)) throw Object.assign(new Error("Unable to read this media file."), { statusCode: 400 });
  const detected = validateMediaFile({ filename: metadata.originalFilename || pathname, contentType, size: verification.size || metadata.size, bytes: verification.bytes, codecHint: metadata.codec });
  const id = makeAdminId("MEDIA");
  const now = new Date().toISOString();
  const processingStatus = detected.mediaType === "video" && !detected.webCompatible ? "processing" : "ready";
  const normalized = normalizeMediaRecord({ ...metadata, ...detected, processingStatus, processingMessage: processingStatus === "processing" ? "Original saved. Web playback version is waiting for video processing." : "" });
  const record = {
    id,
    pathname,
    originalPathname: pathname,
    playbackPathname: detected.webCompatible ? pathname : "",
    contentType: detected.contentType,
    originalFilename: cleanText(metadata.originalFilename || pathname.split("/").pop(), 160),
    size: Math.max(0, Number(metadata.size) || 0),
    ...normalized,
    createdAt: now,
    updatedAt: now
  };
  await writePrivateJson(`${MEDIA_RECORD_PREFIX}${id}.json`, record);
  return record;
}

async function listMedia() {
  const records = await listPrivateJson(MEDIA_RECORD_PREFIX);
  return records.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

async function getMedia(id) {
  if (!/^MEDIA-[A-Z0-9-]+$/.test(String(id || ""))) return null;
  return readPrivateJson(`${MEDIA_RECORD_PREFIX}${id}.json`);
}

async function saveMedia(record) {
  const normalized = normalizeMediaRecord(record);
  const next = { ...record, ...normalized, updatedAt: new Date().toISOString() };
  await writePrivateJson(`${MEDIA_RECORD_PREFIX}${record.id}.json`, next);
  return next;
}

async function deleteMedia(record) {
  await deletePrivatePaths([record.pathname, record.originalPathname, record.playbackPathname, `${MEDIA_RECORD_PREFIX}${record.id}.json`]);
}

async function mediaUsage(id) {
  const [homepage, implant, fullArch, about, settings] = await Promise.all([
    getConfig("homepage", DEFAULT_HOMEPAGE),
    getConfig("page-implant", DEFAULT_PAGE_CONFIGS.implant),
    getConfig("page-fullArch", DEFAULT_PAGE_CONFIGS.fullArch),
    getConfig("page-about", DEFAULT_PAGE_CONFIGS.about),
    getConfig("settings", DEFAULT_SETTINGS)
  ]);
  const usage = [];
  function scan(value, label, path = "") {
    if (!value || typeof value !== "object") return;
    if (value.mediaId === id || value.posterMediaId === id || value.imageMediaId === id) usage.push(`${label}${path ? ` · ${path}` : ""}`);
    for (const [key, child] of Object.entries(value)) {
      if (child && typeof child === "object") scan(child, label, path ? `${path} / ${key}` : key);
    }
  }
  scan(homepage.draft, "Home draft");
  scan(homepage.published, "Home live");
  scan(implant.draft, "Implant draft");
  scan(implant.published, "Implant live");
  scan(fullArch.draft, "Full-Arch draft");
  scan(fullArch.published, "Full-Arch live");
  scan(about.draft, "About draft");
  scan(about.published, "About live");
  if (settings.draft?.defaultOgMediaId === id) usage.push("Settings draft · Social image");
  if (settings.published?.defaultOgMediaId === id) usage.push("Settings live · Social image");
  return [...new Set(usage)];
}

function validCaseId(caseId) {
  return /^YZH-\d{12}-[A-F0-9]{6}$/.test(String(caseId || ""));
}

async function listSubmissions() {
  const submissions = await listPrivateJson(SUBMISSION_PREFIX);
  const metadata = submissions.filter((item) => validCaseId(item.caseId));
  const statuses = await listPrivateJson(SUBMISSION_STATUS_PREFIX);
  const statusMap = new Map(statuses.map((item) => [item.caseId, item.status]));
  return metadata.map((item) => ({ ...item, status: statusMap.get(item.caseId) || "New" })).sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
}

async function getSubmission(caseId) {
  if (!validCaseId(caseId)) return null;
  const item = await readPrivateJson(`${SUBMISSION_PREFIX}${caseId}/submission.json`);
  if (!item) return null;
  const status = await readPrivateJson(`${SUBMISSION_STATUS_PREFIX}${caseId}.json`);
  return { ...item, status: status?.status || "New" };
}

async function saveSubmissionStatus(caseId, status) {
  if (!validCaseId(caseId)) throw Object.assign(new Error("Submission not found."), { statusCode: 404 });
  if (!["New", "Reviewed", "Archived"].includes(status)) throw Object.assign(new Error("Invalid submission status."), { statusCode: 400 });
  const value = { caseId, status, updatedAt: new Date().toISOString() };
  return writePrivateJson(`${SUBMISSION_STATUS_PREFIX}${caseId}.json`, value);
}

module.exports = {
  DEFAULT_HOMEPAGE,
  DEFAULT_PAGE_CONFIGS,
  DEFAULT_SETTINGS,
  MEDIA_CATEGORIES,
  deleteMedia,
  getConfig,
  getMedia,
  getSubmission,
  listMedia,
  listSubmissions,
  mediaUsage,
  normalizeHomepage,
  normalizePageConfig,
  normalizeSettings,
  publishConfig,
  readPrivateJson,
  restoreConfig,
  saveConfigDraft,
  saveMedia,
  saveSubmissionStatus,
  storeClientMedia,
  storeMediaFile
};
