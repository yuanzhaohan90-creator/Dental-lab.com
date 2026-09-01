const crypto = require("node:crypto");
const dns = require("node:dns");
const fs = require("node:fs");
const https = require("node:https");
const path = require("node:path");

const {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  S3Client,
} = require("@aws-sdk/client-s3");
const { NodeHttpHandler } = require("@smithy/node-http-handler");
const { createR2UploadUrl } = require("../lib/object-store");

function required(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
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

function upload(url, body, contentType, agent) {
  return new Promise((resolve, reject) => {
    const request = https.request(url, {
      method: "PUT",
      agent,
      headers: {
        "content-length": body.length,
        "content-type": contentType,
      },
    }, (response) => {
      response.resume();
      response.on("end", () => {
        if (response.statusCode >= 200 && response.statusCode < 300) resolve();
        else reject(new Error(`R2 upload returned HTTP ${response.statusCode}.`));
      });
    });
    request.on("error", reject);
    request.end(body);
  });
}

async function bodyBuffer(body) {
  const chunks = [];
  for await (const chunk of body) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

async function main() {
  process.env.STORAGE_BACKEND = "r2";
  process.env.R2_ENDPOINT = required("R2_ENDPOINT").replace(/^Https:/, "https:");
  const bucket = required("R2_BUCKET_NAME");
  const agent = cloudflareDnsAgent();
  const sessionToken = String(process.env.R2_SESSION_TOKEN || "").trim();
  const client = new S3Client({
    region: "auto",
    endpoint: process.env.R2_ENDPOINT,
    forcePathStyle: true,
    requestHandler: new NodeHttpHandler({ httpsAgent: agent }),
    credentials: {
      accessKeyId: required("R2_ACCESS_KEY_ID"),
      secretAccessKey: required("R2_SECRET_ACCESS_KEY"),
      ...(sessionToken ? { sessionToken } : {}),
    },
  });

  const fixtures = [
    [required("R2_QA_IMAGE"), "image/png"],
    [required("R2_QA_VIDEO"), "video/mp4"],
  ];
  const results = [];

  for (const [filename, contentType] of fixtures) {
    const body = fs.readFileSync(filename);
    const pathname = `qa/direct-upload/${Date.now()}-${crypto.randomUUID()}-${path.basename(filename)}`;
    try {
      const signedUrl = await createR2UploadUrl(pathname, contentType);
      await upload(signedUrl, body, contentType, agent);
      const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: pathname }));
      const fetched = await client.send(new GetObjectCommand({ Bucket: bucket, Key: pathname }));
      const downloaded = await bodyBuffer(fetched.Body);
      const expectedHash = crypto.createHash("sha256").update(body).digest("hex");
      const actualHash = crypto.createHash("sha256").update(downloaded).digest("hex");
      if (Number(head.ContentLength) !== body.length || expectedHash !== actualHash) {
        throw new Error(`Integrity verification failed for ${path.basename(filename)}.`);
      }
      results.push({ type: contentType, bytes: body.length, sha256: actualHash, result: "PASS" });
    } finally {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: pathname }));
    }
  }

  console.log(JSON.stringify(results, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
