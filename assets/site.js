const menuButton = document.querySelector(".menu-toggle");
const nav = document.getElementById("primaryNav");
if (menuButton && nav) {
  menuButton.addEventListener("click", () => {
    const open = nav.classList.toggle("open");
    menuButton.setAttribute("aria-expanded", open ? "true" : "false");
  });
}

function applyText(selector, value) {
  const element = document.querySelector(selector);
  if (element && value) element.textContent = value;
}

function applyHref(selector, value, label) {
  const element = document.querySelector(selector);
  if (!element || !value) return;
  element.href = value;
  if (label) element.textContent = label;
}

function setMeta(selector, value) {
  const element = document.querySelector(selector);
  if (element && value) element.setAttribute("content", value);
}

function makeCaseCard(item, index) {
  const cover = item.coverImage?.url || "/assets/real/full-arch-titanium-framework-10.jpg";
  const lines = [item.material, item.implantSystem, item.restorationType].filter(Boolean).slice(0, 2).join(" · ");
  const url = item.contentType === "case_study" ? `/cases/${encodeURIComponent(item.slug)}` : "/cases";
  return `<article class="priority-case ${index === 0 ? "large" : ""}">
    <img src="${cover}" alt="${escapeAttr(item.coverImage?.caption || item.title)}">
    <div>
      <p class="case-category">${escapeHtml(item.category)}</p>
      <h3>${escapeHtml(item.title)}</h3>
      <p>${escapeHtml(lines || item.shortNote || item.summary || "Completed dental work with technical review before production.")}</p>
      <a class="text-link" href="${url}">${item.contentType === "case_study" ? "View Case Study" : "View Recent Work"}</a>
    </div>
  </article>`;
}

function escapeHtml(value) {
  const element = document.createElement("div");
  element.textContent = value || "";
  return element.innerHTML;
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/"/g, "&quot;");
}

function showPreviewBanner(kind) {
  const banner = document.createElement("div");
  banner.className = "admin-preview-banner";
  banner.textContent = `Admin preview: ${kind}`;
  document.body.prepend(banner);
}

async function loadPublicSiteData() {
  const params = new URLSearchParams(window.location.search);
  const preview = params.get("adminPreview");
  if (preview === "homepage") {
    const response = await fetch("/api/admin-homepage", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || "Homepage preview unavailable.");
    const draft = structuredClone(data.config.draft);
    if (draft.hero.imageMediaId) draft.hero.imageUrl = `/api/admin?module=media-image&id=${encodeURIComponent(draft.hero.imageMediaId)}`;
    return { homepage: draft, settings: null, selectedCases: data.publishedCases.filter((item) => draft.selectedWork.caseIds.includes(item.id)).sort((a, b) => draft.selectedWork.caseIds.indexOf(a.id) - draft.selectedWork.caseIds.indexOf(b.id)), preview: "homepage" };
  }
  if (preview === "settings") {
    const [siteResponse, settingsResponse] = await Promise.all([fetch("/api/admin?module=public-site", { cache: "no-store" }), fetch("/api/admin?module=settings", { cache: "no-store" })]);
    const siteData = await siteResponse.json();
    const settingsData = await settingsResponse.json();
    if (!siteResponse.ok || !siteData.ok) throw new Error(siteData.error || "Site content unavailable.");
    if (!settingsResponse.ok || !settingsData.ok) throw new Error(settingsData.error || "Settings preview unavailable.");
    const draftSettings = structuredClone(settingsData.settings.draft);
    if (draftSettings.defaultOgMediaId) draftSettings.defaultOgImageUrl = `/api/admin?module=media-image&id=${encodeURIComponent(draftSettings.defaultOgMediaId)}`;
    return { ...siteData, settings: draftSettings, preview: "settings" };
  }
  const response = await fetch("/api/admin?module=public-site", { cache: "no-store" });
  const data = await response.json();
  if (!response.ok || !data.ok) throw new Error(data.error || "Site content unavailable.");
  return data;
}

