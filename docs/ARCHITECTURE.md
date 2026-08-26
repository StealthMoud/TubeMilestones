# Architecture

TubeMilestones uses a static presentation tier, a trusted hot-data backend, and encrypted
cold object storage. Provider credentials never cross into the GitHub Pages bundle.

## System boundary

```text
┌──────────────────────────────┐
│ GitHub Pages                 │
│ React + TypeScript + Vite    │
│ HashRouter + TanStack Query  │
└──────────────┬───────────────┘
               │ Supabase user JWT
               v
┌──────────────────────────────────────────────────┐
│ Supabase                                         │
│ Auth │ Postgres + RLS │ Edge │ Vault │ Cron      │
│                                                  │
│ hot current state, ~120 days, milestones, goals  │
└──────────┬───────────────────────────┬───────────┘
           │ trusted provider calls    │ encrypted archive
           v                           v
┌──────────────────────┐       ┌───────────────────┐
│ Google OAuth /       │       │ Cloudflare R2     │
│ YouTube APIs         │       │ private cold data │
└──────────────────────┘       └───────────────────┘
```

GitHub is source control only. User data is not committed, attached to workflow
artifacts, or published in releases.

## Browser to Supabase

```text
Browser ── Google identity login ──> Supabase Auth
Browser <────── Supabase session ─── Supabase Auth
Browser ── JWT + query/function ───> Postgres RLS / Edge Function
Browser <──── own rows / typed data ─ Supabase
```

The frontend uses the current publishable key. Postgres browser reads and the small set
of user-authored writes are protected by RLS and column/table grants. Trusted derived
writes occur through Edge Functions with an elevated server client.

## Supabase to Google OAuth

```text
Authenticated browser
  └─> youtube-oauth-start
        ├─ creates 32-byte random state; stores SHA-256 hash + PKCE verifier
        ├─ expires attempt after 10 minutes
        └─ returns accounts.google.com authorization URL

Google callback
  └─> youtube-oauth-callback (public transport endpoint)
        ├─ atomically consumes state once
        ├─ validates expiry and PKCE
        ├─ exchanges code with server client secret
        ├─ verifies exact scopes and a usable YouTube channel
        ├─ stores/rotates refresh token through a Vault helper
        └─ redirects only to configured FRONTEND_URL callback state
```

The callback has JWT verification disabled because Google cannot supply a Supabase JWT.
Its authority comes only from high-entropy, hashed, single-use, expiring state plus PKCE;
the redirect destination is fixed server configuration, not request input.

## Supabase to YouTube

```text
Browser ── JWT ──> youtube-sync
                    ├─ atomic five-minute cooldown claim
                    ├─ three-minute overlap lock
                    ├─ Vault refresh-token read
                    ├─ Google access-token refresh / rotation
                    ├─ YouTube Data + Analytics reads
                    ├─ exact-string parsing for large integers
                    ├─ channel, summary, daily, snapshot writes
                    └─ milestone detection + sync completion
```

A failed reconnect does not destroy an existing valid connection. `invalid_grant` becomes
a typed reauthorization state. A reconnect that does not return the required offline
refresh token fails before any channel, Vault, or connection mutation. Initial daily
Analytics import starts at the later of the channel publication date or 399 days before
today, so the inclusive request is at most 400 days; later foreground syncs use the
rolling 120-day window. The aggregate watch-time query still starts at the channel
publication date. Unsupported combined Analytics metrics fall back to smaller reports
and are merged by returned column headers.

## Supabase hot to R2 cold

```text
complete month older than hot cutoff
        ↓
canonical JSON payload
        ↓ gzip
AES-256-GCM envelope using per-user HKDF key + random IV
        ↓
private R2 object
        ↓ HEAD + metadata verify
download + checksum + decrypt + parse + row-count verify
        ↓
manifest READY
        ↓
delete exactly archived hot rows
```

