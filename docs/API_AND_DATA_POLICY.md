# API and Data Policy Guardrails

This document is a maintenance contract. Future changes must preserve these constraints
unless the product owner explicitly revises the product and verifies current Google and
YouTube policies.

## Minimum scopes only

TubeMilestones requests:

```text
https://www.googleapis.com/auth/youtube.readonly
https://www.googleapis.com/auth/yt-analytics.readonly
```

Do not add upload, write, comment, channel-management, or broad Google account scopes for
V1 features. New scope requests require a product need, privacy review, consent-screen
update, documentation, and likely renewed OAuth verification.

## Token handling

- Use `google.accounts.oauth2.initTokenClient` in the browser.
- Keep the active access token in memory only.
- Never write it to IndexedDB, localStorage, sessionStorage, cookies, logs, URLs, route
  state, Analytics, or error reports.
- Never add a client secret to this public static application.
- Do not implement a disguised refresh-token flow. A new token requires a user gesture
  when Google interaction is needed.

## Subscriber precision

The YouTube Data API reports subscriber counts above 1,000 rounded down to three
significant figures. The model therefore carries one of:

```text
EXACT
ROUNDED_THREE_SIGNIFICANT_FIGURES
HIDDEN
```

For rounded counts, compact display and approximate language are mandatory. Milestone
math may use the API value, but copy must not call it exact or add fabricated precision.
For hidden counts, subscriber progress is unavailable; do not treat null as zero.

## Analytics freshness

YouTube Analytics may lag and may not return the current date. Always display the latest
available reporting day from the response/cache. Do not label reports as live or
real-time. An empty or permission-limited Analytics result must not prevent Data API
milestones from working.

## Analytics watch time is not YPP watch hours

`estimatedMinutesWatched / 60` is Analytics watch time. It is not the exact qualified
public watch-hours value used by YouTube Partner Program eligibility. Exclusions and
eligibility windows make them different concepts.

The exact YPP figure is user entered from YouTube Studio, stored with source
`USER_ENTERED`, and labeled “Manual value.” Never derive or imply official eligibility
from generic Analytics watch time.

YPP reference thresholds live only in `src/config/yppPolicy.ts` with a version and
effective-through date. UI components import the configuration; do not scatter policy
numbers through components.

## Controlled metrics only

V1 supports raw or straightforward aggregates:

- API-reported current subscribers, channel views, and uploads;
- daily views;
- subscriber gains, losses, and net change;
- estimated minutes watched and conversion to Analytics watch hours;
- average view duration and percentage only as returned by the API;
- period totals, previous-period raw difference, and daily peak.

Do not add unsupported retention predictions, engagement scoring, reach estimates,
revenue estimates, growth forecasting, or inferred eligibility.

## Response validation

- Validate Data API payloads at runtime with Zod.
- Parse Analytics rows from `columnHeaders[].name`; never assume a fixed order.
- Treat malformed or missing fields as typed errors, not zeroes.
- Keep queries in controlled builders. Do not accept arbitrary metric, dimension, ID, or
  date parameters from URL/user input.

## Data provenance

Every display must keep these categories distinct:

| Category         | Examples                                        | Label                    |
| ---------------- | ----------------------------------------------- | ------------------------ |
| Data API         | subscribers, channel views, uploads             | YouTube Data API         |
| Analytics API    | daily views, net subscribers, watch time        | YouTube Analytics API    |
| User entered     | qualified watch hours, Shorts views, goal dates | Manual value / user goal |
| Locally observed | milestone crossing time                         | First observed date      |

Do not call a locally observed date the date YouTube confirms the milestone happened.

## Authorization verification

Successful authorized API access records `authorizationVerifiedAt`. On startup:

- less than 30 days: cached authorized data may display with its actual age;
- 30 days or more: do not render stored authorized channel data before reconnect;
- authorization succeeds: update verification time and refresh;
- authorization is rejected or revoked: delete stored authorized API data.

Do not relax this because storage is client-side.

## Deletion behavior

Disconnect attempts token revocation and then deletes:

- channels and selection;
- channel snapshots;
- Analytics daily rows and summary;
- milestone detection state;
- custom goals tied to the channel;
- manual metrics;
- tracking and authorization metadata.

The access token is cleared from memory. Theme preference may remain because it is not
authorized YouTube data. Clear Local Data performs local deletion without claiming that
Google account permission was revoked.

## Policy review triggers

Re-check official primary documentation before:

- changing scopes or OAuth flow;
- storing Google user data in a new place;
- adding any backend or cross-device sync;
- changing retention or the 30-day authorization check;
- changing subscriber precision copy;
- changing YPP thresholds or eligibility claims;
- adding Analytics metrics, derived metrics, or new user-facing data sharing;
- publishing under a new domain or OAuth brand.

Primary references:

- [Google Identity Services token model](https://developers.google.com/identity/oauth2/web/guides/use-token-model)
- [YouTube channels resource](https://developers.google.com/youtube/v3/docs/channels)
- [YouTube Analytics reports.query](https://developers.google.com/youtube/analytics/reference/reports/query)
- [YouTube API Services developer policies](https://developers.google.com/youtube/terms/developer-policies)
- [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy)
- [YouTube Partner Program overview](https://support.google.com/youtube/answer/72851)
