# TubeMilestones Design System

## Direction

TubeMilestones should feel premium, quiet, focused, and personal. It is neither a generic
admin dashboard nor a game map. The checkpoint path is the recurring visual metaphor.

Design calibration:

- density: 6/10;
- energy: 4/10;
- warmth: 5/10.

## Palette

The source of truth is `src/styles/tokens.css`.

| Role           | Dark      | Light     | Use                     |
| -------------- | --------- | --------- | ----------------------- |
| Background     | `#111116` | `#f5f4f8` | App canvas              |
| Surface        | `#1a1a21` | `#fbfafc` | Panels                  |
| Raised surface | `#22222b` | `#fdfcfe` | Hero and modal          |
| Primary        | `#9488e9` | `#695cc6` | Path and selected state |
| Primary strong | `#b8aff4` | `#5447ad` | Text and CTA emphasis   |
| Secondary      | `#69b6c6` | `#287d8d` | Focus ring              |
| Milestone      | `#d2b46f` | `#916d26` | Next checkpoint         |
| Success        | `#75bd96` | `#367b57` | Achieved checkpoint     |

Semantic colors always appear with text, icons, or shape differences. Color is not the
only indicator of state.

## Typography

The app uses a system-first variable sans stack for privacy, performance, and familiar
mobile rendering. Display headings use tight tracking and a measured scale. Metric values
use tabular numerals. Uppercase is reserved for compact context labels, never paragraphs.

## Spacing and shape

- Spacing follows a 4 px base scale exposed as `--space-*` tokens.
- Interactive controls are at least 44 px high; primary actions are 48 px.
- Radii range from 8 px for compact controls to 24 px for signature panels.
- Cards use borders and subtle surface changes before shadows.
- Pills are reserved for selectors, compact freshness, or trust metadata.

## Layout

Mobile uses a compact app header and fixed four-item bottom navigation with safe-area
insets. Desktop uses a persistent sidebar and a bounded 74 rem content canvas. Multi-column
layouts are composed separately at 1024 px rather than stretching phone cards.

## Signature components

### Checkpoint path

The brand mark, Home hero, Journey trail, and public preview share a path-and-node
language. Achieved nodes use a check and success treatment. The next node uses a flag and
gold treatment. Future nodes are outlined and subdued.

### Analytics chart

Recharts provides geometry only. Product tokens control axes, grid, area fill, tooltip,
spacing, and text. The chart is `aria-hidden`; visible semantic text communicates total,
peak, comparison, and freshness.

### Destructive dialog

Dialogs use an overlay, bounded surface, explicit consequence text, a quiet cancellation
action, and a danger-styled confirmation. Escape and backdrop close the dialog.

## Motion

- Interaction transitions: 150 to 250 ms.
- Page and modal entries: 250 to 500 ms.
- Easing: ease-out or `cubic-bezier(0.16, 1, 0.3, 1)` for purposeful settling.
- Motion reinforces hierarchy; it does not loop for decoration.
- `prefers-reduced-motion: reduce` collapses animations and transitions globally.

## Accessibility

- WCAG-oriented contrast in both themes.
- Visible focus ring using the secondary cyan token.
- Semantic headings, lists, descriptions, labels, and dialogs.
- Screen-reader text for milestone progress and Analytics summaries.
- Truncation uses visible titles where identifiers may overflow.
- Safe-area padding protects mobile browser and device chrome.
