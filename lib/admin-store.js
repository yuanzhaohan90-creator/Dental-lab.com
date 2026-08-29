const crypto = require("crypto");
const { IMAGE_EXTENSIONS, VIDEO_EXTENSIONS, validateMediaFile } = require("./media-validation");

const CONFIG_PREFIX = "admin/config/";
const MEDIA_RECORD_PREFIX = "admin/media/records/";
const MEDIA_FILE_PREFIX = "admin/media/files/";
const SUBMISSION_STATUS_PREFIX = "admin/submission-status/";
const SUBMISSION_PREFIX = "cases/";
const TRASH_RETENTION_DAYS = 30;
const MEDIA_CATEGORIES = ["Cases", "Homepage", "Implant", "Full-Arch", "Lab", "Products", "Other"];
const MEDIA_EXTENSIONS = new Set([...IMAGE_EXTENSIONS, ...VIDEO_EXTENSIONS]);

function mediaDefault(fallbackPath = "", altText = "", fit = "cover", focalPosition = "center") {
  return {
    mediaId: "",
    mediaType: "image",
    fallbackPath,
    altText,
    posterMediaId: "",
    fit,
    focalPosition,
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
  capabilities: [
    { label: "Implant Restorations", destination: "/implant-restorations" },
    { label: "Full-Arch / All-on-X", destination: "/full-arch-all-on-x" },
    { label: "CAD/CAM Workflow", destination: "/digital-dentistry" },
    { label: "Technical File Review", destination: "/implant-restorations#implant-case-information" },
    { label: "QC Before Shipment", destination: "/implant-restorations#implant-quality-control" }
  ],
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
    media: mediaDefault("", "Technical review, CAD or quality-control proof", "contain"),
    items: [
      { label: "Implant system / platform", destination: "/implant-restorations#implant-case-information" },
      { label: "Scanbody / component matching", destination: "/implant-restorations#implant-case-information" },
      { label: "Restorative space / screw access", destination: "/implant-restorations#implant-quality-control" },
      { label: "Design / material confirmation", destination: "/digital-dentistry" }
    ]
  },
  workflow: {
    eyebrow: "Digital Workflow",
    heading: "From files to final QC.",
    description: "Files, CAD design, production and QC are coordinated through one technical workflow.",
    items: [
      { label: "Files", destination: "/submit-case" },
      { label: "CAD / Design", destination: "/digital-dentistry" },
      { label: "Production", destination: "/about#production" },
      { label: "QC", destination: "/implant-restorations#implant-quality-control" }
    ].map((item) => ({ ...item, media: mediaDefault("", `${item.label} workflow`, "contain") }))
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
      media: mediaDefault("/assets/real/custom-implant-abutments-poster-04.jpg", "Custom implant abutments", "contain"),
      destination: "/implant-restorations#implant-case-information"
    },
    implantBridge: {
      heading: "Screw-Retained / Implant Bridge",
      description: "Screw access, retrievability, component matching and framework support are checked before production.",
      media: mediaDefault("/assets/real/screw-retained-implant-bridge-01.png", "Screw-retained implant bridge"),
      destination: "/implant-restorations#implant-quality-control"
    },
    qc: {
      heading: "Passive Fit / QC",
      description: "Interfaces, model seating, screw access and case details are reviewed before shipment.",
      media: mediaDefault("/assets/real/implant-case-inspection-11.jpg", "Implant restoration quality-control inspection", "contain"),
      destination: "/implant-restorations#implant-quality-control"
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
      media: mediaDefault("/assets/real/full-arch-titanium-framework-10.jpg", "Full arch titanium framework", "contain"),
      destination: "/full-arch/zirconia-titanium-workflow"
    },
    workflow: {
      heading: "Full-Arch Workflow",
      description: "Records, technical review, design approval, final restoration and QC.",
      media: mediaDefault("", "Full arch digital workflow", "contain"),
      destination: "/full-arch/photogrammetry-workflow"
    },
    qc: {
      heading: "Full-Arch QC",
      description: "Interfaces, fit, finish and case details are reviewed before dispatch.",
      media: mediaDefault("/assets/real/full-arch-final-comparison-12.jpg", "Full arch restoration quality-control review", "contain"),
      destination: "/cases/dual-arch-all-on-x"
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
    cad: { heading: "CAD / Design", description: "Digital design review for implant, full-arch and restorative cases.", media: mediaDefault("/assets/real/cad-design-workstation-02.jpg", "CAD workstation for dental case design", "contain") },
    production: { heading: "Production", description: "CAD/CAM production support for approved restorative workflows.", media: mediaDefault("/assets/real/equipment-line-01.jpg", "Dental laboratory production equipment", "contain") },
    finishing: { heading: "Finishing", description: "Restoration finishing is checked against the submitted case request.", media: mediaDefault("/assets/real/full-arch-final-07.jpg", "Dental restoration finishing") },
    qc: { heading: "QC", description: "Fit, contact, occlusion, finish and case details are checked before dispatch.", media: mediaDefault("/assets/real/quality-certificates-04.jpg", "Dental laboratory quality documentation") },
    packing: { heading: "Packing / Shipping", description: "Use a real packing or dispatch photo when available.", media: mediaDefault("", "Dental case packing and shipping") }
  }
};

