const fs = require("fs");
const path = require("path");

const root = process.cwd();
const pages = [
  "index.html",
  "implant-restorations.html",
  "full-arch-all-on-x.html",
  "cases.html",
  "crown-bridge.html",
  "digital-dentistry.html",
  "surgical-guides.html",
  "about.html",
  "submit-case.html",
  "privacy-policy.html"
];
const failures = [];

const forbidden = [
  "Every section uses matching product or workflow visuals",
  "cutting-edge solutions",
  "unmatched quality",
  "world-class service",
  "state-of-the-art",
  "exceptional excellence",
  "best quality",
  "leading provider",
  "Joydenta",
  "To be confirmed",
  "Verified data pending",
  "Real testimonial pending",
  "Replace with approved",
  "Our Factory",
  "Our Team",
  "Our Facility",
  "Real Work",
  "Real Case",
  "Testimonials",
  "External Reference",
  "Reference Case",
  "Reference Library",
  "Published Clinical Reference",
  "Open Published Reference",
  "third-party case",
  "externalCase",
  "external case metadata"
];

const routeTargets = {
  "/": "index.html",
  "/implant-restorations": "implant-restorations.html",
  "/full-arch-all-on-x": "full-arch-all-on-x.html",
  "/cases": "cases.html",
  "/crown-bridge": "crown-bridge.html",
  "/digital-dentistry": "digital-dentistry.html",
  "/surgical-guides": "surgical-guides.html",
  "/about": "about.html",
  "/submit-case": "submit-case.html",
  "/privacy-policy": "privacy-policy.html"
};

for (const page of pages) {
  const pagePath = path.join(root, page);
  if (!fs.existsSync(pagePath)) {
    failures.push(`Missing page: ${page}`);
    continue;
  }
  const html = fs.readFileSync(pagePath, "utf8");

  for (const match of html.matchAll(/(?:^|\s)(?:src|href)=["']([^"']+)["']/g)) {
    const value = match[1];
    const localValue = value.split(/[?#]/, 1)[0];
    if (/^(https?:|mailto:|tel:|#|\/api\/)/.test(value)) continue;
    if (/^\/cases\/[^/]+$/.test(localValue)) continue;
    if (routeTargets[localValue]) {
      if (!fs.existsSync(path.join(root, routeTargets[localValue]))) failures.push(`Missing route target: ${value}`);
      continue;
    }
    const target = path.join(root, localValue.replace(/^\//, ""));
    if (!fs.existsSync(target)) failures.push(`Missing asset in ${page}: ${value}`);
  }

  for (const required of ["canonical", "og:title", "og:description"]) {
    if (!html.includes(required)) failures.push(`Missing required content in ${page}: ${required}`);
  }

  if (/noindex|nofollow/i.test(html)) failures.push(`Production page should not contain noindex/nofollow: ${page}`);

  for (const phrase of forbidden) {
    if (html.includes(phrase)) failures.push(`Forbidden phrase in ${page}: ${phrase}`);
  }
}

for (const required of [
  "application/ld+json",
  "id=\"caseForm\"",
  "name=\"case_files\"",
  "Trial Case First"
]) {
  const combined = pages.map((page) => fs.readFileSync(path.join(root, page), "utf8")).join("\n");
  if (!combined.includes(required)) failures.push(`Missing required content: ${required}`);
}

for (const file of ["robots.txt", "sitemap.xml", "404.html", "favicon.svg", "admin/cases.html", "api/submit-case.js", "api/download-case-file.js", "api/admin-auth.js", "api/admin-cases.js", "api/cases.js", "api/case-page.js", "api/case-image.js"]) {
  if (!fs.existsSync(path.join(root, file))) failures.push(`Missing file: ${file}`);
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log("Site checks passed.");