async function applyPublicSiteData() {
  if (location.pathname !== "/" && location.pathname !== "") return;
  try {
    const data = await loadPublicSiteData();
    if (data.preview) showPreviewBanner(data.preview);
    const { homepage, settings, selectedCases } = data;
    if (settings) {
      document.title = settings.defaultSeoTitle || document.title;
      setMeta('meta[name="description"]', settings.defaultSeoDescription);
      setMeta('meta[property="og:title"]', settings.defaultSeoTitle);
      setMeta('meta[property="og:description"]', settings.defaultSeoDescription);
      setMeta('meta[property="og:image"]', settings.defaultOgImageUrl || settings.defaultOgImagePath);
      applyText(".site-footer h3", settings.companyName);
      document.querySelectorAll('a[href^="mailto:"]').forEach((link) => { link.href = `mailto:${settings.publicEmail}`; link.textContent = settings.publicEmail; });
      document.querySelectorAll('a[href*="wa.me"]').forEach((link) => { link.href = settings.whatsappUrl; if (link.textContent.includes("WhatsApp")) link.textContent = link.classList.contains("floating") ? "WhatsApp Technical Team" : "WhatsApp Technical Team"; });
    }
    if (homepage) {
      applyText(".hero .eyebrow", homepage.hero.eyebrow);
      applyText(".hero h1", homepage.hero.heading);
      applyText(".hero .lead", homepage.hero.description);
      applyHref(".hero .cta-row .btn-primary", homepage.hero.primaryDestination, homepage.hero.primaryLabel);
      applyHref(".hero .cta-row .btn-green", homepage.hero.secondaryDestination, homepage.hero.secondaryLabel);
      const heroImage = document.querySelector(".hero-visual img");
      if (heroImage && (homepage.hero.imageUrl || homepage.hero.imagePath)) heroImage.src = homepage.hero.imageUrl || homepage.hero.imagePath;
      applyText("#featured-cases .section-head .eyebrow", homepage.selectedWork.eyebrow);
      applyText("#featured-cases .section-head h2", homepage.selectedWork.heading);
      applyText("#featured-cases .section-head .copy", homepage.selectedWork.description);
      const grid = document.querySelector("#featured-cases .priority-case-grid");
      if (grid && selectedCases?.length) grid.innerHTML = selectedCases.slice(0, 3).map(makeCaseCard).join("");
    }
  } catch (error) {
    console.warn("public_site_data_skipped", error);
  }
}

applyPublicSiteData();

const form = document.getElementById("caseForm");
const statusBox = document.getElementById("formStatus");
const allowedExtensions = new Set(["stl", "ply", "zip", "pdf", "jpg", "jpeg", "png"]);
const maxBytes = 25 * 1024 * 1024;

function setStatus(type, html) {
  if (!statusBox) return;
  statusBox.className = `form-status show ${type}`;
  statusBox.innerHTML = html;
}

if (form) {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (form.dataset.submitting === "true") return;

    const submitButton = form.querySelector('button[type="submit"]');
    const originalButtonText = submitButton ? submitButton.textContent : "";
    const fileInput = form.querySelector('input[type="file"]');
    const files = fileInput ? [...fileInput.files] : [];
    const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
    const invalid = files.find((file) => !allowedExtensions.has(file.name.split(".").pop().toLowerCase()));

    if (form.website && form.website.value) {
      setStatus("error", "Submission blocked.");
      return;
    }
    if (invalid) {
      setStatus("error", "Please upload only STL, PLY, ZIP, PDF, JPG or PNG files.");
      return;
    }
    if (totalBytes > maxBytes) {
      setStatus("error", "Files are larger than 25MB. Please send a ZIP link by WhatsApp or email.");
      return;
    }

    form.dataset.submitting = "true";
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = "Uploading...";
    }
    setStatus("", "Uploading...");
    try {
      const response = await fetch(form.action, { method: "POST", body: new FormData(form) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) throw new Error(data.error || "Submission failed");
      setStatus("success", `<strong>Case received.</strong><br>Case ID: <b>${data.caseId}</b><br>Your files were uploaded successfully. Our technical team will review the submission and reply by email or WhatsApp.`);
      form.reset();
    } catch (error) {
      setStatus("error", `<strong>We could not complete the upload.</strong><br>Your files were not submitted. Please try again, or send them by WhatsApp/email.<br>WhatsApp: <a href="https://wa.me/8613714730109" target="_blank" rel="noreferrer">+86 137 1473 0109</a><br>Email: <a href="mailto:yzhdentallab@gmail.com">yzhdentallab@gmail.com</a>`);
    } finally {
      form.dataset.submitting = "false";
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = originalButtonText;
      }
    }
  });
}
