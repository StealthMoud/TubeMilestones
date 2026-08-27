# Design system

TubeMilestones should feel like a quiet personal progression instrument: precise,
editorial, and a little celebratory. It must not look like an admin dashboard or a stack
of interchangeable SaaS cards.

## Typography

Inter Variable is bundled with the frontend. Large display text uses compact tracking
and strong weight; labels use restrained uppercase treatment; body copy stays plain and
readable. Numeric values use tabular numerals where comparison matters.

## Color

Dark mode is primary:

| Token     | Value          | Use                            |
| --------- | -------------- | ------------------------------ |
| Canvas    | `#0B0B0F`      | page background                |
| Surface 1 | `#111116`      | navigation and grouped rows    |
| Surface 2 | `#17171D`      | raised content                 |
| Violet    | `#A79BFF`      | active progress and focus      |
| Gold      | `#D8BB6A`      | next milestone and celebration |
| Green     | semantic token | achieved checkpoints           |

Light mode is independently tuned with warm neutral surfaces and dark ink. It is not a
mechanical inversion. Semantic achievement, next, warning, and danger states retain
their meaning in both modes.

## Shape and depth

- Rounded forms are reserved for the milestone hero, progress trail, grouped settings,
  and controls.
- Dividers and tonal changes do most of the grouping work.
- Shadows are soft and sparse; borders remain low contrast.
- Cards are not the default container. Connected information shares a surface.

## Screen hierarchy

Home has one focal milestone. Journey has one vertical spine. Analytics has one leading
number and chart. Settings uses native-feeling grouped rows and clearly separates the
TubeMilestones login from connected YouTube accounts. The header keeps a channel-first
cross-account switcher left and the refresh action right; it never substitutes the login
email for channel identity. The bottom navigation stays visually quiet.

## Motion

Entrance motion is short, low amplitude, and hierarchy-aware. Celebration is restrained
and only shown for newly observed unread crossings. `prefers-reduced-motion` removes
decorative transitions. There is no perpetual ambient animation.

## Interaction

- Minimum touch target: approximately 44 CSS pixels where layout permits
- Visible keyboard focus uses the violet focus token and sufficient offset
- Selected tabs use text, shape, and `aria-pressed`/radio state—not color alone
- Destructive actions require a plain-language confirmation dialog
- Loading keeps layout stable with shaped skeletons or contextual status text

## Responsive composition

Mobile widths use full-bleed page rhythm with safe-area-aware navigation. Metric chips
may horizontally scroll with a visible continuation cue; the document itself must never
overflow. At desktop width the sidebar anchors navigation while the content retains a
focused reading measure instead of expanding into a dashboard grid.

## Visual QA checklist

- The next milestone is unquestionably the Home focal point.
- Journey reads as a unique path, not repeated status cards.
- Analytics can be understood in one scan.
- Light mode feels deliberately designed.
- Copy does not overwhelm 390px layouts.
- Navigation and secondary actions do not compete with the content.
- Focus, contrast, and state meaning survive keyboard and reduced-motion use.
