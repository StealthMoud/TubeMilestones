# TubeMilestones UI Redesign Report

Date: 2026-08-28

Baseline: `96949fa9d04386d6533cc88a218033e3ea8a0698` (`main`)

Scope: frontend presentation, responsive behavior, and interaction quality only

## Design direction

The redesign uses a **Calm Precision** direction: creator progress is led by aligned numbers, one exact milestone rail, compact controls, and editorial whitespace. TubeMilestones keeps its violet path identity and warm milestone gold, but routine surfaces no longer rely on large gradients, oversized radii, or stacked cards.

The implementation follows four principles:

1. Data before decoration.
2. One dominant surface per task, with hairlines and whitespace for secondary grouping.
3. Compact desktop controls with 44px mobile touch targets.
4. The same hierarchy in graphite dark mode and warm editorial light mode.

## Before

- Home devoted too much of the viewport to one decorative milestone card and separated related context into detached panels.
- Journey rendered every standard checkpoint as a sequence of large cards, making history and the active checkpoint difficult to scan.
- Analytics had oversized values, weak chart reference, and controls that felt separate from the data surface.
- Settings repeated outer cards, nested cards, and padded sub-panels for routine account rows.
- Sidebar, header, popovers, landing, and authentication used different density and radius conventions.
- Persian channel titles needed explicit natural-direction handling throughout identity surfaces.
- Keyboard dismissal, focus return, modal focus trapping, and mobile touch-target coverage needed stronger verification.

The detailed baseline evidence is in [UI_REDESIGN_AUDIT.md](./UI_REDESIGN_AUDIT.md).

## After

### Home

- Replaced the oversized decorative hero with one compact progression surface.
- Current value, next target, remaining distance, percentage, and segment position now read as one unit.
- Added a four-metric summary strip instead of four competing cards.
- Recent movement is a restrained 14-bar data view with explicit 28-day totals.
- Journey preview now shows two achieved checkpoints and only the single next checkpoint. It does not render a speculative future tier.

### Journey

- Rebuilt the page around one next-checkpoint progress module and a quiet achieved-history list.
- Applied the owner's reference as information structure only; no TubeBuddy visual styling was copied.
- Removed the standard future-milestone list entirely.
- Each achieved milestone has an accessible **Export image** action.
- Export creates a branded 1080×1080 PNG locally in the browser with Canvas, including channel title, target, observed date/state, and current value.
- Export does not upload data, call an Edge Function, or add a runtime dependency.
- Custom checkpoints and YPP guidance remain available as secondary tools without competing with the milestone history.

### Analytics

- Consolidated total and supporting facts into one structured summary surface.
- Added restrained horizontal grid lines, readable Y-axis references, a subtle area fill, and the existing interactive tooltip.
- Unified the 7D, 28D, 90D, 365D, and Available ranges into one compact control.
- Preserved archive, partial-archive, unavailable, and loading behavior.

### Settings

- Kept the approximately 800px content width and tightened section rhythm.
- Reduced nested framing in sign-in methods and used dividers for method rows.
- Kept Google identity, connection status, channels, and account-scoped actions together.
- Preserved profile editing, password management, session, theme, refresh, manual YPP metrics, disconnect, and delete-account behavior.
- Kept destructive actions visually separated without making the whole section alarm-like.

### Shell and navigation

- Reduced the desktop sidebar to 224px and removed the duplicated selected-channel card.
- Replaced the heavy active-navigation block with a quieter tint and narrow indicator.
- Tightened the header to one-line freshness information with fuller detail available through the title.
- Kept channel switching separate from the TubeMilestones profile menu.
- Added outside-click and Escape dismissal to both popovers, with focus restored on Escape.
- Preserved the mobile bottom navigation and safe-area behavior.

### Returning-channel updates

- Added a compact **New channel update** card when a channel has a newer stored snapshot than the one last seen in that browser.
- Shows real current subscribers, views, and uploads alongside signed movement from the preceding snapshot; unchanged metrics are omitted and hidden subscriber counts are never inferred.
- Establishes a quiet baseline on first use, records only the last-seen snapshot timestamp per channel, and never persists metric values, account data, or credentials.
- Appears above the mobile navigation or at the lower-right on desktop, closes on demand, and dismisses automatically after eight seconds.
- Auto-dismiss pauses while hovered or keyboard-focused. Milestone celebrations take priority, so the update waits until the celebration has been handled.
- Uses a short ease-out entrance and ease-in exit; the existing reduced-motion policy removes nonessential movement.

### Landing and authentication

