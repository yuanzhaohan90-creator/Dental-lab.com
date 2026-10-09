const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");
const { ASSET_VERSIONS, LEGACY_ASSETS, versionedAsset, legacyAssetPath } = require("../lib/asset-versions");
const root = path.join(__dirname, "..");
const digest = file => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");

for (const [resource, version] of Object.entries(ASSET_VERSIONS)) {
  assert.equal(digest(path.join(root, "cloudflare-public", resource)).slice(0, 12), version, `Update asset version for ${resource}`);
  assert.equal(versionedAsset(resource), `${resource}?v=${version}`);
  assert.equal(legacyAssetPath(new URL(versionedAsset(resource), "https://example.com")), null);
}
for (const [resource, legacy] of Object.entries(LEGACY_ASSETS)) {
  assert.equal(legacyAssetPath(new URL(resource + "?v=cases-v3-1", "https://example.com")), legacy);
  const filenameHash = path.basename(legacy).split(".")[1];
  assert.equal(digest(path.join(root, "cloudflare-public", legacy)).slice(0, 12), filenameHash);
  for (const config of ["wrangler.toml", "wrangler.production.toml"]) {
    assert(fs.readFileSync(path.join(root, config), "utf8").includes(`"${resource}"`), `Worker must handle legacy ${resource}`);
  }
}
assert.equal(legacyAssetPath(new URL("/api/admin?v=old", "https://example.com")), null);
assert.equal(legacyAssetPath(new URL("/assets/site.js", "https://example.com")), null);

const files = execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" }).trim().split(/\r?\n/).filter(file => /\.(html|tpl)$/.test(file));
let checked = 0;
for (const file of files) {
  const html = fs.readFileSync(path.join(root, file), "utf8");
  for (const match of html.matchAll(/(?:src|href)="(\/assets\/[^"?]+\.(?:js|css))\?v=([^"]+)"/g)) {
    if (!ASSET_VERSIONS[match[1]]) continue;
    assert.equal(match[2], ASSET_VERSIONS[match[1]], `${file} has a stale asset URL`);
    checked++;
  }
}
console.log(`Asset cache checks passed: ${Object.keys(ASSET_VERSIONS).length} versions, ${Object.keys(LEGACY_ASSETS).length} legacy assets, ${checked} references.`);
