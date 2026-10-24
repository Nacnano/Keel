# Keel UI kit

Apple HIG-style system for the app (dark first, light supported). Every screen uses these
primitives and tokens; no raw `zinc-*`/`violet-*` classes, no ad-hoc borders.

## Tokens (Tailwind utilities)

| Role                | Utilities                                                                                                                 |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Page background     | `bg-bg` (black in dark, `#f2f2f7` light)                                                                                  |
| Grouped cell / card | `bg-surface` (`#1c1c1e`), elevated `bg-surface-2` (`#2c2c2e`)                                                             |
| Fills for controls  | `bg-fill` … `bg-fill-4` (strong → faint)                                                                                  |
| Text                | `text-label`, `text-label-2` (secondary), `text-label-3` (tertiary), `text-label-4` (quaternary)                          |
| Separators          | `hairline-t` / `hairline-b` utilities (0.5 px inset), colour `separator`                                                  |
| Accent (one)        | `text-accent`, `bg-accent`, `bg-accent/15` for tinted; `accent-fg` for text on accent                                     |
| Semantic            | `live` (red: recording, stop, errors), `ok` (green), `warn` (orange)                                                      |
| Materials           | `material` (translucent blur for toolbars, tab bar, popovers, toasts)                                                     |
| Radius              | `rounded-control` 10, `rounded-cell` 12, `rounded-card` 16, `rounded-sheet` 20                                            |
| Type                | `text-large-title`, `title-1/2/3`, `headline`, `body`, `callout`, `subhead`, `footnote`, `caption`; `tabular` for numbers |
| Motion              | `anim-fade-in`, `anim-rise`, `anim-slide-in-right`, `anim-slide-up`, `anim-pulse-soft`; `ease-out-expo`                   |

## Primitives (`@/ui/kit`)

`Button` (filled | tinted | gray | plain; `destructive`, `icon`, `round`, `loading`),
`Segmented`, `Group` + `Row` (inset grouped lists), `Switch`, `Slider`, `Select`,
`Page` (the one page shell), `Sheet` (side / bottom / center), `Popover`, `Meter`, `EmptyState`, `Badge`.

## Rules

- **One page shell.** Every page is a `Page`: a 768 px column (Review's lanes scroll inside it), a top
  bar row with the back link and actions, and the large title under it at the same place on
  every page.
- **Hierarchy first.** One large title per page, one primary action per
  screen (`Button variant="filled"`), everything else gray or plain.
- **Lists, not cards.** Collections are inset grouped lists (`Group`/`Row`) or plain rows
  with hairlines. No card grids of icon + heading + text.
- **Controls are standard.** Segmented for 2–4 exclusive choices, Switch for booleans,
  Select for longer lists, Slider for continuous values. No invented widgets.
- **Toolbars carry actions**, content areas carry content. Settings-like choices go
  into a `Popover` behind one toolbar button (see JamScreen `JamOptions`).
- **Help is on demand.** Secondary panels open in a `Sheet` (inspector), never stacked
  on the main screen.
- **Empty states teach**: icon + title + one sentence + the action.
- **Dev-only affordances** (seed buttons, stress data) must be hidden unless
  `location.search` contains `seed=1`, and must look like a footnote, not a primary button.
- **Motion** only on state change, 150–300 ms, exponential ease-out. No page-load choreography.
- Touch targets ≥ 44 px on coarse pointers, measured on the element itself (small buttons,
  segments, the slider); keyboard focus uses the global focus ring.

Exemplar: `src/ui/screens/JamScreen.tsx` with `jam/JamInspector.tsx` and `jam/JamOptions.tsx`.
