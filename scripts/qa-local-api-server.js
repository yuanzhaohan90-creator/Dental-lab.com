const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const envFile = path.join(__dirname, "../.env.local");
for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) process.env[match[1].trim()] = match[2].trim();
}

const adminAuth = require("../api/admin-auth");
const admin = require("../api/admin");

const server = http.createServer(async (req, res) => {
  try {
    if (req.url.startsWith("/api/admin-auth")) return await adminAuth(req, res);
    if (req.url.startsWith("/api/admin")) return await admin(req, res);
    res.statusCode = 404;
    res.end("Not found");
  } catch (error) {
    console.error(error);
    if (!res.headersSent) res.statusCode = 500;
    if (!res.writableEnded) res.end("Request failed");
  }
});

const port = Number(process.env.QA_PORT || 3100);
server.listen(port, "127.0.0.1", () => console.log(`QA API ready on http://127.0.0.1:${port}`));
