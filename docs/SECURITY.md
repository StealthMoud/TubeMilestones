# Security model

Security relies on narrow browser credentials, authenticated Edge boundaries, Postgres
grants plus RLS, server-only token/archive access, and recoverable deletion. Static
hosting is never treated as a secret-bearing runtime.

## Credential boundary

| Credential                       | Browser  | Supabase trusted runtime | Persistent location                |
| -------------------------------- | -------- | ------------------------ | ---------------------------------- |
| Supabase publishable key         | yes      | yes                      | public build configuration         |
| Supabase user session            | yes      | verified by Auth         | sanitized Auth client storage      |
| Google identity provider token   | stripped | Supabase Auth only       | not retained by app storage        |
| Google YouTube access token      | no       | short-lived use          | function memory only               |
| Google YouTube refresh token     | no       | yes                      | Supabase Vault reference only      |
| Google YouTube client secret     | no       | yes                      | Edge secret                        |
| Supabase secret/service-role key | no       | database administration  | hosted runtime                     |
| TubeMilestones automation secret | no       | Cron worker auth         | Edge secret + Cron Vault reference |
| R2 access and secret keys        | no       | yes                      | Edge secrets                       |
| Archive master key               | no       | yes                      | versioned Edge secret              |

Frontend code rejects unconfigured cloud state and only accepts an HTTPS Supabase URL
plus current publishable key outside localhost. A storage adapter recursively strips
`provider_token` and `provider_refresh_token` before Supabase Auth state is persisted.
Edge CORS accepts only strictly parsed origins from `TUBEMILESTONES_ALLOWED_ORIGINS`,
always including the canonical `FRONTEND_URL` origin. Wildcards, URL paths, credentials,
and production localhost entries are rejected.

## RLS and grants audit

Every application table has RLS enabled. `anon` receives no table privileges. “Own user”
below means rows whose `user_id = auth.uid()` and, for child writes, a channel owned by
that same user. Elevated server access uses a secret/service-role client.

| Table                    | anon | own user                                    | other user | server             |
| ------------------------ | ---- | ------------------------------------------- | ---------- | ------------------ |
| `profiles`               | none | read; update `theme`, `selected_channel_id` | none       | read/write         |
| `youtube_connections`    | none | read                                        | none       | read/write         |
| `youtube_token_vault`    | none | none                                        | none       | read/write helpers |
| `channels`               | none | read                                        | none       | read/write         |
| `channel_snapshots`      | none | read                                        | none       | read/write         |
| `analytics_daily`        | none | read                                        | none       | read/write         |
| `analytics_summary`      | none | read                                        | none       | read/write         |
| `milestone_states`       | none | read; mark own celebration seen through RPC | none       | read/write         |
| `custom_goals`           | none | create/read/update/delete                   | none       | read/write         |
| `manual_metrics`         | none | create/read/update/delete                   | none       | read/write         |
| `archive_manifests`      | none | read metadata                               | none       | read/write         |
| `youtube_oauth_attempts` | none | none                                        | none       | read/write         |
| `data_deletion_requests` | none | none                                        | none       | read/write         |

Server-only tables still have RLS enabled and intentionally have no browser policies.
Sensitive refresh-token helpers, sync claims, OAuth-attempt consumption, and Cron setup
revoke execution from public/browser roles. The celebration RPC is `SECURITY DEFINER` but
can only set `celebration_seen=true` where the row user matches `auth.uid()`; direct table
update is not granted.

## OAuth callback security

- The public callback is transport-public, not authority-public.
- Start requires a verified Supabase user JWT.
- State uses 32 random bytes; only its SHA-256 hash is stored.
- Attempts expire after ten minutes and are atomically consumed once.
- PKCE uses S256 and a high-entropy verifier.
- The redirect destination is the configured `FRONTEND_URL`, never a request parameter.
- The token exchange and client secret stay on the server.
- Granted scopes and a usable channel are validated before state mutation.
- A reconnect failure preserves an existing credential/connection.
- Responses and logs never echo codes, tokens, verifier, state, or provider payloads.

## Edge authorization

User functions extract `Authorization: Bearer …` and call Supabase Auth `getUser` before
using the elevated client. Resource access is always tied to that verified user ID.
Compliance and deletion workers have JWT verification disabled only because Cron calls
them. The Supabase `apikey` header carries only the public publishable key needed for
platform routing. TubeMilestones itself compares `X-TubeMilestones-Automation` against
the independent `TUBEMILESTONES_AUTOMATION_SECRET` in constant time. A Supabase
secret/service-role key is not accepted as the application automation password.

## Archive security

R2 is private, bucket-scoped, and server-only. Monthly payloads are gzip-compressed and
AES-256-GCM encrypted with a per-user HKDF-SHA-256 key and random IV. Object metadata,
SHA-256, authenticated decryption, JSON shape, and row counts are verified before a
manifest is trusted. `ARCHIVE_ACTIVE_KEY_VERSION` selects the exact versioned master key
for new writes. Reads resolve only the version referenced by the manifest/envelope; a
missing historical key returns a sanitized `ARCHIVE_KEY_UNAVAILABLE` error and never
falls back. Rotation keeps old keys until no manifest references them.

## Deletion security

Deletion creates a durable request before work. The purge order is best-effort Google
revocation, Vault credential deletion, R2 prefix deletion plus absence verification,
authorized Postgres removal, and optional Auth deletion. Revocation failure never blocks
data removal. Failures stay visible as retryable or final audit states; Cron retries a
bounded number of times.

## Logging and dependencies

Structured logs include correlation/operation/status/error codes only. Tests scan
frontend source for provider SDKs, secret names, credential-shaped literals, and unsafe
logging. CI separately scans built HTML, CSS, and JavaScript for backend secret names and
credential shapes; source maps are disabled in the production bundle. Dependencies are
locked through `package-lock.json`, npm audit is expected to remain clean, and CI
independently checks frontend, Edge entrypoints, migrations, pgTAP claim behavior, and
browsers.

## Static-host security headers

GitHub Pages does not offer repository-controlled custom response headers. The app uses
HTTPS, avoids inline application scripts, ships no third-party tracking, and constrains
provider calls in code, but a response-header CSP/HSTS policy cannot be asserted by this
repository alone. If strict custom headers are a launch requirement, place a controlled
CDN/reverse proxy in front of Pages and validate the actual deployed responses before
claiming coverage.
