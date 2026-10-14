const ASSET_VERSIONS = Object.freeze({
  "/assets/site.js": "1776428ff9e8",
  "/assets/site.css": "953efb4c79c7",
  "/assets/cases.js": "f0cef62efc77",
  "/assets/case-portfolio.js": "722b1ae413b5",
  "/assets/admin.js": "b8f1f6c51849",
  "/assets/case-publication-policy.js": "517a91d41cad"
});

const LEGACY_ASSETS = Object.freeze({
  "/assets/site.js": "/assets/legacy/site.1943a35f514c.js",
  "/assets/site.css": "/assets/legacy/site.ca0cd1e364f4.css",
  "/assets/cases.js": "/assets/legacy/cases.0217ca371c7a.js",
  "/assets/admin.js": "/assets/legacy/admin.cc2025da0d14.js"
});

const PREVIOUS_VERSIONS = Object.freeze({
  "/assets/site.js": ["case-nav-1"],
  "/assets/site.css": ["public-qa-2"],
  "/assets/cases.js": ["case-filters-2"],
  "/assets/admin.js": ["publication-history-1"]
});

function versionedAsset(pathname) {
  return ASSET_VERSIONS[pathname] ? `${pathname}?v=${ASSET_VERSIONS[pathname]}` : pathname;
}

function legacyAssetPath(url) {
  const version = url.searchParams.get("v");
  if (PREVIOUS_VERSIONS[url.pathname]?.includes(version)) return null;
  // Cached HTML must keep the scripts/styles it was originally rendered with.
  return version && version !== ASSET_VERSIONS[url.pathname]
    ? LEGACY_ASSETS[url.pathname] || null
    : null;
}

module.exports = { ASSET_VERSIONS, LEGACY_ASSETS, versionedAsset, legacyAssetPath };
