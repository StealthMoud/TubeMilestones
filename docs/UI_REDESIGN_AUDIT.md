# TubeMilestones UI Redesign Audit

Date: 2026-08-28

Baseline: `96949fa9d04386d6533cc88a218033e3ea8a0698` (`main`)

Direction: Calm Precision / professional creator analytics dashboard

## Evidence reviewed

- Live production, signed out, at `https://stealthmoud.github.io/TubeMilestones/` on desktop.
- Authenticated production Home screenshot supplied by the owner, showing the Persian channel `آخه چرا؟` with real channel data.
- Authenticated production channel-switcher screenshot supplied by the owner, showing the real Akhe, HackFrame, and Syntax Sphere connections as well as two now-removed duplicate connections.
- Local development UI at 1440px and 390px for Home, Journey, Analytics, Settings, channel switcher, profile menu, signed-out landing/auth, and the existing empty/error demo scenarios.
- Existing component, page, CSS, accessibility, unit, and Playwright coverage.

The Chrome session available to this audit was signed out of TubeMilestones. No login credentials were requested or inspected, and no production user or YouTube data was mutated. Authenticated visual conclusions therefore combine the owner-provided real screenshots with the local demo routes that exercise the same production components.

## Executive diagnosis

The current application has a recognizable identity, solid dark-theme foundations, and careful product copy. Its main weakness is not a lack of styling; it is an inconsistent information hierarchy. Large headings, oversized cards, broad rounded corners, decorative gradients, and repeated surface borders compete with the data. This makes Home feel sparse, Journey feel like stacked panels, and Settings feel longer and heavier than its actual complexity.

The redesign should preserve the violet milestone identity while moving visual authority to typography, aligned numbers, hairline separators, and one controlled raised surface at a time.

## Hierarchy

### What works

- The product’s milestone concept is immediately legible.
- Violet and warm gold already separate product interaction from milestone achievement.
- The shell consistently exposes channel switching, refresh, profile, and primary navigation.
- The app clearly separates the TubeMilestones login from connected YouTube identities.
- Analytics distinguishes range, metric, current total, chart, and supporting facts.

### What needs improvement

- Home gives the decorative milestone card more authority than the current value and recent change together.
- Page headings on Journey and Analytics are closer to marketing-display scale than application scale.
- Uppercase eyebrows appear in many places and add noise when every section already has a clear heading.
- Secondary data often sits in its own bordered card, creating several competing focal points.
- Settings section introductions, cards, nested lists, and inner cards repeat the same hierarchy at multiple levels.

## Spacing and density

- Desktop Home leaves a large unused field around a single hero card while recent movement occupies a detached side card.
- Journey’s wide two-column composition separates related progress, custom goals, and YPP guidance too aggressively.
- Settings is constrained appropriately, but the repeated padding at group, list, row, and nested-list levels makes routine controls feel ceremonial.
- At 390px, Home’s primary milestone and metric picker consume nearly the entire first viewport; recent movement begins below the fold.
- Mobile Journey uses a full-width page title, full-width action, metric scroller, and large panel before showing meaningful progress depth.
- Mobile Settings shows only profile and part of sign-in methods in the first viewport.

## Cards, borders, radii, and effects

- The current large 18–28px radii make panels feel soft and promotional rather than precise.
- Gradient fills and glows are applied to routine milestone and guidance surfaces.
- Standard checkpoints are inside a panel, while the active checkpoint is inside another highlighted card within that panel.
- Settings uses group copy, an outer surface, and additional bordered sub-surfaces for information that can be expressed as rows and dividers.
- Channel and profile popovers appropriately need elevation, but ordinary dashboard modules should rely more on border and tonal contrast.

## Typography and numbers

- Inter Variable is already local, performant, and appropriate; it should remain.
- Dashboard headings are too large relative to navigation, controls, and actual data density.
- Tabular alignment is not applied consistently to changing metric values.
- Large values scan well in isolation but do not form a coherent KPI row.
- Labels are sometimes over-bold, which flattens hierarchy rather than strengthening it.
- Persian channel names require natural bidirectional isolation in every identity surface without changing the application’s overall direction.

## Screen findings

### Home

- The milestone card is emotionally distinctive but too tall and decorative.
- Current value, target, remaining amount, percent, and segment progress are visually scattered.
- Recent movement is useful but detached from the primary story.
- Nearby checkpoints are mostly below the fold and feel like a second page fragment.
- Metric tabs are oversized pills and can clip horizontally on mobile.

### Journey

- The timeline metaphor is the right direction and should be preserved.
- Past, current, and future states need stronger editorial differentiation with less card framing.
- The current checkpoint should expand inline with exact progress rather than becoming a nested card.
- Custom goals should join the same progression language instead of appearing as independent cards.
- YPP guidance is secondary reference material and currently competes too strongly with the core journey.
- Owner clarification after the initial audit supersedes the future-state recommendation: the shipped Journey should show one next checkpoint and achieved history, with no speculative future-milestone list. Achieved milestones should be exportable as images.

### Analytics

