# Secure Case Submission Architecture

Current implementation:

- `/api/submit-case` accepts multipart case submissions.
- Required fields are validated before any storage or notification work starts.
- Honeypot field `website` blocks spam submissions.
- File extensions are restricted server-side to STL, PLY, ZIP, PDF, JPG, JPEG and PNG.
- Request size is limited in the handler to 25MB.
- Uploaded file bytes are parsed as binary buffers, not converted through strings.
- Files are stored in Vercel Blob under `cases/{caseId}/{sanitized-filename}`.
- Submission metadata is stored as `cases/{caseId}/submission.json`.
- Internal notification is sent through Resend to `CASE_NOTIFICATION_EMAIL`.
- The customer receives success only after storage and internal notification both succeed.
- Download links in the email route through `/api/download-case-file` and require a signed token.

Required production environment variables:

- `BLOB_READ_WRITE_TOKEN`
- `RESEND_API_KEY`
- `CASE_DOWNLOAD_SECRET`
- `CASE_FROM_EMAIL`
- `CASE_NOTIFICATION_EMAIL` defaults to `yzhdentallab@gmail.com` if omitted.
- `SITE_URL` defaults to `https://yzhdentallab.com` if omitted.

Failure rules:

- Validation failure returns 400.
- Oversized request returns 413 when it reaches the function.
- Storage failure returns 500 and does not show customer success.
- Email notification failure returns 500 and does not show customer success.

Operational notes:

- Vercel server uploads have platform request-size constraints. The handler keeps the 25MB application limit, but very large requests may be rejected by the platform before the function runs. If consistent uploads above the platform limit are required, move to the Vercel Blob client-upload flow.
- Uploaded files may contain dental case information. Do not log raw file contents.
- Use lab case IDs where possible and avoid unnecessary patient-identifying information.
- Consider adding malware scanning for ZIP and design files before internal download.
