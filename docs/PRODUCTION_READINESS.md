# Production readiness

This file separates repository-complete work from owner/runtime work. A green source
tree does not prove that Google, Supabase, R2, Cron, or GitHub variables are configured.

## Repository-complete controls

- [x] Static Pages frontend contains no trusted provider SDK or elevated credential path
- [x] Supabase Auth identity and separate server YouTube authorization are implemented
- [x] Migrations define the hot data model, RLS, grants, Vault helpers, and Cron installer
- [x] Eight Edge entrypoints share typed OAuth, sync, archive, history, and deletion logic
- [x] Refresh tokens are referenced through Vault helpers, not browser-visible tables
- [x] Hot/cold archive uses gzip, per-user HKDF keys, AES-256-GCM, checksum, and manifests
- [x] Deletion is durable, ordered, idempotent, retryable, and does not depend on revocation
- [x] Browser reads exact bigint strings and rejects values beyond safe display precision
- [x] Unit/component/backend/security and responsive browser tests are present
- [x] Pages build accepts only URL and publishable-key variables
- [x] Privacy, retention, security, provider setup, and deployment documents match the code

## Owner actions required before real production use

- [ ] Create/select the production Supabase project and region
- [ ] Configure Supabase Auth Google Client A and exact redirect allowlist
- [ ] Apply migrations and regenerate database types from the live schema
- [ ] Configure Google Client B, APIs, consent screen, test users, and verification
- [ ] Create a private bucket and bucket-scoped R2 credential
- [ ] Set `FRONTEND_URL`, Google, R2, and `ARCHIVE_MASTER_KEY_V1` Edge secrets
- [ ] Deploy all Edge Functions
- [ ] Store Cron URL/automation key in Vault and install the two jobs
- [ ] Perform a real archive write/read/delete/absence test
- [ ] Perform two-user RLS and callback replay/expiry tests against the live project
- [ ] Exercise disconnect and account-delete retry behavior with test identities
- [ ] Add the two GitHub repository variables and confirm Pages Actions source
- [ ] Complete any required Google OAuth verification before public access
- [ ] Establish monitoring for paused projects, Cron failures, `FAILED_FINAL` deletion,
      R2 errors, quota, and key rotation
- [ ] Before significant public use with retained Authorized Data, select a backend tier
      that will not pause required compliance/deletion work

## Release evidence to retain

- Exact Git commit and green CI/Pages run URLs
- Supabase migration version and generated-types diff
- Edge deployment versions and sanitized smoke-test request IDs
- RLS two-user test results
- R2 archive manifest/object verification result without data or secrets
- Google OAuth client IDs (public identifiers only), callback URLs, and consent status
- Cron job names/schedules plus most recent successful counts
- Bundle secret scan and live response/header audit

## Known limitations

- Without the two Vite variables, the deployment intentionally renders an unconfigured
  sign-in state.
- Without Google/R2/archive secrets, those Edge operations return typed configuration or
  partial-history errors; no fallback writes data to GitHub or the browser.
- Free Supabase pausing can delay Cron until the project resumes.
- Supabase accounts may have only a small number of active free projects. Keep
  TubeMilestones isolated; if no slot is available, pause an unused project, upgrade, or
  postpone the live backend. Do not merge it into an unrelated database merely to save a
  slot, and do not generate artificial keep-alive traffic to evade pausing policy.
- GitHub Pages does not provide repository-controlled custom response security headers.
- Subscriber counts retain YouTube rounding/hidden limitations.
- Analytics can lag and some combined metric requests require the implemented fallback.
- TubeMilestones does not determine YPP eligibility and has no automatic global sync Cron.
- Key loss makes matching encrypted archives unrecoverable; key backup/rotation is an
  operator responsibility.

## Go/no-go rule

The source implementation may be merged and deployed in an unconfigured state, but it
must not be described as a live connected production service until every applicable owner
action above has evidence. Missing provider configuration is a known deployment state,
not permission to weaken the architecture.