- Reduced the marketing headline to product scale and brought authentication into the first desktop viewport.
- Replaced the decorative curved preview with the same precise milestone-rail language used by the application.
- Kept TubeMilestones login and connected YouTube accounts explicitly separate.
- Preserved all password-field visibility, autocomplete, signup, login, recovery, and Google sign-in behavior.

## Visual system

### Typography

- Inter Variable remains locally bundled.
- Page titles use a compact `1.75rem–2.25rem` responsive range.
- Tabular numbers are used for changing metrics and progress values.
- Labels use weight and restrained tracking; uppercase is reserved for short context labels.

### Spacing and shape

- Shared spacing scale: 4, 8, 12, 16, 20, 24, 32, 40, 48, and 64px.
- Shared radii: 6, 8, 10, 12, and 14px.
- Shadows are reserved for floating popovers and modals.
- Standard desktop controls are 36–40px; mobile interactive targets are at least 44px.

### Color

- Dark: near-black neutral background, graphite surfaces, soft white text, restrained violet, and warm milestone gold.
- Light: warm off-white background, soft white surfaces, charcoal text, and the same violet/gold hierarchy.
- Success, warning, and danger states pair text/icons with color and do not rely on color alone.

### Motion

- Shared 120ms, 160ms, and 220ms motion tokens.
- Motion is limited to color, border, opacity, and short entrance feedback.
- `prefers-reduced-motion` disables nonessential animation and smooth scrolling.

## Responsive behavior

Browser QA covered 360, 375, 390, 412, 430, 768, 1024, and 1440px widths.

- 360–430px: one-column content, compact header, fixed bottom navigation, four-column metric controls, stacked progress facts, and 44px targets.
- 768px: bottom navigation remains, while Journey uses a balanced intermediate two-column composition where space allows.
- 1024px and above: desktop shell, deliberate content widths, and chart/secondary-column space where it improves comprehension.
- No horizontal document overflow was found in the tested matrix.

## Accessibility improvements

- Standardized `:focus-visible` treatment.
- Added Escape and click-away behavior to popovers with focus restoration.
- Added a Tab/Shift+Tab focus trap, Escape close, initial focus, and focus restoration to modals.
- Preserved semantic landmarks, skip link, form labels, progress semantics, and status text.
- Added natural `dir="auto"` and bidi isolation for Persian channel names and external identities without changing overall application direction.
- Verified password toggle labels, independent visibility, form non-submission, and 44px mobile controls.

## QA evidence

Visual review was performed iteratively in the browser after each major screen:

| Screen/state | Desktop   | Mobile   | Theme/state coverage                                                 |
| ------------ | --------- | -------- | -------------------------------------------------------------------- |
| Home         | 1440×1000 | 390×844  | dark, light, Persian, large values, no Analytics                     |
| Journey      | 1440×1000 | 390×844  | achieved history, no future tiers, hidden subscribers, export action |
| Analytics    | 1440×1000 | 390×844  | 28D, Available, archive, partial archive                             |
| Settings     | 1440×1000 | 390×844  | connected, zero-channel, profile edit, theme, destructive dialog     |
| Landing/auth | 1440×1000 | 390×844  | signed out, unconfigured cloud, signup, recovery                     |
| Update card  | 1440×900  | 390×844  | dark, light, multi-metric movement, dismiss and no-repeat            |
| Tablet       | —         | 768×1024 | Journey and Settings intermediate layouts                            |

Screenshot binaries were intentionally not added to Git; they are large, transient QA artifacts and the repository has no committed screenshot baseline. The automated suite uses behavioral and geometry assertions instead of brittle pixel snapshots.

## Validation

- `npm ci`: 334 packages installed; 0 vulnerabilities. Node 25 emitted the expected `jsdom` engine-range warning.
- `npm run format:check`: passed.
- `npm run lint`: passed with zero warnings.
- `npm run typecheck`: passed.
- `npm run test`: 38 files, 252 tests passed.
- `npm run backend:lint`: 48 files checked, passed.
- `npm run backend:check`: all eight Edge Function entry points checked, passed.
- `npm run test:e2e`: 40 tests passed across 390px mobile, 430px mobile, and 1440px desktop projects.
- `npm run build`: passed; production bundle generated.
- `npm run audit:bundle`: production secret-boundary audit passed.
- `git diff --check`: passed.

## Backend safety

No files under `supabase/` were modified. The redesign did not change Google or YouTube OAuth, Supabase authentication, database schema or data, Vault credentials, R2 archives, Cron, sync logic, Analytics retrieval, or the three production YouTube connections.
