const crypto = require("crypto");
const { GetObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } = require("@aws-sdk/client-s3");

function required(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function client(prefix) {
  const sessionToken = String(process.env[`${prefix}_SESSION_TOKEN`] || "").trim();
  return new S3Client({
    region: "auto",
    endpoint: required(`${prefix}_ENDPOINT`),
    forcePathStyle: true,
    credentials: {
      accessKeyId: required(`${prefix}_ACCESS_KEY_ID`),
      secretAccessKey: required(`${prefix}_SECRET_ACCESS_KEY`),
      ...(sessionToken ? { sessionToken } : {})
    }
  });
}

async function readAll(body) {
  return Buffer.from(await body.transformToByteArray());
}

async function listAll(source, bucket) {
  const items = [];
  let continuationToken;
  do {
    const result = await source.send(new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: continuationToken }));
    items.push(...(result.Contents || []));
    continuationToken = result.NextContinuationToken;
  } while (continuationToken);
  return items;
}

async function main() {
  const source = client("R2_SOURCE");
  const destination = client("R2_DESTINATION");
  const sourceBucket = required("R2_SOURCE_BUCKET");
  const destinationBucket = required("R2_DESTINATION_BUCKET");
  const objects = await listAll(source, sourceBucket);
  const manifest = [];
  let totalBytes = 0;

  for (const object of objects) {
    const result = await source.send(new GetObjectCommand({ Bucket: sourceBucket, Key: object.Key }));
    const body = await readAll(result.Body);
    const sha256 = crypto.createHash("sha256").update(body).digest("hex");
    await destination.send(new PutObjectCommand({
      Bucket: destinationBucket,
      Key: object.Key,
      Body: body,
      ContentLength: body.length,
      ContentType: result.ContentType || undefined,
      CacheControl: result.CacheControl || undefined
    }));
    manifest.push({ key: object.Key, size: body.length, sha256 });
    totalBytes += body.length;
  }

  console.log(JSON.stringify({
    sourceBucket,
    destinationBucket,
    sourceCount: objects.length,
    destinationCount: manifest.length,
    sourceBytes: objects.reduce((sum, item) => sum + Number(item.Size || 0), 0),
    destinationBytes: totalBytes,
    pathnameCount: manifest.filter((item) => item.key).length,
    sha256Count: manifest.length,
    sourceMutations: 0,
    objects: manifest
  }, null, 2));
}

main().catch((error) => {
  console.error(`R2 snapshot failed: ${error.name || "Error"}: ${error.message}`);
  process.exitCode = 1;
});
