const fs = require("node:fs/promises");
const path = require("node:path");

const { list } = require("@vercel/blob");

const DEFAULT_REPORT_DIR = "C:/Users/YSH/Desktop/YZH-migration-private/2026-09-01";

function csvCell(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

async function inventoryBlob() {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token || token === "[SENSITIVE]") {
    throw new Error("BLOB_READ_WRITE_TOKEN is not available.");
  }

  const objects = [];
  let cursor;

  do {
    const page = await list({ cursor, limit: 1000, token });
    for (const blob of page.blobs) {
      objects.push({
        pathname: blob.pathname,
        size: blob.size,
        uploadedAt: blob.uploadedAt,
        contentType: blob.contentType,
        url: blob.url,
        downloadUrl: blob.downloadUrl,
      });
    }
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);

  objects.sort((left, right) => left.pathname.localeCompare(right.pathname));

  const reportDir = process.env.MIGRATION_REPORT_DIR || DEFAULT_REPORT_DIR;
  const totalBytes = objects.reduce((total, object) => total + object.size, 0);
  const report = {
    generatedAt: new Date().toISOString(),
    source: "Vercel Blob",
    project: "dental-lab-com",
    objectCount: objects.length,
    totalBytes,
    objects,
  };

  await fs.mkdir(reportDir, { recursive: true });
  await fs.writeFile(
    path.join(reportDir, "vercel-blob-inventory.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );

  const csv = [
    "pathname,size,uploadedAt,contentType,url",
    ...objects.map((object) =>
      [object.pathname, object.size, object.uploadedAt, object.contentType, object.url]
        .map(csvCell)
        .join(","),
    ),
  ].join("\n");
  await fs.writeFile(path.join(reportDir, "vercel-blob-inventory.csv"), `${csv}\n`);

  console.log(JSON.stringify({ objectCount: objects.length, totalBytes, reportDir }, null, 2));
}

inventoryBlob().catch((error) => {
  console.error(`${error.name}: ${error.message}`);
  process.exitCode = 1;
});
