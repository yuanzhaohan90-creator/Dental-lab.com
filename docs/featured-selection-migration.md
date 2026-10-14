# Featured selection migration

## Canonical model

- `homepage.published.selectedWork.caseIds` is public membership and order.
- `homepage.draft.selectedWork.caseIds` is the editable pending membership and order.
- Missing/null is unconfigured legacy data. An explicit empty array means no Featured cases.
- `case.featured` is a compatibility mirror, not public membership.
- Home publish requires a fresh server preflight confirmation. Legacy mirror/config mismatches additionally require a confirmed import.

## Safe import

The authenticated import endpoint presents the legacy public selection, current draft, and proposed result. It validates a snapshot fingerprint before copying only the selection into the stored draft. Other stored homepage draft sections are preserved. It never publishes or changes case records.

The publish endpoint rejects a stale or unconfirmed draft with HTTP 409. After confirmation, it writes the published configuration and then synchronizes mirror flags. Case editing cannot independently override the mirror.

## Production release prerequisite

The observed production configuration has published `[]`, draft containing one old ID, and seven mirrored public cases. The existing renderer treats this empty array as a fallback. The new renderer intentionally does not.

**Do not deploy the complete canonical renderer to that production state.** Doing so would correctly interpret `[]` as zero and hide the seven currently public Featured cases before an administrator migrates them.

A separately approved two-stage rollout is required:

1. Deploy only the import/editor/publish protection to production while retaining the existing public renderer. An administrator reviews/imports the existing seven into draft, checks the difference, and publishes the same seven in the same order. Verify published IDs and mirrors are equal. No automatic data migration is authorized by this change.
2. Deploy the canonical public renderer only after published IDs are explicitly populated and verified. Keep rollback versions for both stages.

Do not automatically merge draft and mirror selections. Do not treat an intentional empty selection as unconfigured. Do not copy Preview storage to production.

## Verification

## Stage 1 candidate

The migration-only branch retains `lib/public-site-data.js`, `lib/public-page-renderer.js`, and both public `site.js` files from the stable Implant release. The public site continues legacy selection during this stage.

The migration import/save helpers change only draft selection IDs and the approval marker. The first migration publish changes only published selection IDs and the approval marker, preserving unrelated draft and published homepage sections. The publish difference shows the currently visible public IDs separately from stored published IDs.

`scripts/migrate-featured-stage1.js` is read-only by default. `--execute` is restricted to the expressly approved seven production IDs and requires a pre-existing admin password in process memory. It verifies before/after case hashes and unrelated homepage content. It performs no stage 2 deployment.

After the approved stage 1 migration, stage 2 requires separate authorization and a release carrying only the canonical public renderer changes while retaining the scoped migration protections.

`npm run test:featured-selection` checks selection semantics against the read-only public production 14-case fixture.

`npm run test:featured:worker` uses Wrangler's real local Worker test harness and isolated R2 emulator, with real browser controls. Authentication credentials are generated only in memory for the isolated test runtime. Production API use is limited to public GETs for original cover copies.

`--metadata-only` runs the same real API/storage/browser workflow without inventing images when source cover downloads fail. Missing cover copies and expected image 404s are explicitly reported as NOT TESTED; this run is not a full media regression or proof of remote Preview operation.

Screenshots and detailed reports live in untracked `test-results/featured-canonical/`. No secrets or session tokens are included in reports.