The object key is `archive/{user_id}/{channel_id}/YYYY/MM.tmar`. The encrypted
binary envelope begins with the `TMAR` magic, format version, key version, IV, ciphertext,
and authentication tag. New writes use `ARCHIVE_ACTIVE_KEY_VERSION` and its exact
`ARCHIVE_MASTER_KEY_VN`; readers resolve the version recorded in the manifest/envelope
and never fall back to a different key. Manifest states make interrupted uploads
recoverable.

## R2 history to browser

```text
Browser ── JWT + range ──> history-query
                            ├─ reads hot Postgres rows
                            ├─ selects overlapping READY manifests
                            ├─ downloads/decrypts/verifies R2 objects
                            └─ merges by day; hot wins
Browser <── unified rows + optional typed partial warning
```

R2 credentials and plaintext never reach the browser. 7D/28D/90D normally avoid R2;
365D and Available request cold history only when needed.

## Scheduled worker claims

Cron sends a public Supabase publishable key only for platform routing and a separate
high-entropy secret in `X-TubeMilestones-Automation` for TubeMilestones authorization.
The application secret is never a Supabase secret/service-role key.

The daily compliance worker claims the oldest due connections atomically in batches of
50, with `FOR UPDATE SKIP LOCKED`, a 23-hour retry throttle, and ten-minute stale-claim
recovery. One invocation processes at most four batches (200 connections), allowing a
following invocation to continue without permanently starving older null verification
timestamps. It performs refresh/scope validation only and queues permanent or 30-day
failures for the deletion pipeline.

The deletion worker atomically claims up to 25 oldest requests. A claim changes the row
to `RUNNING` and increments attempts exactly once; completion/failure updates require the
same claim ID. A `RUNNING` claim older than 15 minutes is reclaimable after a crash.

## Deletion across providers

```text
User disconnect/account delete
        ↓ persistent data_deletion_request
best-effort Google revocation
        ↓
delete Vault credential
        ↓
list/delete R2 prefix and verify absence
        ↓
delete authorized Postgres rows
        ↓
optional profile + Supabase Auth user removal
        ↓
COMPLETE, or FAILED_RETRYABLE for Cron
```

Revocation failure cannot strand stored data. R2 absence is verified before authoritative
database records are removed. The audit request deliberately survives account deletion
without an `auth.users` foreign key. Repeated account-delete requests return the existing
active request instead of creating competing purges.

## Data model

| Table                    | Purpose                                   | Browser boundary                 |
| ------------------------ | ----------------------------------------- | -------------------------------- |
| `profiles`               | theme and selected channel                | read own; update two own columns |
| `youtube_connections`    | grant, verification, sync lifecycle       | read own                         |
| `youtube_token_vault`    | Vault secret references                   | server only                      |
| `channels`               | current channel identity and statistics   | read own                         |
| `channel_snapshots`      | observed historical state                 | read own                         |
| `analytics_daily`        | hot daily Analytics                       | read own                         |
| `analytics_summary`      | reporting coverage and watch-time summary | read own                         |
| `milestone_states`       | derived standard/custom checkpoint state  | read own; RPC marks seen         |
| `custom_goals`           | user-created goals                        | own CRUD                         |
| `manual_metrics`         | user-entered YPP guidance                 | own CRUD                         |
| `archive_manifests`      | encrypted cold object metadata            | read own                         |
| `youtube_oauth_attempts` | state hash and PKCE verifier              | server only                      |
| `data_deletion_requests` | durable purge lifecycle                   | server only                      |

## Source layout

```text
src/auth/                    Supabase identity session
src/services/supabase/       frontend repository and typed actions
src/hooks/                    query-backed application state
src/features/                 route UI
src/fixtures/                 test-only demo provider
supabase/migrations/          schema, RLS, Vault and trusted functions
supabase/functions/_shared/   OAuth, sync, archive, history, deletion logic
supabase/functions/*/         Edge entrypoints
supabase/database.types.ts    checked-in generated-style schema snapshot
e2e/                          responsive browser contracts
```

Regenerate database types after applying migrations to a linked project using the
official command recorded at the top of `supabase/database.types.ts`; review the diff
before committing it.
