# Production readiness

This file separates repository-complete work from owner/runtime work. A green source
tree does not prove that Google, Supabase, R2, Cron, or GitHub variables are configured.

## Repository-complete controls

- [x] Static Pages frontend contains no trusted provider SDK or elevated credential path
- [x] Supabase Auth identity and separate server YouTube authorization are implemented
- [x] Email/password signup, confirmation, login, recovery, and add/change password use
      Supabase Auth directly without an application password store
- [x] One TubeMilestones user can own multiple independently identified YouTube connections
- [x] Migrations define the hot data model, RLS, grants, Vault helpers, and Cron installer
- [x] Eight Edge entrypoints share typed OAuth, sync, archive, history, and deletion logic
- [x] Refresh tokens are mapped per connection through Vault helpers, not browser-visible tables
- [x] Hot/cold archive uses gzip, per-user HKDF keys, AES-256-GCM, checksum, and manifests
- [x] Deletion is durable, ordered, idempotent, retryable, and does not depend on revocation
- [x] Sync, compliance, disconnect, and deletion work is claimed and executed per connection
- [x] Browser reads exact bigint strings and rejects values beyond safe display precision
- [x] Unit/component/backend/security and responsive browser tests are present
- [x] Initial daily Analytics import is bounded to 400 days; later syncs use 120 days
- [x] Pages build accepts only URL, publishable-key, and public-contact variables
- [x] Cron application authorization is independent from Supabase server credentials
- [x] Archive writers select an explicit active version; readers never fall back keys
- [x] Privacy, retention, security, provider setup, and deployment documents match the code

## Must complete before public release

- [ ] Buy/select an owned production domain and complete the documented cutover
- [ ] Verify that domain in Google Search Console
- [x] Publish the real private privacy/support contact email
- [x] Create/select the isolated production Supabase project and region
- [x] Create the private production R2 bucket and bucket-scoped credential
- [x] Configure Supabase Auth Google Client A and the exact redirect allow-list
- [x] Enable the Supabase Email provider, new signups, and email confirmation
- [x] Configure separate server-side YouTube Google Client B
- [ ] Configure OAuth test users while the consent screen remains in testing
- [ ] Complete Google OAuth verification wherever Google requires it
- [x] Generate a dedicated `TUBEMILESTONES_AUTOMATION_SECRET`, independent from
      Supabase secret/service-role credentials
- [x] Generate and back up `ARCHIVE_MASTER_KEY_V1`; set
      `ARCHIVE_ACTIVE_KEY_VERSION=1`
- [x] Configure every documented Edge Function secret, including `FRONTEND_URL` and the
      explicit `TUBEMILESTONES_ALLOWED_ORIGINS`
- [x] Apply migrations, regenerate/refine database types, and deploy every changed
      Edge Function
- [x] Store the project URL, public publishable key, and dedicated automation secret in
      Cron Vault; install and exercise both jobs
- [x] Add the four public GitHub repository variables and confirm Pages Actions source
- [ ] Pass a live two-user RLS/server-only RPC isolation test
- [ ] Pass real Google sign-in and YouTube OAuth/reconnect/callback tests
- [ ] Pass a real initial and repeat YouTube sync
- [ ] Pass a real disconnect including provider/local cleanup
- [ ] Pass a real account deletion including retry/readback behavior
- [ ] Pass a real R2 write/HEAD/read/decrypt/delete/verified-absence round trip
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

- Without Supabase Vite variables, the deployment intentionally renders an unconfigured
  sign-in state. Without the contact variable, Privacy clearly reports that private
  support is not configured and public OAuth release is blocked.
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
