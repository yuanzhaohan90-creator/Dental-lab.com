const { submitIndexNow, verifyPublicUrl } = require("../lib/indexnow");

async function main() {
  const urls = process.argv.slice(2);
  if (!urls.length) {
    console.error("Usage: node scripts/submit-indexnow.js https://yzhdentallab.com/page ...");
    process.exit(1);
  }
  const verified = [];
  for (const url of urls) {
    const result = await verifyPublicUrl(url);
    if (!result.ok) {
      console.error(`SKIP ${url}: ${result.reason}`);
      continue;
    }
    verified.push(result.url);
  }
  if (!verified.length) {
    console.error("No URLs passed verification.");
    process.exit(1);
  }
  const result = await submitIndexNow(verified);
  console.log(JSON.stringify({
    ok: result.ok,
    status: result.status,
    submitted: result.submitted,
    rejected: result.rejected || []
  }, null, 2));
  if (!result.ok) process.exit(1);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
