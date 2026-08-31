const menuButton = document.querySelector(".menu-toggle");
const nav = document.getElementById("primaryNav");

function normalizePublicNavigation() {
  if (!nav) return;
  const path = location.pathname.replace(/\/$/, "") || "/";
  nav.querySelectorAll("a").forEach((link) => {
    const target = link.getAttribute("href");
    const active = target === "/cases" ? path === "/cases" || path.startsWith("/cases/") : path === target;
    link.classList.toggle("active", active);
    if (active) link.setAttribute("aria-current", "page");
  });
  const services = nav.querySelector(".nav-dropdown");
  if (services) services.classList.toggle("active", ["/implant-restorations", "/full-arch-all-on-x", "/crown-bridge", "/digital-dentistry", "/surgical-guides"].includes(path));
}

function closeNavigation() {
  nav?.classList.remove("open");
  menuButton?.setAttribute("aria-expanded", "false");
  const dropdown = nav?.querySelector(".nav-dropdown");
  dropdown?.classList.remove("open");
  dropdown?.querySelector(".nav-dropdown-toggle")?.setAttribute("aria-expanded", "false");
}

normalizePublicNavigation();
if (menuButton && nav) {
  menuButton.addEventListener("click", () => {
    const open = nav.classList.toggle("open");
    menuButton.setAttribute("aria-expanded", open ? "true" : "false");
  });
  const dropdown = nav.querySelector(".nav-dropdown");
  const dropdownButton = dropdown?.querySelector(".nav-dropdown-toggle");
  dropdownButton?.addEventListener("click", () => {
    const open = dropdown.classList.toggle("open");
    dropdownButton.setAttribute("aria-expanded", open ? "true" : "false");
  });
  nav.addEventListener("click", (event) => {
    if (event.target.closest("a")) closeNavigation();
  });
  document.addEventListener("click", (event) => {
    if (!event.target.closest(".site-header")) closeNavigation();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeNavigation();
      menuButton.focus();
    }
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

function applyBranding(settings) {
  const company = settings.companyName || "YZH Dental Lab";
  document.querySelectorAll(".brand").forEach((brand) => {
    const mark = brand.querySelector(".brand-mark");
    const text = brand.querySelector("span:last-child");
    if (text) text.textContent = company;
    let logo = brand.querySelector(".brand-logo");
    if (settings.primaryLogoUrl) {
      if (!logo) {
        logo = document.createElement("img");
        logo.className = "brand-logo";
        logo.alt = company;
        brand.prepend(logo);
      }
      logo.src = settings.primaryLogoUrl;
      if (mark) mark.hidden = true;
    } else {
      if (!logo) {
        logo = document.createElement("img");
        logo.className = "brand-logo";
        logo.alt = "";
        brand.prepend(logo);
      }
      logo.src = "/assets/brand/yzh-mark.svg";
      if (mark) mark.hidden = true;
    }
  });
  const footerTitle = document.querySelector(".site-footer .footer-grid > div:first-child h3");
  if (footerTitle) {
    const logoUrl = settings.darkLogoUrl || settings.primaryLogoUrl;
    footerTitle.innerHTML = `<a class="footer-brand" href="/"><img src="${escapeAttr(logoUrl || "/assets/brand/yzh-mark.svg")}" alt=""><span>${escapeHtml(company)}</span></a>`;
  }
  const footerWrap = document.querySelector(".site-footer > .wrap");
  if (footerWrap && !footerWrap.querySelector(".footer-copyright")) {
    const copyright = document.createElement("p");
    copyright.className = "footer-copyright";
    copyright.textContent = `© ${new Date().getFullYear()} ${company}. All rights reserved.`;
    footerWrap.append(copyright);
  }
  const favicon = document.querySelector('link[rel="icon"]') || document.head.appendChild(document.createElement("link"));
  favicon.rel = "icon";
  favicon.href = settings.faviconUrl || "/favicon.svg";
}

function applyContactInformation(settings) {
  const publicEmail = settings.publicEmail || "";
  const whatsappUrl = settings.whatsappUrl || "";
  const phone = settings.phone || "";
  const linkedinUrl = settings.linkedinUrl || "";
  document.querySelectorAll('a[href^="mailto:"]').forEach((link) => { link.href = `mailto:${publicEmail}`; link.textContent = publicEmail; });
  document.querySelectorAll('a[href*="wa.me"]').forEach((link) => {
    link.href = whatsappUrl;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    if (link.closest(".site-footer")) link.textContent = `WhatsApp: ${settings.whatsapp || phone}`;
  });
  document.querySelectorAll('a[href^="tel:"]').forEach((link) => { link.href = `tel:${phone.replace(/[^+\d]/g, "")}`; link.textContent = `Phone: ${phone}`; });
  document.querySelectorAll(".site-footer .footer-grid > div:nth-of-type(4)").forEach((contact) => {
    if (phone && !contact.querySelector('a[href^="tel:"]')) {
      const link = document.createElement("a");
      link.href = `tel:${phone.replace(/[^+\d]/g, "")}`;
      link.textContent = `Phone: ${phone}`;
      contact.append(link);
    }
    let linkedIn = contact.querySelector('[data-contact-linkedin],a[href*="linkedin.com"]');
    if (linkedinUrl) {
      if (!linkedIn) {
        linkedIn = document.createElement("a");
        linkedIn.dataset.contactLinkedin = "";
        contact.append(linkedIn);
      }
      linkedIn.href = linkedinUrl;
      linkedIn.target = "_blank";
      linkedIn.rel = "noopener noreferrer";
      linkedIn.textContent = "LinkedIn";
      linkedIn.dataset.contactLinkedin = "";
    } else linkedIn?.remove();
    if (publicEmail && !contact.querySelector("[data-copy-email]")) {
      const copy = document.createElement("button");
      copy.type = "button";
      copy.className = "contact-copy-link";
      copy.dataset.copyEmail = publicEmail;
      copy.textContent = "Copy Email";
      contact.append(copy);
    }
  });

  const addContactRow = (container) => {
    if (!container || container.querySelector("[data-central-contact-row]")) return;
    const row = document.createElement("div");
    row.className = "central-contact-row";
    row.dataset.centralContactRow = "";
    if (publicEmail) {
      if (!container.querySelector('a[href^="mailto:"]')) {
        const email = document.createElement("a");
        email.href = `mailto:${publicEmail}`;
        email.textContent = "Email";
        row.append(email);
      }
      const copy = document.createElement("button");
      copy.type = "button";
      copy.className = "contact-copy-link";
      copy.dataset.copyEmail = publicEmail;
      copy.textContent = "Copy Email";
      row.append(copy);
    }
    if (phone && !container.querySelector('a[href^="tel:"]')) {
      const phoneLink = document.createElement("a");
      phoneLink.href = `tel:${phone.replace(/[^+\d]/g, "")}`;
      phoneLink.textContent = "Phone";
      row.append(phoneLink);
    }
    if (linkedinUrl && !container.querySelector('[data-contact-linkedin],a[href*="linkedin.com"]')) {
      const linkedIn = document.createElement("a");
      linkedIn.href = linkedinUrl;
      linkedIn.target = "_blank";
      linkedIn.rel = "noopener noreferrer";
      linkedIn.textContent = "LinkedIn";
      linkedIn.dataset.contactLinkedin = "";
      row.append(linkedIn);
    }
    if (row.children.length) container.append(row);
  };
  if (location.pathname === "/about" || location.pathname === "/about.html") addContactRow(document.querySelector(".trial .cta-panel"));
  if (location.pathname === "/submit-case" || location.pathname === "/submit-case.html") addContactRow(document.querySelector(".contact-links"));

  bindCopyEmailActions(publicEmail);
}

function bindCopyEmailActions(publicEmail = "") {
  if (!document.documentElement.dataset.copyEmailBound) {
    document.documentElement.dataset.copyEmailBound = "true";
    document.addEventListener("click", async (event) => {
      const button = event.target.closest("[data-copy-email]");
      if (!button) return;
      const email = button.dataset.copyEmail || publicEmail;
      try {
        if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
        await navigator.clipboard.writeText(email);
      } catch {
        const field = document.createElement("textarea");
        field.value = email;
        field.setAttribute("readonly", "");
        field.className = "copy-email-fallback";
        document.body.append(field);
        field.select();
        document.execCommand("copy");
        field.remove();
      }
      const original = button.textContent;
      button.textContent = "Copied";
      setTimeout(() => { button.textContent = original; }, 1600);
    });
  }
}

function makeCaseCard(item, index) {
  const cover = item.coverImage?.url || "/assets/real/full-arch-titanium-framework-10.jpg";
  const lines = [item.material, item.implantSystem, item.restorationType].filter(Boolean).slice(0, 2).join(" · ");
  const url = `/cases/${encodeURIComponent(item.slug)}`;
  return `<a class="priority-case ${index === 0 ? "large" : ""}" href="${url}">
    <img src="${cover}" alt="${escapeAttr(item.coverImage?.caption || item.title)}">
    <div>
      <p class="case-category">${escapeHtml(item.category)}</p>
      <h3>${escapeHtml(item.title)}</h3>
      <p>${escapeHtml(lines || item.shortNote || item.summary || "Completed dental work with technical review before production.")}</p>
      <span class="text-link">${item.contentType === "case_study" ? "View Case Study" : "View Work"}</span>
    </div>
  </a>`;
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
  const response = await fetch("/api/admin?module=public-site", { cache: "no-store" });
  const data = await response.json();
  if (!response.ok || !data.ok) throw new Error(data.error || "Site content unavailable.");
  if (["home", "homepage", "implant", "fullArch", "about"].includes(preview)) {
    const page = preview === "homepage" ? "home" : preview;
    const pageResponse = await fetch(`/api/admin?module=page-editor&page=${encodeURIComponent(page)}`, { cache: "no-store" });
    const pageData = await pageResponse.json();
    if (!pageResponse.ok || !pageData.ok) throw new Error(pageData.error || "Page preview unavailable.");
    if (page === "home") {
      data.homepage = pageData.preview;
      const ids = pageData.preview.selectedWork.caseIds || [];
      data.selectedCases = pageData.publishedCases.filter((item) => ids.includes(item.id)).sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
    } else data.pages[page] = pageData.preview;
    data.preview = page;
  }
  if (preview === "settings") {
    const settingsResponse = await fetch("/api/admin?module=settings", { cache: "no-store" });
    const settingsData = await settingsResponse.json();
    if (!settingsResponse.ok || !settingsData.ok) throw new Error(settingsData.error || "Settings preview unavailable.");
    data.settings = settingsData.settings.draft;
    if (data.settings.primaryLogoMediaId) data.settings.primaryLogoUrl = `/api/admin?module=media-image&id=${encodeURIComponent(data.settings.primaryLogoMediaId)}`;
    if (data.settings.darkLogoMediaId) data.settings.darkLogoUrl = `/api/admin?module=media-image&id=${encodeURIComponent(data.settings.darkLogoMediaId)}`;
    if (data.settings.faviconMediaId) data.settings.faviconUrl = `/api/admin?module=media-image&id=${encodeURIComponent(data.settings.faviconMediaId)}`;
    if (data.settings.defaultOgMediaId) data.settings.defaultOgImageUrl = `/api/admin?module=media-image&id=${encodeURIComponent(data.settings.defaultOgMediaId)}`;
    data.preview = "settings";
  }
  return data;
}

function valueAt(object, path) {
  return String(path || "").split(".").reduce((value, key) => value?.[key], object);
}

function renderManagedMedia(element, slot) {
  if (!element || !slot) return;
  const url = slot.url || slot.fallbackPath;
  const hideTarget = element.closest("[data-hide-when-empty]");
  if (!url) {
    if (hideTarget) hideTarget.hidden = true;
    return;
  }
  if (hideTarget) hideTarget.hidden = false;
  const tag = slot.mediaType === "video" ? "video" : "img";
  let media = element.matches("img,video") ? element : element.querySelector("img,video");
  if (!media || media.tagName.toLowerCase() !== tag) {
    const replacement = document.createElement(tag);
    if (media) replacement.className = media.className;
    if (media?.hasAttribute("fetchpriority")) replacement.setAttribute("fetchpriority", media.getAttribute("fetchpriority"));
    if (media) media.replaceWith(replacement); else element.replaceChildren(replacement);
    media = replacement;
  }
  if (tag === "video") {
    media.src = url;
    media.poster = slot.posterUrl || "";
    media.autoplay = Boolean(slot.autoplay);
    media.muted = true;
    media.loop = Boolean(slot.loop);
    media.playsInline = true;
    media.preload = "metadata";
    if (!slot.autoplay) media.controls = true;
  } else {
    media.src = url;
    media.alt = slot.altText || media.alt || "YZH Dental Lab work";
    if (!media.hasAttribute("loading") && !media.hasAttribute("fetchpriority")) media.loading = "lazy";
  }
  const focus = { center: "center center", top: "center top", bottom: "center bottom", left: "left center", right: "right center" }[slot.focalPosition] || "center center";
  media.style.objectFit = slot.fit === "contain" ? "contain" : "cover";
  media.style.objectPosition = focus;
  media.dataset.mediaFit = slot.fit === "contain" ? "contain" : "cover";
  media.dataset.mediaFocus = slot.focalPosition || "center";
}

function applyManagedPage(page) {
  if (!page) return;
  document.querySelectorAll("[data-manager-text]").forEach((element) => {
    const value = valueAt(page, element.dataset.managerText);
    if (value) element.textContent = value;
  });
  document.querySelectorAll("[data-manager-href]").forEach((element) => {
    const value = valueAt(page, element.dataset.managerHref);
    if (value) element.href = value;
  });
  document.querySelectorAll("[data-manager-media]").forEach((element) => renderManagedMedia(element, valueAt(page, element.dataset.managerMedia)));
}

function applyFeaturedCase(container, section, cases, label) {
  if (!container || !section?.caseId) return;
  const item = cases?.find((entry) => entry.id === section.caseId);
  if (!item?.coverImage) return;
  container.hidden = false;
  const card = `<div class="section-head"><p class="eyebrow">${escapeHtml(label)}</p><h2>${escapeHtml(section.heading || label)}</h2>${section.description ? `<p class="copy">${escapeHtml(section.description)}</p>` : ""}</div><a class="managed-featured-case" href="/cases/${encodeURIComponent(item.slug)}"><img src="${escapeAttr(item.coverImage.url)}" alt="${escapeAttr(item.title)}"><div><p class="case-category">${escapeHtml(item.category)}</p><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.summary || item.shortNote || "View technical case details.")}</p><span class="text-link">View Case</span></div></a>`;
  container.innerHTML = container.matches("section") ? `<div class="wrap">${card}</div>` : card;
  const fallbackKey = label.includes("Full-Arch") ? "fullArch" : "implant";
  const fallback = document.querySelector(`[data-featured-fallback='${fallbackKey}']`);
  if (fallback) fallback.hidden = true;
}

async function applyPublicSiteData() {
  try {
    const data = await loadPublicSiteData();
    if (data.preview) showPreviewBanner(data.preview);
    const { homepage, settings, selectedCases, publishedCases, pages } = data;
    if (settings) {
      window.yzhPublicSettings = settings;
      if (location.pathname === "/" || location.pathname === "") {
        document.title = settings.defaultSeoTitle || document.title;
        setMeta('meta[name="description"]', settings.defaultSeoDescription);
        setMeta('meta[property="og:title"]', settings.defaultSeoTitle);
        setMeta('meta[property="og:description"]', settings.defaultSeoDescription);
        setMeta('meta[property="og:image"]', settings.defaultOgImageUrl || settings.defaultOgImagePath);
      }
      applyBranding(settings);
      applyContactInformation(settings);
    }
    if ((location.pathname === "/" || location.pathname === "") && homepage) {
      applyManagedPage(homepage);
      applyText("#featured-cases .section-head .eyebrow", homepage.selectedWork.eyebrow);
      applyText("#featured-cases .section-head h2", homepage.selectedWork.heading);
      applyText("#featured-cases .section-head .copy", homepage.selectedWork.description);
      const grid = document.querySelector("#featured-cases .priority-case-grid");
      if (grid && selectedCases?.length) grid.innerHTML = selectedCases.slice(0, 3).map(makeCaseCard).join("");
    }
    if (location.pathname === "/implant-restorations") {
      applyManagedPage(pages?.implant);
      applyFeaturedCase(document.querySelector("[data-featured-case='implant']"), pages?.implant?.featuredWork, publishedCases, "Featured Implant Work");
    }
    if (location.pathname === "/full-arch-all-on-x") {
      applyManagedPage(pages?.fullArch);
      applyFeaturedCase(document.querySelector("[data-featured-case='fullArch']"), pages?.fullArch?.featuredCase, publishedCases, "Featured Full-Arch Case");
      pages?.fullArch?.restorationOptions?.forEach((option, index) => {
        const link = document.querySelector(`[data-option-case='${index}']`);
        const item = publishedCases?.find((entry) => entry.id === option.caseId);
        if (link && item) { link.href = `/cases/${encodeURIComponent(item.slug)}`; link.hidden = false; }
      });
    }
    if (location.pathname === "/about") applyManagedPage(pages?.about);
  } catch (error) {
    console.warn("public_site_data_skipped", error);
  } finally {
    normalizePublicNavigation();
  }
}

const serverRendered = document.documentElement.dataset.serverRendered === "true" && !new URLSearchParams(location.search).has("adminPreview");
bindCopyEmailActions();
if (!serverRendered) applyPublicSiteData();

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
      setStatus("error", `The file <strong>${escapeHtml(invalid.name)}</strong> is not supported. Please upload STL, PLY, ZIP, PDF, JPG, JPEG or PNG files.`);
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
      const contact = window.yzhPublicSettings || {};
      const whatsappUrl = contact.whatsappUrl || "https://wa.me/8613714730109";
      const whatsapp = contact.whatsapp || "+86 137 1473 0109";
      const email = contact.publicEmail || "yzhdentallab@gmail.com";
      const reason = error.message === "Failed to fetch" ? "Upload interrupted. Please check your connection and try again." : (error.message || "We could not complete the upload.");
      setStatus("error", `<strong>${escapeHtml(reason)}</strong><br>Your files were not submitted. Please try again, or send them by WhatsApp/email.<br>WhatsApp: <a href="${escapeAttr(whatsappUrl)}" target="_blank" rel="noreferrer">${escapeHtml(whatsapp)}</a><br>Email: <a href="mailto:${escapeAttr(email)}">${escapeHtml(email)}</a>`);
    } finally {
      form.dataset.submitting = "false";
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = originalButtonText;
      }
    }
  });
}
