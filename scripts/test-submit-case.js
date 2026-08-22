const { Readable } = require("stream");
const crypto = require("crypto");
const assert = require("assert");
const fs = require("fs");
const http = require("http");

const handler = require("../api/submit-case");

const originalFetch = global.fetch;
const originalEnv = { ...process.env };

function multipartBody({ fields = {}, files = [] }) {
  const boundary = `----yzh-test-${crypto.randomBytes(6).toString("hex")}`;
  const chunks = [];
  for (const [name, value] of Object.entries(fields)) {
    chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`));
  }
  for (const file of files) {
    chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="case_files"; filename="${file.name}"\r\nContent-Type: ${file.type || "application/octet-stream"}\r\n\r\n`));
    chunks.push(Buffer.isBuffer(file.content) ? file.content : Buffer.from(file.content || ""));
    chunks.push(Buffer.from("\r\n"));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return { boundary, body: Buffer.concat(chunks) };
}

function makeReq({ fields, files }) {
  const { boundary, body } = multipartBody({ fields, files });
  const req = Readable.from(body);
  req.method = "POST";
  req.headers = {
    "content-type": `multipart/form-data; boundary=${boundary}`,
    "content-length": String(body.length)
  };
  return req;
}

function makeRes() {
  return {
    statusCode: 200,
    headers: {},
    body: "",
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    end(chunk) {
      if (chunk) this.body += chunk;
      this.finished = true;
    }
  };
}

function baseFields(extra = {}) {
  return {
    name: "Test Lab Manager",
    email: "buyer@example.com",
    case_type: "Full Arch / All-on-X",
    company: "Test Dental Lab",
    whatsapp: "+1 555 0100",
    country: "USA",
    ...extra
  };
}

function startBlobMock({ blobOk = true } = {}) {
  const stored = new Map();
  const server = http.createServer((req, res) => {
    if (!blobOk) {
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: { code: "internal_server_error", message: "mock blob failure" } }));
      return;
    }
    const parsed = new URL(req.url, "http://127.0.0.1");
    const pathname = parsed.searchParams.get("pathname") || "unknown";
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      stored.set(pathname, Buffer.concat(chunks));
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({
        url: `https://mock.private.blob.vercel-storage.com/${pathname}`,
        downloadUrl: `https://mock.private.blob.vercel-storage.com/${pathname}?download=1`,
        pathname,
        contentType: req.headers["x-content-type"] || "application/octet-stream",
        contentDisposition: `attachment; filename="${pathname.split("/").pop()}"`,
        etag: "mock-etag"
      }));
    });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({ server, stored, url: `http://127.0.0.1:${port}` });
    });
  });
}

function installMockFetch({ emailOk = true } = {}) {
  global.fetch = async (input, init = {}) => {
    const url = String(input);
    if (url === "https://api.resend.com/emails") {
      if (!emailOk) {
        return new Response(JSON.stringify({ message: "mock email failure" }), { status: 500 });
      }
      return new Response(JSON.stringify({ id: "email_mock" }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return originalFetch(input, init);
  };
}

async function callApi({ fields = baseFields(), files = [], mock = {} }) {
  const blobMock = await startBlobMock(mock);
  installMockFetch(mock);
  process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_test_store_mock_123";
  process.env.VERCEL_BLOB_API_URL = blobMock.url;
  process.env.RESEND_API_KEY = "re_mock";
  process.env.CASE_FROM_EMAIL = "YZH Dental Lab <case@yzhdentallab.com>";
  process.env.CASE_DOWNLOAD_SECRET = "test-download-secret";
  process.env.SITE_URL = "https://yzhdentallab.com";
  if (mock.simulateStorageFailure) {
    process.env.SIMULATE_STORAGE_FAILURE = "1";
  } else {
    delete process.env.SIMULATE_STORAGE_FAILURE;
  }
  if (mock.simulateEmailFailure) {
    process.env.SIMULATE_EMAIL_FAILURE = "1";
  } else {
    delete process.env.SIMULATE_EMAIL_FAILURE;
  }

  const req = makeReq({ fields, files });
  const res = makeRes();
  try {
    await handler(req, res);
    return { status: res.statusCode, data: JSON.parse(res.body), stored: blobMock.stored };
  } finally {
    await new Promise((resolve) => blobMock.server.close(resolve));
  }
}

async function run() {
  const noFile = await callApi({});
  assert.equal(noFile.status, 200);
  assert.equal(noFile.data.ok, true);
  assert.equal([...noFile.stored.keys()].some((key) => key.endsWith("/submission.json")), true);

  const png = Buffer.from("89504e470d0a1a0a", "hex");
  const onePng = await callApi({ files: [{ name: "case-photo.png", type: "image/png", content: png }] });
  assert.equal(onePng.status, 200);
  assert.equal([...onePng.stored.values()].some((value) => value.equals(png)), true);

  const stl = Buffer.from("solid yzh\nendsolid yzh\n");
  const oneStl = await callApi({ files: [{ name: "../upper scan.stl", type: "application/octet-stream", content: stl }] });
  assert.equal(oneStl.status, 200);
  assert.equal([...oneStl.stored.keys()].some((key) => key.includes("upper-scan.stl")), true);
  assert.equal([...oneStl.stored.values()].some((value) => value.equals(stl)), true);

  const zip = Buffer.from("504b0304140000000800", "hex");
  const oneZip = await callApi({ files: [{ name: "records.zip", type: "application/zip", content: zip }] });
  assert.equal(oneZip.status, 200);
  assert.equal([...oneZip.stored.values()].some((value) => value.equals(zip)), true);

  const badExt = await callApi({ files: [{ name: "virus.exe", type: "application/octet-stream", content: "x" }] });
  assert.equal(badExt.status, 400);
  assert.equal(badExt.data.ok, false);

  const overLimit = await callApi({ files: [{ name: "large.zip", type: "application/zip", content: Buffer.alloc(26 * 1024 * 1024) }] });
  assert.equal(overLimit.status, 413);
  assert.equal(overLimit.data.ok, false);

  const storageFail = await callApi({ files: [{ name: "case-photo.jpg", type: "image/jpeg", content: "jpg" }], mock: { simulateStorageFailure: true } });
  assert.equal(storageFail.status, 500);
  assert.equal(storageFail.data.ok, false);

  const emailFail = await callApi({ files: [{ name: "case-photo.jpg", type: "image/jpeg", content: "jpg" }], mock: { simulateEmailFailure: true } });
  assert.equal(emailFail.status, 500);
  assert.equal(emailFail.data.ok, false);

  const honeypot = await callApi({ fields: baseFields({ website: "spam" }) });
  assert.equal(honeypot.status, 400);

  const missing = await callApi({ fields: baseFields({ email: "" }) });
  assert.equal(missing.status, 400);

  const frontend = fs.readFileSync("assets/site.js", "utf8");
  assert.equal(frontend.includes("Temporary Case ID"), false);
  assert.equal(frontend.includes("dataset.submitting"), true);

  console.log("submit-case tests passed");
}

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    global.fetch = originalFetch;
    Object.assign(process.env, originalEnv);
  });
