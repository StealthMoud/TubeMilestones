# TubeMilestones Product Contract

> TubeMilestones is a milestone-first companion for YouTube creators.

## Product thesis

Most creator dashboards emphasize dense operational metrics. TubeMilestones emphasizes
personal progression. It should answer a creator's immediate questions with calm,
trustworthy language and then get out of the way.

## Core jobs

1. Know my current position.
2. Know my next checkpoint.
3. Understand how close I am.
4. See what I already achieved.
5. See recent channel movement.
6. Understand basic historical Analytics.
7. Create personal goals.

## Product principles

### Milestone-first

The primary object is a checkpoint, not a generic metric card. Home gives the next
checkpoint priority. Journey supplies the wider progression context.

### Historically honest

The first sync cannot determine historical crossing dates. Targets already met on that
sync are labeled `PREEXISTING` and shown as “Achieved before tracking.” A date is shown
only when TubeMilestones observes a crossing between stored snapshots.

### Precise about imprecision

YouTube Data API subscriber totals above 1,000 are rounded. The UI calls the value
API-reported, uses approximate remaining language, and never adds false digits. A hidden
subscriber count produces an unavailable state rather than a fabricated zero.

### Local-first and legible

The app has no TubeMilestones backend. Users should understand that authorized data goes
from Google to their browser and that saved history remains on that device until cleared.

### Useful, not predictive

V1 uses direct or simple aggregate metrics. It does not predict milestone dates, creator
growth, revenue, eligibility, or content performance.

## Primary surfaces

### Public landing

A legitimate homepage before authorization. It explains the milestone product, the
read-only connection, the local storage model, and independent-app status.

### Home

Current channel position, a bespoke next-milestone track, compact source-labeled metrics,
recent 28-day movement, and the nearest Journey checkpoints.

### Journey

A premium vertical timeline for subscribers, views, uploads, or Analytics watch time.
Standard checkpoints show pre-existing, tracked, next, and future states. Personal goals
add custom checkpoints without predicted completion dates.

### Analytics

Simple views, net subscribers, and watch-time charts over 7, 28, 90, or 365 available
days. A visible sentence communicates the same essential information as the chart.

### Settings

Channel connection, refresh metadata, deletion, appearance, manual guidance values,
privacy details, external permission management, and independent-app attribution.

## Non-goals

TubeMilestones V1 does not provide:

- video upload, editing, or management;
- comment moderation;
- YouTube search or downloading;
- thumbnail tooling;
- public leaderboards or creator comparisons;
- revenue estimates;
- AI recommendations or chat;
- subscriber forecasting or predicted goal dates;
- official YouTube Partner Program eligibility;
- a backend, TubeMilestones accounts, or passwords;
- PWA installation, service workers, push notifications, or background sync.

## Success criteria

- A first-time user understands the privacy and permission model before connecting.
- A connected creator can identify the next checkpoint in one glance.
- Milestone dates never imply knowledge the app does not possess.
- Every metric communicates its source and freshness where relevant.
- The product remains usable on a 360 px phone and composed on a 1440 px desktop.
- Disconnect and clear-data outcomes are explicit and testable.