- The chart is the strongest current data-first screen.
- Page and total values are oversized, creating unnecessary empty space on desktop.
- The chart needs subtle horizontal grid reference, a restrained tooltip, and a tighter relationship to its summary values.
- Range and metric controls need a shared compact segmented treatment.
- On mobile the first viewport contains the total and chart, but supporting context is not visible and the chart lacks immediate axis context.

### Settings

- Information architecture is comprehensive and correct.
- Repeated bordered containers make every row appear equally important.
- Connected Google account, channel identity, state, and actions should form one compact account row.
- Profile and sign-in methods should use the same row rhythm as appearance and data controls.
- Danger actions should be clearly separated by copy and color without becoming a large alarm surface.

### Shell and navigation

- The sidebar is wider and visually heavier than necessary for four destinations.
- Active navigation uses a large filled rounded block; a quieter tint and narrow indicator will be more precise.
- The selected channel is duplicated in the desktop sidebar and header.
- Header freshness takes two lines and too much horizontal attention.
- The mobile header can clip the rightmost profile/action area at 390px.
- Bottom navigation is a good mobile pattern and should remain, with 44px targets and a calmer active state.

### Channel switcher and profile menu

- The identity separation is correct and must remain.
- The switcher has the right content but overly padded rows and aggressive rounding.
- Long Google brand-account proxy emails truncate correctly in principle, but alignment and available width need refinement.
- Selected state should use one subtle tint plus a check, not multiple competing border/fill cues.
- Popover focus handling and click-away behavior need explicit verification.

### Landing and authentication

- The current landing page clearly communicates the concept and account separation.
- The display headline is too large for a product entry screen and pushes authentication lower on compact viewports.
- The decorative milestone preview repeats the same large-card tendency as Home.
- Authentication should become the stable product focal point, with the product story supporting it rather than competing with it.

## Responsive findings

- No horizontal document overflow was observed in the reviewed demo routes, but horizontal metric scrollers visibly clip labels and hide available choices.
- The desktop-to-mobile transition is abrupt; tablet widths need an intermediate shell/content rhythm.
- Important mobile controls generally meet minimum height, but touch-target and spacing coverage should be made explicit in Playwright.
- Content should be reordered at small widths so current progress and useful change/context appear before secondary illustration or long reference copy.

## Accessibility findings

### Preserved strengths

- Semantic landmarks, skip link, labelled navigation, real buttons, accessible password toggles, and progress semantics are already present.
- Most icon-only controls have accessible names.
- Existing forms use labels and surfaced errors.

### Improvements required

- Standardize one visible `:focus-visible` treatment across links, buttons, inputs, tabs, summaries, and dialog controls.
- Add robust keyboard close/navigation behavior to popovers and verify focus return.
- Ensure selected, warning, and connected states include text or icons rather than color alone.
- Respect `prefers-reduced-motion` for all entrance, spinner, progress, and popover transitions.
- Guarantee 44px touch targets at mobile breakpoints without making desktop controls oversized.
- Verify muted text contrast in both themes, especially metadata and inactive navigation.

## States to preserve and refine

- No connected YouTube account: short explanation plus one connection action.
- Analytics unavailable: calm inline status; never a page-wide warning unless sync is actually broken.
- Hidden subscriber count: factual explanation without showing zero as real data.
- No custom goals: one compact action-oriented row.
- Loading: layout-preserving skeletons with no blank screen.
- Reconnect/error: connection-specific inline message; one connection must not make the whole application look broken.
- Deletion pending and password recovery: same shell-independent visual system as authentication.

## Redesign principles selected

1. Data before decoration: numbers, change, and next action lead.
2. One dominant surface: ordinary grouping uses whitespace and hairlines.
3. Compact application scale: 56–64px chrome, 32–40px desktop controls, 44px mobile targets.
4. Stable interaction: 120–180ms color, border, and opacity transitions; no routine hover lift.
5. Editorial journey: one continuous milestone spine with an expanded current state.
6. Shared rhythm: a 4/8/12/16/20/24/32/40/48/64 spacing scale and controlled 6–14px radii.
7. Same system in both themes: warm light neutrals and graphite dark neutrals with restrained violet and gold.
8. Natural identity rendering: `dir="auto"`/bidi isolation for channel titles, compact truncation for Google identities.
9. Frontend-only scope: no changes to OAuth, Supabase schema/data, Vault, R2, Cron, sync, analytics retrieval, or production connections.

## Implementation priorities

1. Rebuild tokens and shared controls so every later screen inherits the same dimensions, focus, color, radius, and motion.
2. Quiet the shell and remove redundant sidebar channel identity.
3. Recompose Home around current progress, a KPI strip, recent movement, and a nearby-journey preview.
4. Turn Journey into a compact editorial timeline and integrate custom goals.
5. Tighten Analytics around a serious chart and structured summary strip.
6. Flatten Settings into labelled groups, rows, and dividers.
7. Bring landing/auth and all system states into the same product language.
8. Validate at 360, 375, 390, 412, 430, 768, 1024, and 1440+; test dark/light, keyboard, overflow, and touch targets.