const DEFAULT_SETTINGS = {
  companyName: "YZH Dental Lab",
  primaryLogoMediaId: "",
  darkLogoMediaId: "",
  faviconMediaId: "",
  publicEmail: "yzhdentallab@gmail.com",
  whatsapp: "+86 137 1473 0109",
  whatsappUrl: "https://wa.me/8613714730109",
  phone: "+86 137 1473 0109",
  linkedinUrl: "https://www.linkedin.com/in/wei-dai-25b911325",
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

function setBlobClientForTests(client) {
  if (process.env.NODE_ENV !== "test") throw new Error("Test Blob client is only available in tests.");
  blobPromise = Promise.resolve(client);
}

function cleanText(value, max = 5000) {
  return String(value || "").trim().slice(0, max);
}

function normalizeDestination(value, fallback = "") {
  const destination = cleanText(value || fallback, 500);
  if (!destination) return "";
  if (/^\/(?!\/)[^\s]*$/.test(destination) || /^https:\/\/[^\s]+$/i.test(destination)) return destination;
  return cleanText(fallback, 500);
}

function isValidLinkedInUrl(value) {
  try {
    const url = new URL(String(value || "").trim());
    const hostname = url.hostname.toLowerCase();
    return url.protocol === "https:"
      && (hostname === "linkedin.com" || hostname === "www.linkedin.com")
      && /^\/(?:company|in)\/[^/?#]+/i.test(url.pathname);
  } catch {
    return false;
  }
}

function cleanBoolean(value, fallback) {
  return typeof value === "boolean" ? value : fallback;
}

function normalizeMedia(input = {}, fallback = mediaDefault()) {
  const fit = input.fit === "contain" || input.fit === "cover" ? input.fit : fallback.fit;
  const focalPositions = new Set(["center", "top", "bottom", "left", "right"]);
  return {
    mediaId: cleanText(input.mediaId || input.imageMediaId || fallback.mediaId, 100),
    mediaType: input.mediaType === "video" ? "video" : (fallback.mediaType === "video" ? "video" : "image"),
    fallbackPath: cleanText(input.fallbackPath || input.imagePath || fallback.fallbackPath, 300),
    altText: cleanText(input.altText || fallback.altText, 240),
    posterMediaId: cleanText(input.posterMediaId || fallback.posterMediaId, 100),
    fit: fit === "contain" ? "contain" : "cover",
    focalPosition: focalPositions.has(input.focalPosition) ? input.focalPosition : (fallback.focalPosition || "center"),
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
    ...(Object.hasOwn(fallback, "destination") ? { destination: normalizeDestination(input.destination, fallback.destination) } : {}),
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

function trashDates(now = new Date()) {
  const deletedAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  return { deletedAt, expiresAt };
}

function setObjectPath(object, path, value) {
  const keys = String(path || "").split(".").filter(Boolean);
  const last = keys.pop();
  if (!last) return;
  const target = keys.reduce((current, key) => current?.[key], object);
  if (target && typeof target === "object") target[last] = value;
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
    capabilities: DEFAULT_HOMEPAGE.capabilities.map((fallback, index) => ({
      label: cleanText(input.capabilities?.[index]?.label || fallback.label, 80),
      destination: normalizeDestination(input.capabilities?.[index]?.destination, fallback.destination)
    })),
    selectedWork: {
      eyebrow: cleanText(selectedWork.eyebrow || DEFAULT_HOMEPAGE.selectedWork.eyebrow, 160),
      heading: cleanText(selectedWork.heading || DEFAULT_HOMEPAGE.selectedWork.heading, 200),
      description: cleanText(selectedWork.description || DEFAULT_HOMEPAGE.selectedWork.description, 500),
      caseIds: [...new Set(Array.isArray(selectedWork.caseIds) ? selectedWork.caseIds.map((id) => cleanText(id, 100)).filter(Boolean) : [])].slice(0, 3)
    },
    technicalProof: {
      ...normalizeContentSection(technicalProof, DEFAULT_HOMEPAGE.technicalProof),
      items: DEFAULT_HOMEPAGE.technicalProof.items.map((fallback, index) => ({
        label: cleanText(technicalProof.items?.[index]?.label || fallback.label, 100),
        destination: normalizeDestination(technicalProof.items?.[index]?.destination, fallback.destination)
      }))
    },
    workflow: {
      eyebrow: cleanText(workflow.eyebrow || DEFAULT_HOMEPAGE.workflow.eyebrow, 160),
      heading: cleanText(workflow.heading || DEFAULT_HOMEPAGE.workflow.heading, 200),
      description: cleanText(workflow.description || DEFAULT_HOMEPAGE.workflow.description, 800),
      items: DEFAULT_HOMEPAGE.workflow.items.map((fallback, index) => ({
        label: cleanText(workflow.items?.[index]?.label || fallback.label, 80),
        destination: normalizeDestination(workflow.items?.[index]?.destination, fallback.destination),
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
    primaryLogoMediaId: cleanText(input.primaryLogoMediaId, 100),
    darkLogoMediaId: cleanText(input.darkLogoMediaId, 100),
    faviconMediaId: cleanText(input.faviconMediaId, 100),
    publicEmail: cleanText(input.publicEmail || DEFAULT_SETTINGS.publicEmail, 200),
    whatsapp: cleanText(input.whatsapp || DEFAULT_SETTINGS.whatsapp, 80),
    whatsappUrl: cleanText(input.whatsappUrl || DEFAULT_SETTINGS.whatsappUrl, 300),
    phone: cleanText(input.phone || DEFAULT_SETTINGS.phone, 80),
    linkedinUrl: isValidLinkedInUrl(input.linkedinUrl) ? cleanText(input.linkedinUrl, 500) : DEFAULT_SETTINGS.linkedinUrl,
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
    playbackContentType: detected.webCompatible ? "video/mp4" : "",
    playbackSize: detected.webCompatible ? file.buffer.length : 0,
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
    playbackContentType: detected.webCompatible ? "video/mp4" : "",
    playbackSize: detected.webCompatible ? Math.max(0, Number(verification.size) || Number(metadata.size) || 0) : 0,
    contentType: detected.contentType,
    originalFilename: cleanText(metadata.originalFilename || pathname.split("/").pop(), 160),
    size: Math.max(0, Number(verification.size) || Number(metadata.size) || 0),
    ...normalized,
    createdAt: now,
    updatedAt: now
  };
  await writePrivateJson(`${MEDIA_RECORD_PREFIX}${id}.json`, record);
  return record;
}

async function listMedia({ trash = false } = {}) {
  const records = await listPrivateJson(MEDIA_RECORD_PREFIX);
  const expired = records.filter((item) => item.trashedAt && new Date(item.trashExpiresAt || 0) <= new Date());
  await Promise.all(expired.map((item) => deleteMedia(item)));
  return records
    .filter((item) => !expired.includes(item) && Boolean(item.trashedAt) === Boolean(trash))
    .sort((a, b) => new Date(trash ? b.trashedAt : b.createdAt) - new Date(trash ? a.trashedAt : a.createdAt));
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
  await deletePrivatePaths([record.pathname, record.originalPathname, record.playbackPathname, record.posterPathname, `${MEDIA_RECORD_PREFIX}${record.id}.json`]);
}

async function assertPublishableMedia(value) {
  const ids = new Set();
  const visit = (current) => {
    if (Array.isArray(current)) return current.forEach(visit);
    if (!current || typeof current !== "object") return;
    if (current.mediaId) ids.add(String(current.mediaId));
    Object.values(current).forEach(visit);
  };
  visit(value);
  for (const id of ids) {
    const record = await getMedia(id);
    if (!record || record.trashedAt) throw Object.assign(new Error("A selected media item is no longer available."), { statusCode: 409 });
    if (String(record.contentType || "").startsWith("video/") && (record.processingStatus !== "ready" || !record.playbackPathname)) {
      throw Object.assign(new Error("A selected video is not ready for web playback. Retry processing or remove it before publishing."), { statusCode: 409 });
    }
  }
}

const MEDIA_CONFIG_SOURCES = [
  { name: "homepage", defaults: DEFAULT_HOMEPAGE, page: "home", pageLabel: "首页", editorUrl: "/admin/home" },
  { name: "page-implant", defaults: DEFAULT_PAGE_CONFIGS.implant, page: "implant", pageLabel: "种植修复", editorUrl: "/admin/implant" },
  { name: "page-fullArch", defaults: DEFAULT_PAGE_CONFIGS.fullArch, page: "fullArch", pageLabel: "全口修复", editorUrl: "/admin/full-arch" },
  { name: "page-about", defaults: DEFAULT_PAGE_CONFIGS.about, page: "about", pageLabel: "关于我们", editorUrl: "/admin/about" },
  { name: "settings", defaults: DEFAULT_SETTINGS, page: "settings", pageLabel: "网站设置", editorUrl: "/admin/settings" }
];

const MEDIA_SECTION_LABELS = {
  hero: "首屏",
  selectedWork: "精选作品",
  technicalProof: "技术证明",
  workflow: "工作流程",
  finalCta: "行动区",
  featuredWork: "精选种植作品",
  customAbutments: "个性化基台",
  implantBridge: "种植桥",
  qc: "质量检查",
  cta: "行动区",
  featuredCase: "精选全口案例",
  restorationOptions: "修复方案",
  framework: "支架 / 钛杆",
  laboratory: "实验室",
  cad: "CAD / 设计",
  production: "生产",
  finishing: "修整",
  packing: "包装 / 发货",
  primaryLogoMediaId: "主 Logo",
  darkLogoMediaId: "深色背景 Logo",
  faviconMediaId: "浏览器图标",
  defaultOgMediaId: "社交分享图片"
};

function mediaUsageLabel(source, variant, path) {
  const parts = path.split(".");
  const section = MEDIA_SECTION_LABELS[parts[0]] || parts[0];
  const indexedSection = ["restorationOptions", "workflow"].includes(parts[0]);
  const index = indexedSection && /^\d+$/.test(parts[1] === "items" ? parts[2] : parts[1] || "")
    ? ` ${Number(parts[1] === "items" ? parts[2] : parts[1]) + 1}`
    : "";
  const stage = variant === "draft" ? "草稿" : variant === "published" ? "已上线" : "上一版本";
  return `${source.pageLabel} → ${section}${index}（${stage}）`;
}

function scanMediaReferences(value, mediaId, source, variant, path = "", usage = []) {
  if (!value || typeof value !== "object") return usage;
  for (const key of ["mediaId", "posterMediaId", "imageMediaId", "primaryLogoMediaId", "darkLogoMediaId", "faviconMediaId", "defaultOgMediaId"]) {
    if (value[key] !== mediaId) continue;
    const fullPath = path ? `${path}.${key}` : key;
    const fallbackAvailable = !["mediaId", "imageMediaId"].includes(key) || Boolean(value.fallbackPath || value.imagePath);
    usage.push({
      id: `${source.name}:${variant}:${fullPath}`,
      label: mediaUsageLabel(source, variant, fullPath),
      editorUrl: `${source.editorUrl}#${encodeURIComponent(fullPath.split(".")[0])}`,
      configName: source.name,
      variant,
      path: fullPath,
      kind: key === "posterMediaId" ? "poster" : "media",
      required: variant === "published" && !fallbackAvailable
    });
  }
  for (const [key, child] of Object.entries(value)) {
    if (child && typeof child === "object") scanMediaReferences(child, mediaId, source, variant, path ? `${path}.${key}` : key, usage);
  }
  return usage;
}

async function mediaUsage(id) {
  const configs = await Promise.all(MEDIA_CONFIG_SOURCES.map((source) => getConfig(source.name, source.defaults)));
  const usage = [];
  MEDIA_CONFIG_SOURCES.forEach((source, index) => {
    for (const variant of ["draft", "published", "previous"]) {
      if (configs[index]?.[variant]) scanMediaReferences(configs[index][variant], id, source, variant, "", usage);
    }
  });
  const mediaRecords = await listPrivateJson(MEDIA_RECORD_PREFIX);
  for (const record of mediaRecords.filter((item) => !item.trashedAt && item.posterMediaId === id)) {
    usage.push({
      id: `media-record:${record.id}:posterMediaId`,
      label: `媒体 → ${record.displayName || record.originalFilename || "视频"}（视频海报）`,
      editorUrl: `/admin/media#media-${encodeURIComponent(record.id)}`,
      configName: "media-record",
      recordId: record.id,
      variant: "record",
      path: "posterMediaId",
      kind: "poster",
      required: false
    });
  }
  return [...new Map(usage.map((item) => [item.id, item])).values()];
}

async function updateMediaReferences({ mediaId, usageIds, replacementId = "", mode }) {
  const currentUsage = await mediaUsage(mediaId);
  const selectedIds = new Set(Array.isArray(usageIds) && usageIds.length ? usageIds : currentUsage.map((item) => item.id));
  const selected = currentUsage.filter((item) => selectedIds.has(item.id));
  if (!selected.length && currentUsage.length) throw Object.assign(new Error("Choose at least one usage location."), { statusCode: 400 });
  if (mode === "remove") {
    const required = selected.filter((item) => item.required);
    if (required.length) throw Object.assign(new Error("A published section requires replacement media."), { statusCode: 409, usedIn: required });
  }
  let replacement = null;
  if (mode === "replace") {
    replacement = await getMedia(replacementId);
    if (!replacement || replacement.trashedAt || replacement.id === mediaId) throw Object.assign(new Error("Choose a different active media item."), { statusCode: 400 });
    if (String(replacement.contentType || "").startsWith("video/") && replacement.processingStatus !== "ready") {
      throw Object.assign(new Error("Replacement video is still processing."), { statusCode: 409 });
    }
    if (selected.some((item) => item.kind === "poster") && String(replacement.contentType || "").startsWith("video/")) {
      throw Object.assign(new Error("A video poster must be replaced with an image."), { statusCode: 400 });
    }
  }
  const grouped = new Map();
  for (const item of selected) {
    if (!grouped.has(item.configName)) grouped.set(item.configName, []);
    grouped.get(item.configName).push(item);
  }
  const operations = [];
  for (const [configName, entries] of grouped) {
    if (configName === "media-record") {
      for (const item of entries) {
        const mediaRecord = await getMedia(item.recordId);
        if (mediaRecord) operations.push({
          apply: () => saveMedia({ ...mediaRecord, posterMediaId: mode === "replace" ? replacement.id : "" }),
          rollback: () => saveMedia(mediaRecord)
        });
      }
      continue;
    }
    const source = MEDIA_CONFIG_SOURCES.find((item) => item.name === configName);
    const config = await getConfig(configName, source.defaults);
    const original = structuredClone(config);
    for (const item of entries) {
      setObjectPath(config[item.variant], item.path, mode === "replace" ? replacement.id : "");
      if (item.kind === "media") {
        const mediaTypePath = item.path.replace(/(?:mediaId|imageMediaId)$/, "mediaType");
        setObjectPath(config[item.variant], mediaTypePath, mode === "replace" && String(replacement.contentType || "").startsWith("video/") ? "video" : "image");
      }
    }
    operations.push({
      apply: () => writePrivateJson(`${CONFIG_PREFIX}${configName}.json`, config),
      rollback: () => writePrivateJson(`${CONFIG_PREFIX}${configName}.json`, original)
    });
  }
  const applied = [];
  try {
    for (const operation of operations) {
      await operation.apply();
      applied.push(operation);
    }
  } catch (error) {
    await Promise.allSettled(applied.reverse().map((operation) => operation.rollback()));
    throw error;
  }
  return selected;
}

async function trashMedia(record, originalUsage = []) {
  const dates = trashDates();
  return saveMedia({ ...record, trashedAt: dates.deletedAt, trashExpiresAt: dates.expiresAt, originalLocation: record.category || "Other", originalUsage: originalUsage.map((item) => item.label).filter(Boolean).slice(0, 30) });
}

async function restoreMedia(record) {
  const next = { ...record };
  delete next.trashedAt;
  delete next.trashExpiresAt;
  delete next.originalLocation;
  delete next.originalUsage;
  return saveMedia(next);
}

function validCaseId(caseId) {
  return /^YZH-\d{12}-[A-F0-9]{6}$/.test(String(caseId || ""));
}

async function listSubmissions() {
  const submissions = await listPrivateJson(SUBMISSION_PREFIX);
  const metadata = submissions.filter((item) => validCaseId(item.caseId));
  const statuses = await listPrivateJson(SUBMISSION_STATUS_PREFIX);
  const expired = statuses.filter((item) => item.status === "Trash" && new Date(item.trashExpiresAt || 0) <= new Date());
  await Promise.all(expired.map((item) => permanentlyDeleteSubmission(item.caseId)));
  const statusMap = new Map(statuses.map((item) => [item.caseId, item.status]));
  const statusRecordMap = new Map(statuses.map((item) => [item.caseId, item]));
  return metadata
    .filter((item) => !expired.some((expiredItem) => expiredItem.caseId === item.caseId))
    .map((item) => ({ ...item, ...statusRecordMap.get(item.caseId), status: statusMap.get(item.caseId) || "New" }))
    .sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
}

async function getSubmission(caseId) {
  if (!validCaseId(caseId)) return null;
  const item = await readPrivateJson(`${SUBMISSION_PREFIX}${caseId}/submission.json`);
  if (!item) return null;
  const status = await readPrivateJson(`${SUBMISSION_STATUS_PREFIX}${caseId}.json`);
  return { ...item, ...(status || {}), status: status?.status || "New" };
}

async function saveSubmissionStatus(caseId, status) {
  if (!validCaseId(caseId)) throw Object.assign(new Error("Submission not found."), { statusCode: 404 });
  if (!["New", "Reviewed", "Archived"].includes(status)) throw Object.assign(new Error("Invalid submission status."), { statusCode: 400 });
  const value = { caseId, status, updatedAt: new Date().toISOString() };
  return writePrivateJson(`${SUBMISSION_STATUS_PREFIX}${caseId}.json`, value);
}

async function trashSubmission(caseId) {
  const submission = await getSubmission(caseId);
  if (!submission) throw Object.assign(new Error("Submission not found."), { statusCode: 404 });
  const dates = trashDates();
  const value = {
    caseId,
    status: "Trash",
    previousStatus: submission.status === "Trash" ? (submission.previousStatus || "Archived") : submission.status,
    trashedAt: dates.deletedAt,
    trashExpiresAt: dates.expiresAt,
    updatedAt: dates.deletedAt
  };
  await writePrivateJson(`${SUBMISSION_STATUS_PREFIX}${caseId}.json`, value);
  return { ...submission, ...value };
}

async function restoreSubmission(caseId) {
  const submission = await getSubmission(caseId);
  if (!submission || submission.status !== "Trash") throw Object.assign(new Error("Submission is not in Trash."), { statusCode: 400 });
  return saveSubmissionStatus(caseId, ["New", "Reviewed", "Archived"].includes(submission.previousStatus) ? submission.previousStatus : "Archived");
}

async function deleteSubmissionFiles(caseId) {
  const submission = await getSubmission(caseId);
  if (!submission) throw Object.assign(new Error("Submission not found."), { statusCode: 404 });
  const files = Array.isArray(submission.files) ? submission.files : [];
  const paths = files.map((file) => file.pathname).filter((pathname) => String(pathname || "").startsWith(`${SUBMISSION_PREFIX}${caseId}/`));
  await deletePrivatePaths(paths);
  const next = {
    ...submission,
    files: [],
    filesDeletedAt: new Date().toISOString(),
    deletedFileSummary: { count: files.length, totalSize: files.reduce((sum, file) => sum + (Number(file.size) || 0), 0) }
  };
  delete next.status;
  delete next.previousStatus;
  delete next.trashedAt;
  delete next.trashExpiresAt;
  await writePrivateJson(`${SUBMISSION_PREFIX}${caseId}/submission.json`, next);
  return getSubmission(caseId);
}

async function permanentlyDeleteSubmission(caseId) {
  const submission = await getSubmission(caseId);
  if (!submission) return false;
  const files = Array.isArray(submission.files) ? submission.files : [];
  const paths = files.map((file) => file.pathname).filter((pathname) => String(pathname || "").startsWith(`${SUBMISSION_PREFIX}${caseId}/`));
  await deletePrivatePaths([...paths, `${SUBMISSION_PREFIX}${caseId}/submission.json`, `${SUBMISSION_STATUS_PREFIX}${caseId}.json`]);
  return true;
}

module.exports = {
  _setBlobClientForTests: setBlobClientForTests,
  DEFAULT_HOMEPAGE,
  DEFAULT_PAGE_CONFIGS,
  DEFAULT_SETTINGS,
  MEDIA_CATEGORIES,
  assertPublishableMedia,
  isValidLinkedInUrl,
  deleteSubmissionFiles,
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
  permanentlyDeleteSubmission,
  readPrivateJson,
  restoreConfig,
  restoreMedia,
  restoreSubmission,
  saveConfigDraft,
  saveMedia,
  saveSubmissionStatus,
  storeClientMedia,
  storeMediaFile,
  trashMedia,
  trashSubmission,
  updateMediaReferences
};
