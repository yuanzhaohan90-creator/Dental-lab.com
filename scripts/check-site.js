const fs = require("fs");
const path = require("path");

const root = process.cwd();
const htmlPath = path.join(root, "index.html");
const html = fs.readFileSync(htmlPath, "utf8");
const failures = [];

for (const match of html.matchAll(/(?:src|href)=["']([^"']+)["']/g)) {
  const value = match[1];
  if (/^(https?:|mailto:|tel:|#|\/api\/)/.test(value)) continue;
  const target = path.join(root, value.replace(/^\//, ""));
  if (!fs.existsSync(target)) failures.push(`Missing asset: ${value}`);
}

for (const required of [
  "canonical",
  "application/ld+json",
  "og:title",
  "og:description",
  "id=\"caseForm\"",
  "name=\"case_files\"",
  "Trial Case First"
]) {
  if (!html.includes(required)) failures.push(`Missing required content: ${required}`);
}

for (const file of ["robots.txt", "sitemap.xml", "404.html", "favicon.svg", "api/submit-case.js"]) {
  if (!fs.existsSync(path.join(root, file))) failures.push(`Missing file: ${file}`);
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log("Site checks passed.");
