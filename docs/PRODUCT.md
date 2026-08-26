# Product contract

TubeMilestones is an independent milestone journey for YouTube creators. It is not a
YouTube Studio clone, a growth score, or an eligibility engine. Its job is to make
progress legible: where the channel is now, what checkpoint is next, and which
achievements were actually observed.

## Product promises

1. The next milestone is always the primary object on Home.
2. Historical dates are never invented. A checkpoint already complete at first tracking
   is labeled “Achieved before tracking”; only an observed crossing receives a date.
3. Hidden and rounded subscriber counts retain YouTube's precision semantics.
4. YouTube Analytics watch time is not presented as qualified public watch hours.
5. User-entered YPP values are labeled “User entered,” and YouTube Studio remains the
   source of truth.
6. The app never predicts milestone dates, revenue, eligibility, or a creator score.
7. Google application identity and YouTube authorization remain two explicit steps.
8. A returning user sees saved hot data first; a stale connection refreshes in the
   background instead of blocking Home.

## Core flow

```text
Continue with Google
        ↓
Supabase application account
        ↓
Connect YouTube
        ↓
server-side read-only OAuth + initial sync
        ↓
Home → Journey → Analytics → Settings
```

Google sign-in requests only identity information through Supabase Auth. “Connect
YouTube” separately requests the exact read-only channel and Analytics scopes needed by
the product.

## Screens

### Landing and connection

Landing explains the progression idea and application identity. The separate connection
screen explains the read-only YouTube boundary before authorization. Unconfigured cloud
deployments show an explicit non-functional state rather than a fake success path.

### Home

Home contains one dominant next-milestone hero, a compact metric selector, recent
movement, and nearby checkpoints. It intentionally avoids a generic dashboard grid.

### Journey

Journey uses one continuous spine. Past achievements are compressed, the next checkpoint
is expanded, and future checkpoints are subdued. Custom goals remain visibly distinct
from standard milestones. YPP is a separate manual-guidance section.

### Analytics

Analytics supports 7D, 28D, 90D, 365D, and Available. One focus metric and chart lead;
simple detail rows follow. The backend hides the hot/cold storage split. If old archives
are temporarily unavailable, recent hot data remains visible with a clear partial
warning.

### Settings

Settings groups account, appearance, YouTube data, YPP guidance, data and privacy, and
about information. Disconnect explains that saved TubeMilestones data and Google access
are removed but nothing is deleted from YouTube. Account deletion exposes pending or
retryable lifecycle state rather than pretending an incomplete purge succeeded.

## Data freshness

- Home reads current state from Supabase through TanStack Query.
- A connected foreground session starts a background sync when data is at least 15
  minutes old.
- Manual sync has a five-minute server cooldown.
- A three-minute server lock prevents overlapping syncs.
- The first daily import is bounded to 400 days; later syncs use approximately 120 days.
- Common Analytics ranges use approximately 120 hot days in Postgres.
- Older complete months are read from encrypted R2 archives only when requested.

## Accessibility and responsive contract

The UI uses semantic headings, labeled controls, screen-reader progress descriptions,
visible focus, non-color-only states, reduced-motion support, and touch-sized interactive
elements. The supported QA matrix is 360×800, 375×812, 390×844, 412×915, 430×932,
768×1024, and 1440×900. Mobile uses quiet bottom navigation; desktop uses a sidebar.

## Explicit non-goals

- No PWA, service worker, web push, APK, or background browser sync
- No automatic daily YouTube Analytics synchronization for all users
- No upload, edit, comment, or channel-management capability
- No revenue, CPM, virality, competition, AI, or eligibility scoring
- No user analytics in Git, Actions artifacts, releases, or a public R2 bucket

## Demo contract

Development fixtures cover normal, small, growing, unconnected, reauthorization, API
error, deletion-pending, archive, and partial-archive states. Every fixture is visibly
labeled. Demo mode is available in development and tests; production requires an
explicit `VITE_ENABLE_DEMO=true`, which must not be set for the public deployment.
