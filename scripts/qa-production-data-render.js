const { load } = require("cheerio");
const { renderPublicPage } = require("../lib/public-page-renderer");

async function main() {
  const response = await fetch("https://yzhdentallab.com/api/admin?module=public-site");
  if (!response.ok) throw new Error(`Read-only public config returned ${response.status}`);
  const data = await response.json();
  const about = load(renderPublicPage("about", data));
  const implant = load(renderPublicPage("implant", data));
  const cases = load(renderPublicPage("cases", data));
  const videoUrls = about("main video[src]").map((_, node) => about(node).attr("src")).get();
  const results = {
    productionRequests: "GET only",
    productionMutations: 0,
    publishedCases: data.publishedCases.length,
    placeholderSteps: (about("main").text().match(/New Item/g) || []).length,
    blankMedia: about("[data-manager-media]:empty").length,
    filenameCaptions: (about("main small,main figcaption").text().match(/微信|IMG_|\.jpg/g) || []).length,
    duplicateVideos: videoUrls.length - new Set(videoUrls).size,
    implantAdminCopy: (implant("main").text().match(/Publish implant work|appears here when published|can be shown as real cases/gi) || []).length,
    repeatedPortfolioCases: data.publishedCases.filter(item => cases(`a[href='/cases/${item.slug}']`).length !== 1).map(item => item.id),
    ownerContentRequired: data.publishedCases.filter(item => String(item.title).trim().split(/\s+/).length < 3).map(item => ({ id: item.id, title: item.title }))
  };
  console.log(JSON.stringify(results, null, 2));
  if (results.placeholderSteps || results.blankMedia || results.filenameCaptions || results.duplicateVideos || results.implantAdminCopy || results.repeatedPortfolioCases.length) process.exitCode = 1;
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
