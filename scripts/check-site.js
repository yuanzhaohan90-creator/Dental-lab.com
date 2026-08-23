const fs = require("fs");
const path = require("path");

const root = process.cwd();
const pages = [
  "index.html",
  "implant-restorations.html",
  "full-arch-all-on-x.html",
  "cases/dual-arch-all-on-x/index.html",
  "full-arch/zirconia-titanium-workflow/index.html",
  "full-arch/immediate-load-pmma/index.html",
  "full-arch/photogrammetry-workflow/index.html",
  "full-arch/fp1-full-arch-zirconia/index.html",
  "full-arch/complex-zygomatic-workflow/index.html",
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
  "Testimonials"
];

const routeTargets = {
  "/": "index.html",
  "/implant-restorations": "implant-restorations.html",
  "/full-arch-all-on-x": "full-arch-all-on-x.html",
  "/cases/dual-arch-all-on-x": "cases/dual-arch-all-on-x/index.html",
  "/full-arch/zirconia-titanium-workflow": "full-arch/zirconia-titanium-workflow/index.html",
  "/full-arch/immediate-load-pmma": "full-arch/immediate-load-pmma/index.html",
  "/full-arch/photogrammetry-workflow": "full-arch/photogrammetry-workflow/index.html",
  "/full-arch/fp1-full-arch-zirconia": "full-arch/fp1-full-arch-zirconia/index.html",
  "/full-arch/complex-zygomatic-workflow": "full-arch/complex-zygomatic-workflow/index.html",
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

  for (const match of html.matchAll(/(?:src|href)=["']([^"']+)["']/g)) {
    const value = match[1];
    if (/^(https?:|mailto:|tel:|#|\/api\/)/.test(value)) continue;
    if (routeTargets[value]) {
      if (!fs.existsSync(path.join(root, routeTargets[value]))) failures.push(`Missing route target: ${value}`);
      continue;
    }
    const target = path.join(root, value.replace(/^\//, ""));
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

for (const file of ["robots.txt", "sitemap.xml", "404.html", "favicon.svg", "api/submit-case.js", "api/download-case-file.js"]) {
  if (!fs.existsSync(path.join(root, file))) failures.push(`Missing file: ${file}`);
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log("Site checks passed.");
