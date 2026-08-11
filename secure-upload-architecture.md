# Secure Case Submission Architecture

Current implementation:

- `/api/submit-case` accepts multipart case submissions.
- Required fields are validated before a Case ID is returned.
- File extensions are restricted to STL, PLY, ZIP, PDF, JPG, JPEG and PNG.
- Request size is limited to 25MB.
- Submissions are logged by Case ID for deployment-level review.

Production hardening still recommended:

- Add persistent encrypted file storage such as S3, Vercel Blob, Google Cloud Storage or Cloudflare R2.
- Store submission metadata in a database with Case ID, timestamp, contact details and file list.
- Add email notification through a transactional provider such as Resend, SendGrid or Postmark.
- Add spam protection using a honeypot field plus rate limiting by IP and email.
- Add malware scanning for uploaded ZIP and design files before internal download.
- Add a patient privacy reminder near the upload field and in the confirmation email.
- Avoid unnecessary patient-identifying information; use lab case IDs where possible.
