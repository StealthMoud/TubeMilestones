# API and data policy

## Provider responsibilities

| System           | Responsibility                                                                      | Explicitly not responsible for                          |
| ---------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------- |
| GitHub Pages     | HTML, CSS, JavaScript, static assets                                                | secrets, API calls with elevated credentials, user data |
| Supabase         | application identity, sessions, hot Postgres data, RLS, Edge Functions, Vault, Cron | public archive delivery                                 |
| Google / YouTube | OAuth authorization and source channel/Analytics data                               | TubeMilestones persistence                              |
| Cloudflare R2    | encrypted older monthly history                                                     | browser access, plaintext data, identity                |
| GitHub           | source, migrations, tests, documentation                                            | runtime analytics database                              |

## Google permissions

Supabase Auth Google login is application identity and requests only `openid email
profile`. It does not grant YouTube data access.

The separate server-side YouTube OAuth client requests exactly:

```text
https://www.googleapis.com/auth/youtube.readonly
https://www.googleapis.com/auth/yt-analytics.readonly
```

The app cannot upload, edit, delete, or manage YouTube content. The callback validates a
usable YouTube channel before committing a new connection.

## Data read from YouTube

- Channel ID, title, thumbnail, creation date, uploads playlist, and public statistics
- Daily views, estimated minutes watched, subscribers gained/lost, average view duration,
  and average view percentage where supported
- Report availability dates needed to present freshness honestly

Daily reports use Google's `startIndex`/`maxResults` pagination and header-based parsing
so initial history is not silently truncated or coupled to response-column order. The
first daily import is bounded to the later of channel publication or a 400-day inclusive
window. Subsequent foreground syncs request the rolling 120-day window. The aggregate
watch-time summary can still query from the channel publication date without writing a
full lifetime of daily rows.

YouTube may round subscriber counts or hide them. TubeMilestones preserves that state and
does not invent precision.

## Data written by users

Users may set theme, selected channel, custom goals, target dates, qualified public watch
hours, and qualified Shorts views. YPP values are not sent to Google and are not treated
as official eligibility data.

## Browser data

TanStack Query holds server state in memory. Supabase session material uses the Supabase
Auth client storage contract, with a sanitizing adapter that removes Google
`provider_token` and `provider_refresh_token` fields before persistence. The browser does
not store a Google YouTube refresh token and IndexedDB is not an authoritative database.

## Hot and cold history

Approximately 120 days of daily analytics and snapshots remain hot in Postgres. Only
complete older calendar months are candidates for archive. Edge Functions gzip and
encrypt monthly payloads before writing them to private R2, verify object metadata,
download/decrypt/checksum/parse/row counts, mark the manifest `READY`, and only then
delete the corresponding hot rows.

History queries merge hot and cold rows by date with hot data winning. The Available
range therefore means all history the service currently has, not a guaranteed channel
lifetime. A cold-storage failure returns verified hot data plus a typed partial warning
when possible.

## Retention and compliance

Normal sync is foreground-driven. Cron is limited to authorization/compliance validation
and deletion retry work. Authorization is revalidated after 25 days through bounded,
oldest-first atomic claims; transient failures retry while the data is held, and the
30-day boundary or a permanent grant failure queues the purge lifecycle. Deletions also
use owner-bound atomic claims with stale-worker recovery. See
[Data retention](DATA_RETENTION.md).

## Logging and tracking

Structured Edge logs include operation names, request correlation IDs, status, and safe
error codes. They must not include OAuth codes, access or refresh tokens, secrets,
archive plaintext, API response bodies, or user Analytics values. No third-party product
analytics or advertising tracker is included.

## Errors

Server responses use typed stable codes such as `AUTH_REQUIRED`, `SYNC_COOLDOWN`,
`SYNC_IN_PROGRESS`, `YOUTUBE_REAUTH_REQUIRED`, `R2_UNAVAILABLE`, and
`ARCHIVE_CORRUPT`. The frontend maps them to contextual, non-sensitive copy. Internal
provider responses and secrets are never forwarded verbatim.
