import { upload } from "@vercel/blob/client";

window.yzhUploadMedia = async function yzhUploadMedia(file, metadata, onProgress) {
  const safeName = String(file.name || "media")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "media";
  return upload(`admin/media/files/${Date.now()}-${safeName}`, file, {
    access: "private",
    handleUploadUrl: "/api/admin?module=media-upload",
    multipart: file.size > 8 * 1024 * 1024,
    clientPayload: JSON.stringify(metadata || {}),
    onUploadProgress: ({ percentage }) => onProgress?.(Math.round(percentage))
  });
};
