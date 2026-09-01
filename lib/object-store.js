const { Readable } = require("node:stream");

const {
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

let r2Client;

function required(name) {
  const value = String(process.env[name] || "").trim();
  if (!value || value === "[SENSITIVE]") throw new Error(`${name} is not configured.`);
  return value;
}

function isR2Backend() {
  return String(process.env.STORAGE_BACKEND || "r2").trim().toLowerCase() === "r2";
}

function r2() {
  if (!r2Client) {
    const sessionToken = String(process.env.R2_SESSION_TOKEN || "").trim();
    r2Client = new S3Client({
      region: "auto",
      endpoint: required("R2_ENDPOINT"),
      forcePathStyle: true,
      credentials: {
        accessKeyId: required("R2_ACCESS_KEY_ID"),
        secretAccessKey: required("R2_SECRET_ACCESS_KEY"),
        ...(sessionToken ? { sessionToken } : {}),
      },
    });
  }
  return r2Client;
}

function bucket() {
  return required("R2_BUCKET_NAME");
}

async function bodyToBuffer(body) {
  if (Buffer.isBuffer(body)) return body;
  if (typeof body === "string") return Buffer.from(body);
  if (body instanceof Uint8Array) return Buffer.from(body);
  if (body && typeof body.arrayBuffer === "function") return Buffer.from(await body.arrayBuffer());
  if (body && typeof body.getReader === "function") return Buffer.from(await new Response(body).arrayBuffer());
  if (body && typeof body[Symbol.asyncIterator] === "function") {
    const chunks = [];
    for await (const chunk of body) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    return Buffer.concat(chunks);
  }
  throw new TypeError("Unsupported object body.");
}

function webStream(body) {
  if (!body) return null;
  if (typeof body.getReader === "function") return body;
  if (body instanceof Readable || typeof body.pipe === "function") return Readable.toWeb(body);
  return new Blob([body]).stream();
}

function isMissing(error) {
  return error?.$metadata?.httpStatusCode === 404
    || error?.name === "NotFound"
    || error?.name === "NoSuchKey";
}

async function r2Get(pathname) {
  try {
    const result = await r2().send(new GetObjectCommand({ Bucket: bucket(), Key: pathname }));
    return {
      statusCode: 200,
      stream: webStream(result.Body),
      blob: {
        pathname,
        size: Number(result.ContentLength || 0),
        contentType: result.ContentType || "application/octet-stream",
        uploadedAt: result.LastModified || null,
      },
    };
  } catch (error) {
    if (isMissing(error)) return null;
    throw error;
  }
}

async function r2Put(pathname, body, options = {}) {
  if (options.allowOverwrite === false) {
    try {
      await r2().send(new HeadObjectCommand({ Bucket: bucket(), Key: pathname }));
      throw Object.assign(new Error(`Object already exists: ${pathname}`), { statusCode: 409 });
    } catch (error) {
      if (!isMissing(error)) throw error;
    }
  }

  const declaredLength = Number(options.contentLength);
  const streamBody = Number.isFinite(declaredLength) && declaredLength >= 0 && body && typeof body.getReader === "function"
    ? Readable.fromWeb(body)
    : null;
  const value = streamBody || await bodyToBuffer(body);
  const contentLength = streamBody ? declaredLength : value.length;
  await r2().send(new PutObjectCommand({
    Bucket: bucket(),
    Key: pathname,
    Body: value,
    ContentLength: contentLength,
    ContentType: options.contentType || "application/octet-stream",
    CacheControl: options.cacheControlMaxAge ? `private, max-age=${options.cacheControlMaxAge}` : "private, no-store",
  }));
  return {
    pathname,
    url: `r2://${bucket()}/${pathname}`,
    downloadUrl: `r2://${bucket()}/${pathname}`,
    contentType: options.contentType || "application/octet-stream",
    size: contentLength,
  };
}

async function r2List({ prefix = "", limit = 100, cursor } = {}) {
  const result = await r2().send(new ListObjectsV2Command({
    Bucket: bucket(),
    Prefix: prefix,
    MaxKeys: Math.min(Math.max(Number(limit) || 100, 1), 1000),
    ContinuationToken: cursor || undefined,
  }));
  return {
    blobs: (result.Contents || []).map((item) => ({
      pathname: item.Key,
      size: Number(item.Size || 0),
      uploadedAt: item.LastModified || null,
      contentType: "",
      url: `r2://${bucket()}/${item.Key}`,
      downloadUrl: `r2://${bucket()}/${item.Key}`,
    })),
    cursor: result.NextContinuationToken,
    hasMore: Boolean(result.IsTruncated),
  };
}

async function r2Del(paths) {
  const keys = [...new Set((Array.isArray(paths) ? paths : [paths]).filter(Boolean))];
  if (!keys.length) return;
  await r2().send(new DeleteObjectsCommand({
    Bucket: bucket(),
    Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true },
  }));
}

async function storageClient() {
  if (!isR2Backend()) throw new Error("Unsupported storage backend. Set STORAGE_BACKEND=r2.");
  return { get: r2Get, put: r2Put, list: r2List, del: r2Del };
}

async function createR2UploadUrl(pathname, contentType, expiresIn = 600) {
  if (!isR2Backend()) throw new Error("Direct media uploads require the R2 storage backend.");
  const command = new PutObjectCommand({
    Bucket: bucket(),
    Key: pathname,
    ContentType: contentType || "application/octet-stream",
  });
  return getSignedUrl(r2(), command, { expiresIn });
}

function resetStorageClientsForTests() {
  r2Client = undefined;
}

module.exports = { createR2UploadUrl, isR2Backend, resetStorageClientsForTests, storageClient };
