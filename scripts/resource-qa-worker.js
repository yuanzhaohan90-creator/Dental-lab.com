import application from "../_worker.js";
import casesTemplate from "../templates/cases.tpl";
import siteCss from "../cloudflare-public/assets/site.css";
import siteJs from "../cloudflare-public/assets/site.js";
import casesJs from "../cloudflare-public/assets/cases.js";
import portfolioJs from "../cloudflare-public/assets/case-portfolio.js";
import logo from "../cloudflare-public/assets/brand/yzh-mark.svg";
import favicon from "../cloudflare-public/favicon.svg";

const assets = {
  "/assets/site.css": [siteCss, "text/css"],
  "/assets/site.js": [siteJs, "text/javascript"],
  "/assets/cases.js": [casesJs, "text/javascript"],
  "/assets/case-portfolio.js": [portfolioJs, "text/javascript"],
  "/assets/brand/yzh-mark.svg": [logo, "image/svg+xml"],
  "/favicon.svg": [favicon, "image/svg+xml"]
};
const testAssets = {
  async fetch(request) {
    const pathname = new URL(request.url).pathname;
    if (pathname.startsWith("/__templates/")) {
      return new Response(pathname.endsWith("/cases.tpl") ? casesTemplate : "", { headers: { "Content-Type": "text/plain" } });
    }
    const asset = assets[pathname];
    return asset ? new Response(asset[0], { headers: { "Content-Type": asset[1] } }) : new Response("Not found", { status: 404 });
  }
};

export default {
  async fetch(request, env, ctx) {
    if (env.R2_BUCKET_NAME !== "yzh-dental-lab-resource-qa") {
      throw new Error("Resource QA must use its isolated bucket.");
    }
    if (!["GET", "HEAD"].includes(request.method)) {
      return new Response("Read-only resource test", { status: 405 });
    }
    const started = performance.now();
    const url = new URL(request.url);
    try {
      const response = await application.fetch(request, { ...env, ASSETS: testAssets }, ctx);
      console.log("resource_qa", JSON.stringify({ pathname: url.pathname, phase: url.searchParams.get("qaPhase"), status: response.status, handlerWallMs: performance.now() - started }));
      return response;
    } catch (error) {
      console.error("resource_qa_exception", error.name, error.message);
      throw error;
    }
  }
};
