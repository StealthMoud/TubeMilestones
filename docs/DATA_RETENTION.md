# Data retention and deletion

## Retention classes

| Data                          | Location              | Normal retention                          |
| ----------------------------- | --------------------- | ----------------------------------------- |
| Supabase identity/profile     | Auth + Postgres       | account lifetime                          |
| Current channel and summaries | Postgres              | while connected/account active            |
| Daily analytics and snapshots | Postgres hot tier     | approximately 120 days                    |
| Complete older months         | private R2 ciphertext | while connected/account active            |
| Milestones and goals          | Postgres              | while connected/account active            |
| Google YouTube refresh token  | Supabase Vault        | while authorization is valid              |
| OAuth attempts                | server-only Postgres  | ten-minute validity; expired rows cleaned |
| Deletion request audit        | server-only Postgres  | retained to make outcome visible          |

The 120-day boundary is approximate because only complete calendar months older than the
cutoff are archived. A first daily import requests at most 400 inclusive days (or less
for a newer channel); later syncs request the rolling 120-day window. This bounds initial
storage/quota while still providing archive-ready history. Maintenance processes at most
12 candidate months per run. A future explicit `historical-backfill` workflow may extend
coverage, but v1 does not automatically fetch the channel's complete daily lifetime.

## Archive eligibility

Hot rows are never deleted simply because they are old. A month is removable only after
the encrypted object has been uploaded, HEAD metadata checked, downloaded, checksum
verified, decrypted, parsed, row counts compared, and its manifest marked `READY`.
Interrupted states remain recoverable. If hot deletion then fails, duplicate hot/cold
dates are safe because hot rows win during reads.

## Authorization compliance

The daily compliance worker atomically claims the oldest connections whose authorization
has not been verified for 25 days. It processes batches of 50, at most four batches per
invocation, throttles a failed retry for 23 hours, and recovers claims older than ten
minutes. A successful refresh/scope check updates verification time and retains data.
Transient provider/network failures retry without immediately erasing history. A
permanent grant failure such as `invalid_grant`, or reaching 30 days without successful
verification, places the connection on compliance hold and queues a purge request.

This job verifies authorization only. There is intentionally no daily global YouTube
Analytics sync Cron; normal sync is driven by active users to control quota and cost.

## Explicit disconnect

Disconnect removes the YouTube authorization and authorized TubeMilestones data but does
not delete anything from YouTube. The operation creates a durable request and runs:

1. Best-effort Google token revocation
2. Vault refresh-token deletion
3. R2 user/channel object deletion and verified absence
4. Channels, analytics, snapshots, milestones, goals, manual values, manifests, and
   connection rows in Postgres

If Google revocation is unavailable, local/provider-stored data removal continues. A
failure in R2 or database deletion is recorded as retryable rather than hidden.

## Account deletion

Account deletion uses the same provider/data purge, then removes the profile and
Supabase Auth user. The durable audit record does not depend on an `auth.users` foreign
key, so it can record completion or failure after the identity is gone. Duplicate active
requests are idempotently returned.

## Retry lifecycle

```text
PENDING → RUNNING → COMPLETE
             └────> FAILED_RETRYABLE → RUNNING
                                  └──> FAILED_FINAL after bounded attempts
```

The deletion worker atomically claims up to 25 oldest requests per daily run. Claiming
sets `RUNNING`, records a unique owner, and increments attempts exactly once. Final
updates are accepted only from that owner; another worker skips the active claim. A
`RUNNING` request older than 15 minutes is recoverable after a crash. Ten failed attempts
are final. Operators must investigate `FAILED_FINAL`; the UI and documentation must not
represent those requests as complete.

## Free-project operational risk

Supabase free projects may pause after inactivity. A paused project cannot run Cron or
Edge cleanup until resumed. Production operators must monitor project activity and job
execution; if the provider tier cannot meet deletion/compliance timing, upgrade or move
the workload. Architecture alone does not eliminate that operational responsibility.
