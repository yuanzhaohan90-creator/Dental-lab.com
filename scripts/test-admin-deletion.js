process.env.NODE_ENV = "test";

const assert = require("assert");
const store = require("../lib/admin-store");

const memory = new Map();

function bodyBuffer(value) {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  return Buffer.from(String(value));
}

const blobClient = {
  async put(pathname, value, options = {}) {
    const body = bodyBuffer(value);
    memory.set(pathname, { body, contentType: options.contentType || "application/octet-stream" });
    return { pathname, contentType: options.contentType, url: `https://blob.test/${pathname}` };
  },
  async get(pathname) {
    const item = memory.get(pathname);
    if (!item) return null;
    return { statusCode: 200, stream: new Blob([item.body]).stream(), blob: { size: item.body.length, contentType: item.contentType } };
  },
  async list({ prefix }) {
    return { blobs: [...memory.keys()].filter((pathname) => pathname.startsWith(prefix)).map((pathname) => ({ pathname })), hasMore: false };
  },
  async del(paths) {
    for (const pathname of Array.isArray(paths) ? paths : [paths]) memory.delete(pathname);
  }
};

store._setBlobClientForTests(blobClient);

const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0, 1, 2, 3]);
const isoVideo = (codec) => Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from("ftypisom0000"), Buffer.from(codec)]);

async function media(filename, contentType, bytes) {
  return store.storeMediaFile({ filename, contentType, buffer: bytes }, { displayName: filename, category: "Other" });
}

async function seedConfig(name, config) {
  await blobClient.put(`admin/config/${name}.json`, JSON.stringify(config), { contentType: "application/json" });
}

(async () => {
  const oldMedia = await media("old.jpg", "image/jpeg", jpeg);
  const replacement = await media("replacement.jpg", "image/jpeg", jpeg);
  const homepage = structuredClone(store.DEFAULT_HOMEPAGE);
  homepage.hero.media = { ...homepage.hero.media, mediaId: oldMedia.id, fallbackPath: "" };
  await seedConfig("homepage", { draft: structuredClone(homepage), published: structuredClone(homepage), previous: null });

  const usage = await store.mediaUsage(oldMedia.id);
  assert.equal(usage.length, 2);
  assert(usage.every((item) => item.label.includes("首页 → 首屏")));
  await assert.rejects(() => store.updateMediaReferences({ mediaId: oldMedia.id, usageIds: usage.map((item) => item.id), mode: "remove" }), (error) => error.statusCode === 409);

  await store.updateMediaReferences({ mediaId: oldMedia.id, usageIds: usage.map((item) => item.id), replacementId: replacement.id, mode: "replace" });
  assert.equal((await store.mediaUsage(oldMedia.id)).length, 0);
  assert.equal((await store.mediaUsage(replacement.id)).length, 2);
  await store.trashMedia(oldMedia);
  assert.equal((await store.listMedia()).some((item) => item.id === oldMedia.id), false);
  assert.equal((await store.listMedia({ trash: true })).some((item) => item.id === oldMedia.id), true);
  await store.restoreMedia(await store.getMedia(oldMedia.id));
  assert.equal((await store.listMedia()).some((item) => item.id === oldMedia.id), true);

  const removable = await media("removable.jpg", "image/jpeg", jpeg);
  const draft = structuredClone(store.DEFAULT_HOMEPAGE);
  draft.technicalProof.media = { ...draft.technicalProof.media, mediaId: removable.id, fallbackPath: "/fallback.jpg" };
  await seedConfig("homepage", { draft, published: structuredClone(store.DEFAULT_HOMEPAGE), previous: null });
  const removableUsage = await store.mediaUsage(removable.id);
  await store.updateMediaReferences({ mediaId: removable.id, usageIds: removableUsage.map((item) => item.id), mode: "remove" });
  assert.equal((await store.mediaUsage(removable.id)).length, 0);
  await store.trashMedia(removable);

  const unused = await media("unused.jpg", "image/jpeg", jpeg);
  await store.trashMedia(unused);
  await store.restoreMedia(await store.getMedia(unused.id));
  assert.equal(Boolean((await store.getMedia(unused.id)).trashedAt), false);

  const logo = await media("logo.jpg", "image/jpeg", jpeg);
  const settings = { ...store.DEFAULT_SETTINGS, primaryLogoMediaId: logo.id, faviconMediaId: logo.id };
  await seedConfig("settings", { draft: structuredClone(settings), published: structuredClone(settings), previous: null });
  const brandingUsage = await store.mediaUsage(logo.id);
  assert.equal(brandingUsage.some((item) => item.label.includes("网站设置 → 主 Logo")), true);
  assert.equal(brandingUsage.some((item) => item.label.includes("网站设置 → 浏览器图标")), true);
  const linkedInSettings = await store.saveConfigDraft("settings", store.DEFAULT_SETTINGS, { ...settings, linkedinUrl: "https://www.linkedin.com/company/yzh-dental-lab" }, store.normalizeSettings);
  assert.equal(linkedInSettings.draft.linkedinUrl, "https://www.linkedin.com/company/yzh-dental-lab");

  const mp4 = await media("sample.mp4", "video/mp4", isoVideo("avc1"));
  const mov = await media("sample.mov", "video/quicktime", isoVideo("hvc1"));
  await store.saveMedia({ ...mp4, posterMediaId: oldMedia.id });
  const posterUsage = await store.mediaUsage(oldMedia.id);
  assert.equal(posterUsage.some((item) => item.label.includes("视频海报")), true);
  await store.updateMediaReferences({ mediaId: oldMedia.id, usageIds: posterUsage.map((item) => item.id), replacementId: replacement.id, mode: "replace" });
  assert.equal((await store.getMedia(mp4.id)).posterMediaId, replacement.id);
  await store.trashMedia(mp4);
  await store.restoreMedia(await store.getMedia(mp4.id));
  await store.trashMedia(mov);
  await store.deleteMedia(await store.getMedia(mov.id));
  assert.equal(await store.getMedia(mov.id), null);

  const expiredMedia = await media("expired.jpg", "image/jpeg", jpeg);
  await store.saveMedia({ ...expiredMedia, trashedAt: "2020-01-01T00:00:00.000Z", trashExpiresAt: "2020-01-02T00:00:00.000Z" });
  await store.listMedia({ trash: true });
  assert.equal(await store.getMedia(expiredMedia.id), null);

  const caseId = "YZH-202608280001-ABCDEF";
  const attachmentPath = `cases/${caseId}/files/test.stl`;
  await blobClient.put(attachmentPath, Buffer.from("stl-data"));
  await blobClient.put(`cases/${caseId}/submission.json`, JSON.stringify({ caseId, submittedAt: new Date().toISOString(), fields: { name: "QA Customer" }, files: [{ pathname: attachmentPath, filename: "test.stl", size: 8, contentType: "model/stl" }] }), { contentType: "application/json" });
  await store.saveSubmissionStatus(caseId, "Archived");
  assert.equal((await store.getSubmission(caseId)).status, "Archived");
  await store.deleteSubmissionFiles(caseId);
  assert.equal(memory.has(attachmentPath), false);
  assert.equal((await store.getSubmission(caseId)).files.length, 0);
  await store.trashSubmission(caseId);
  assert.equal((await store.getSubmission(caseId)).status, "Trash");
  await store.restoreSubmission(caseId);
  assert.equal((await store.getSubmission(caseId)).status, "Archived");
  await store.trashSubmission(caseId);
  await store.permanentlyDeleteSubmission(caseId);
  assert.equal(await store.getSubmission(caseId), null);

  console.log("admin deletion and trash tests passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
