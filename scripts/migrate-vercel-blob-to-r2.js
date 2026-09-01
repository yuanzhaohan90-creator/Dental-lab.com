const crypto = require("node:crypto");
const dns = require("node:dns");
const fs = require("node:fs/promises");
const https = require("node:https");
const path = require("node:path");

const { GetObjectCommand, HeadBucketCommand, HeadObjectCommand, PutObjectCommand, S3Client } = require("@aws-sdk/client-s3");
const { NodeHttpHandler } = require("@smithy/node-http-handler");
const { get, list } = require("@vercel/blob");

const DEFAULT_REPORT_DIR = "C:/Users/YSH/Desktop/YZH-migration-private/2026-09-01";

function required(name) {
  const value = String(process.env[name] || "").trim();
  if (!value || value === "[SENSITIVE]") throw new Error(`${name} is not configured.`);
  return value;
}

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

async function bodyToBuffer(body) {
  if (!body) throw new Error("Object body is empty.");
  if (typeof body.transformToByteArray === "function") {
    return Buffer.from(await body.transformToByteArray());
  }
  return Buffer.from(await new Response(body).arrayBuffer());
}

async function listVercelObjects(token) {
  const objects = [];
  let cursor;
  do {
    const page = await list({ cursor, limit: 1000, token });
    objects.push(...page.blobs);
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return objects.sort((left, right) => left.pathname.localeCompare(right.pathname));
}

async function readVercelObject(blob, token) {
  try {
    const result = await get(blob.pathname, { access: "private", token, useCache: false });
    if (result?.statusCode === 200 && result.stream) {
      return Buffer.from(await new Response(result.stream).arrayBuffer());
    }
  } catch (error) {
    if (!blob.downloadUrl && !blob.url) throw error;
  }

  const response = await fetch(blob.downloadUrl || blob.url, { cache: "no-store" });
  if (!response.ok) throw new Error(`Unable to download source object (${response.status}).`);
  return Buffer.from(await response.arrayBuffer());
}

async function readR2Object(client, bucket, key) {
  const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  return bodyToBuffer(result.Body);
}

async function inspectR2Object(client, bucket, key) {
  try {
    const result = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return { exists: true, size: Number(result.ContentLength || 0), contentType: result.ContentType || "" };
  } catch (error) {
    const status = error?.$metadata?.httpStatusCode;
    if (status === 404 || error?.name === "NotFound" || error?.name === "NoSuchKey") {
      return { exists: false, size: 0, contentType: "" };
    }
    throw error;
  }
}

function cloudflareDnsAgent() {
  const resolver = new dns.promises.Resolver();
  resolver.setServers(["1.1.1.1", "1.0.0.1"]);

  return new https.Agent({
    lookup(hostname, options, callback) {
      resolver.resolve4(hostname).then((addresses) => {
        if (options?.all) {
          callback(null, addresses.map((address) => ({ address, family: 4 })));
          return;
        }
        callback(null, addresses[0], 4);
      }).catch(callback);
    },
  });
}

async function migrate() {
  if (!process.argv.includes("--copy")) {
    throw new Error("Refusing to write without the explicit --copy flag.");
  }

  const blobToken = required("BLOB_READ_WRITE_TOKEN");
  const endpoint = required("R2_ENDPOINT").replace(/^Https:/, "https:");
  const bucket = required("R2_BUCKET_NAME");
  const client = new S3Client({
    region: "auto",
    endpoint,
    forcePathStyle: true,
    requestHandler: new NodeHttpHandler({ httpsAgent: cloudflareDnsAgent() }),
    credentials: {
      accessKeyId: required("R2_ACCESS_KEY_ID"),
      secretAccessKey: required("R2_SECRET_ACCESS_KEY"),
    },
  });

  await client.send(new HeadBucketCommand({ Bucket: bucket }));
  const sourceObjects = await listVercelObjects(blobToken);
  const results = [];

  for (const [index, blob] of sourceObjects.entries()) {
    const sourceBody = await readVercelObject(blob, blobToken);
    const sourceHash = sha256(sourceBody);
    const before = await inspectR2Object(client, bucket, blob.pathname);
    let action = "uploaded";

    if (before.exists && before.size === sourceBody.length) {
      const existingBody = await readR2Object(client, bucket, blob.pathname);
      if (sha256(existingBody) === sourceHash) action = "already-matched";
    }

    if (action !== "already-matched") {
      await client.send(new PutObjectCommand({
        Bucket: bucket,
        Key: blob.pathname,
        Body: sourceBody,
        ContentLength: sourceBody.length,
        ContentType: blob.contentType || "application/octet-stream",
        Metadata: { migratedFrom: "vercel-blob" },
      }));
    }

    const r2Body = await readR2Object(client, bucket, blob.pathname);
    const r2Hash = sha256(r2Body);
    const verified = r2Body.length === sourceBody.length && r2Hash === sourceHash;
    if (!verified) throw new Error(`Verification failed for ${blob.pathname}`);

    results.push({
      pathname: blob.pathname,
      sourceBytes: sourceBody.length,
      r2Bytes: r2Body.length,
      sourceSha256: sourceHash,
      r2Sha256: r2Hash,
      contentType: blob.contentType || "application/octet-stream",
      action,
      verified,
    });
    console.log(`[${index + 1}/${sourceObjects.length}] ${action}: ${blob.pathname}`);
  }

  const reportDir = process.env.MIGRATION_REPORT_DIR || DEFAULT_REPORT_DIR;
  const sourceBytes = results.reduce((total, item) => total + item.sourceBytes, 0);
  const r2Bytes = results.reduce((total, item) => total + item.r2Bytes, 0);
  const report = {
    generatedAt: new Date().toISOString(),
    source: "Vercel Blob",
    destination: "Cloudflare R2",
    bucket,
    copyOnly: true,
    sourceObjectCount: sourceObjects.length,
    verifiedObjectCount: results.filter((item) => item.verified).length,
    sourceBytes,
    r2Bytes,
    allObjectsVerified: results.every((item) => item.verified),
    objects: results,
  };

  await fs.mkdir(reportDir, { recursive: true });
  await fs.writeFile(path.join(reportDir, "vercel-blob-to-r2-report.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({
    sourceObjectCount: report.sourceObjectCount,
    verifiedObjectCount: report.verifiedObjectCount,
    sourceBytes,
    r2Bytes,
    allObjectsVerified: report.allObjectsVerified,
    reportDir,
  }, null, 2));
}

migrate().catch((error) => {
  console.error(`${error.name}: ${error.message}`);
  process.exitCode = 1;
});
