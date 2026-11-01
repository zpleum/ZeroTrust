# Workspace — Learn · Book · Work

## Overview
Clean, confident product design system for a platform that combines a learning system, desk/table booking, and online work. Warm monochrome surfaces plus one single orange accent, tuned for everyday productivity: scannable, calm, fast, and accessible (WCAG 2.2 AA minimum, Thai + English). Orange signals "you can act here" — start a lesson, book a desk, join a session. Everything else stays quiet.

**Principles**
1. **One action per moment.** One primary button per section; everything else is secondary or ghost.
2. **Color is never alone.** Every status pairs color with an icon or text label.
3. **Quiet by default.** Flat surfaces, borders over shadows, motion only to confirm an interaction.
4. **Thai-first typography.** Every type rule must work for Thai script, not just Latin.
5. **Configured by people, not code.** Rooms, desk areas, desks, seat counts, positions and booking rules are data the squad's admins create. No desk, label or layout is hard-coded in markup or JS; every screen must work from an empty state.

## Colors

### Brand
| Token | Hex | Use |
|---|---|---|
| `primary` | #EA580C | Brand mark, selected states, progress fills, focus accents, large graphics. **Not for small text, and not as the fill behind white button text.** |
| `primary-action` | #C2410C | Fill for filled buttons with white text (5.2:1 on white). |
| `primary-action-hover` | #9A3412 | Hover on filled buttons (6.3:1 with white). |
| `primary-action-pressed` | #7C2D12 | Pressed on filled buttons. |
| `primary-strong` | #C2410C | Orange **text/links** on white (5.2:1), Surface Alt (5.0:1) and Surface Muted (4.8:1). Same hex as `primary-action`, kept as a separate token so text and fills can diverge later. |
| `primary-on-soft` | #9A3412 | Orange text on Primary Soft (6.3:1). #C2410C is only 4.5:1 there, so don't use it. |
| `primary-soft` | #FFEDD5 | Chips, selected rows, today marker. |
| `primary-glow` | #FB923C | Orange text, icons, progress on **dark** surfaces. |

### Neutrals (warm)
| Token | Hex | Use |
|---|---|---|
| `ink` | #1C1917 | Headings, body, dominant dark surfaces |
| `ink-soft` | #292524 | Secondary dark panels, footer, booking summary |
| `surface` | #FFFFFF | Default page and card |
| `surface-alt` | #FAFAF9 | Section zoning, grid card backgrounds |
| `surface-muted` | #F5F5F4 | Form fields, disabled containers, unavailable desks |
| `text-primary` | #1C1917 | Headlines and body |
| `text-secondary` | #57534E | Descriptions, metadata, lead paragraphs, **placeholders on Surface Muted** |
| `text-muted` | #78716C | Timestamps, helper text (4.8:1 on white, 4.6:1 on Surface Alt; only 4.4:1 on Surface Muted, so use `text-secondary` there, including for "Full" and "Unavailable" labels) |
| `text-inverse` | #FFFFFF | Text on dark surfaces |
| `border` | #E7E5E4 | Card outlines, dividers |
| `border-strong` | #857F7A | Input borders (3.9:1 on white, 3.6:1 on Surface Muted, so it meets the 3:1 non-text minimum) |
| `border-dark` | #44403C | Dividers on dark surfaces |

### Status (functional only)
Each status has a **fill/graphic** color and a **text** color. Use the text color for any copy on light surfaces; the base color fails 4.5:1 for small text.

| Status | Graphic / outline | Text on light | Soft background |
|---|---|---|---|
| Success | #16A34A (3.3:1 on white) | #15803D (5.0:1; 4.6:1 on its soft background) | #DCFCE7 |
| Warning | #B87D02 (3.5:1 on white) | #854D0E (6.8:1) | #FEF9C3 |
| Error | #DC2626 (4.8:1) | #B91C1C (6.5:1; 5.3:1 on its soft background) | #FEE2E2 |
| Info | #57534E | #57534E | #F5F5F4 |

Status colors never appear on buttons or branding, with one exception: the Destructive button (Error fill). Warning is a deliberately dark yellow so it is never confused with orange. No blue or other accent is introduced; Info uses neutrals.

Status mapping:
- Desk available → Success outline + check icon + "Available" label
- Desk booked by someone else → Surface Muted fill, Text Secondary, lock icon
- Desk selected by you → Primary fill, white check icon
- Desk partly booked (`per_seat` mode) → Success outline + check icon + label "2 of 4 seats free"; seat pips under the label (filled = taken)
- Desk fully booked → same as "booked by someone else" (Surface Muted, lock icon, "Full")
- Desk under maintenance (`unavailable_until`) → Surface Muted fill, Text Secondary, wrench icon + "Unavailable until <date>"
- Booking pending/held → Warning outline + clock icon
- Presence: Online = Success dot, Away = Warning dot, Offline = Text Muted dot (always with an accessible text label, e.g. `aria-label="Online"`)

### Dark mode
Light is the default. Dark mode is switched on with `data-theme="dark"` on `<html>`. Components never test the mode themselves; they use the semantic roles in **Design Tokens (CSS)** below.

| Role | Token / value |
|---|---|
| Page | `ink` #1C1917 |
| Card / panel | `ink-soft` #292524 |
| Muted surface (fields, unavailable desks, skeletons) | `ink` #1C1917. Fields, the desk map and tables sit inside a card in dark mode, so they read one step darker than it |
| Divider / card border | `border-dark` #44403C (decorative only, 1.5:1) |
| Input border | `border-strong-dark` #78716C (3.2:1 on Ink Soft, 3.7:1 on Ink) |
| Text | #FAFAF9 · secondary #D6D3D1 · muted #A8A29E (6.0:1 on Ink Soft) |
| Orange text / icons / links | `primary-glow` #FB923C (6.7:1 on Ink Soft) |
| Progress fill | `primary-glow` (the base orange is only 2.9:1 against the #44403C track) |
| Primary Soft (chips, selected rows, today marker) | #431407 with `primary-glow` text (6.9:1) |
| Filled button | `primary-action` #C2410C with white text (unchanged) |
| Status graphics and text | Success #4ADE80, Warning #FACC15, Error #F87171, Info #D6D3D1 (graphic #A8A29E) |
| Status soft backgrounds | Success #052E16, Warning #422006, Error #450A0A, Info #1C1917, each with its 1px status border |

Dark surfaces carry no shadow; depth comes from the surface step and border.

## Typography
- **Display font**: Bold geometric sans (Plus Jakarta Sans, General Sans, or Inter Display).
- **Body font**: Neutral humanist sans (Inter, DM Sans).
- **Thai**: IBM Plex Sans Thai (preferred) or Noto Sans Thai, loaded for both display and body.
- **Stack**: `"Plus Jakarta Sans", "IBM Plex Sans Thai", system-ui, sans-serif` (display) and `"Inter", "IBM Plex Sans Thai", system-ui, sans-serif` (body). Latin face first, Thai second, so each script gets its proper glyphs.
- **Numerals**: Body family with `font-variant-numeric: tabular-nums` for times, prices, seat numbers, scores, and percentages.

Display copy is heavy (700–800). Body is regular (400). Lead paragraphs use medium (500). Overlines are uppercase, +0.08em, small (Latin only; Thai has no case, so use weight 600 and no tracking).

**Thai rules** (Thai stacks tone marks and vowels above and below the line):
- Line-height is at least **1.3** for headings and **1.7** for body, even where the Latin value is lower.
- Letter-spacing is **0** for Thai text. Never apply negative tracking to Thai.
- Do not break words mid-syllable; use `word-break: normal` with `lang="th"` set so the browser's dictionary line-breaker works.
- Thai body text is 16px minimum; avoid weights below 400. Thai text is never set below 14px, so Caption (13px) becomes 14px when the text is Thai.

Type scale (desktop). Thai line-height is in brackets:
| Style | Size | Line-height | Tracking (Latin) |
|---|---|---|---|
| Display XL (landing hero only) | 80px | 1.0 [1.25] | -0.04em |
| Display L (section openers) | 64px | 1.05 [1.25] | -0.03em |
| Headline (page titles) | 40px | 1.1 [1.3] | -0.02em |
| Title (card heads) | 28px | 1.2 [1.35] | -0.02em |
| Subhead | 20px | 1.3 [1.5] | -0.01em |
| Lead | 18px | 1.5 [1.7] | 0 |
| Body (default) | 16px | 1.6 [1.7] | 0 |
| Small | 14px | 1.5 [1.7] | 0 |
| Caption | 13px | 1.4 [1.6] | 0 |
| Overline | 12px | 1.3 | +0.08em, uppercase |

Mobile: Display XL → 48px, Display L → 36px, Headline → 28px, Title → 24px. Respect user font-size settings: size in `rem`, never `px` in code.

## Elevation
Mostly flat. Static elements get a 1px border and no shadow.
- **Card hover**: `0 12px 32px rgba(28,25,23,0.08)` and -3px translate over 200ms.
- **Sticky nav**: 12px backdrop blur and 1px bottom hairline.
- **Primary button hover**: orange glow `0 8px 24px rgba(194,65,12,0.30)`; omitted in dark mode, where hover only changes the fill to `primary-action-hover`.
- **Modals and dropdowns**: one deep shadow `0 24px 48px rgba(0,0,0,0.18)`.
- **Focus ring** (all interactive elements): `outline: 2px solid #C2410C; outline-offset: 2px`, plus optional soft halo `0 0 0 4px rgba(234,88,12,0.25)`. On dark surfaces use `#FB923C`. The solid outline carries the contrast; the halo is decoration only. Never remove focus indicators.

**Z-index scale**: base 0 · sticky 100 · dropdown 200 · drawer 300 · modal 400 · toast 500.

## Components

### Interaction states (apply to every interactive component)
Default → Hover → Focus-visible → Pressed → Disabled → Loading. Disabled: Surface Muted fill, Text Muted, `cursor: not-allowed`, still readable (never below 3:1 for the label). Loading: replace the label with a 16px spinner, keep the width, set `aria-busy="true"`. Hover effects only on `(hover: hover)` devices.

### Buttons
- **Primary**: `primary-action` fill, white text, 8px radius, 600 weight, no uppercase, hover → `primary-action-hover` and -1px translate over 150ms ease-out.
- **Secondary**: 1.5px Ink border, transparent fill.
- **Ghost**: text-only with animated orange underline (`primary-strong`).
- **Destructive**: Error fill (#DC2626, 4.8:1 with white text), hover #B91C1C, used only in confirm dialogs (e.g. "Cancel booking"). It is the one button allowed to use a status color.
- **Inverse (on dark)**: primary stays; secondary uses 1.5px white border; ghost uses `primary-glow`.
- **Sizes** (set by height, with 24px horizontal padding): small 36px, medium 44px, large 52px. Use medium or large on touch devices; the 36px small size needs a 44px hit area (padding or `::before`) on mobile.
- Label is 16px / 600 minimum on primary buttons. Icon-only buttons need `aria-label` and a 44px hit area.

### Course / Lesson Cards
16:9 cover with no radius on the image, 12px radius on the container, 24px body padding. Contents: overline (category), title, 2-line description (clamped), footer with duration + level chips and an orange arrow. Hover lifts -3px, fades in a 1px orange border, nudges the arrow +4px. The whole card is one link (single tab stop). Include a progress bar and "Continue" label when the learner is mid-course.

### Progress
8px bar, Surface Muted track, Primary fill, 9999px radius. Percent label in tabular numerals. Completed swaps to Success and shows a check. Use `role="progressbar"` with `aria-valuenow`.

### Desk Booking Map
Drawn entirely from data the squad created: the area's `grid_cols × grid_rows` sets the grid, and each desk supplies `pos_x`, `pos_y`, `span_x`, `span_y`, `shape` and `seat_count`. **Nothing about the map is hard-coded.** One grid cell is a **44×44px** tile (touch-friendly), 8px radius, 8px gap; a desk spanning several cells is one tile of that size. States follow Status mapping above. Selected desk shows the focus ring. Legend sits under the map in Caption size. Always pair color with an icon or label.

- **Seat count:** a 1-seat desk shows no pips. Desks with 2 or more seats show seat pips (up to 8, then "+N") and, in `per_seat` mode, a seat stepper appears in the Booking Summary Card (min 1, max seats free).
- **Keyboard:** the map is navigable (arrow keys move between tiles, Enter/Space selects). Each tile is announced as "Desk A4, 2 of 4 seats available" or "Desk A4, available" / "Desk A4, full".
- **Loading and empty:** skeleton tiles while availability loads. If the area has no desks, show the Empty state ("Add your first desk" for admins, "Ask an admin to add desks" for members).
- **Mobile:** the map scrolls inside its own container with a zoom control.

### Desk Setup & Layout Editor (admin)
Used in Resource Setup to create areas and desks and to place desks on the grid. Reuses Forms, Inputs and Buttons; nothing new is introduced visually.
- **Area form:** name, description, location note, grid size, open/close hours, booking rules (slot length, min/max duration, advance days, active limit, check-in settings). Fields are prefilled with defaults from `RULES`, and the server rejects values outside the allowed range (error shown inline with `aria-describedby`).
- **Desk form:** label, seat count (stepper with 44px buttons, plus typed input), booking mode (radio: "Whole desk" / "Per seat"), shape, amenities (free-text tags), note, unavailable-until date. A **bulk create** option takes a prefix, start number and count (e.g. A1–A8) with shared values.
- **Layout canvas:** the same grid as the Desk Map in edit mode. Drag a desk to move it; resize handles change its span. **Dragging is never the only way:** every desk also has X/Y and width/height number fields, and with a desk selected the arrow keys move it one cell and Shift+arrow resizes it. Overlapping or out-of-grid positions show an Error state with an icon and text ("Overlaps desk A2") before saving.
- **Locked fields:** when a desk has upcoming bookings, seat count (decrease) and booking mode are disabled with helper text explaining why; they are never silently hidden.
- **Primary action:** one "Save layout" button per section; unsaved changes show a Warning banner with a clock icon.

### Time Slot Picker
Horizontal chip row, pill shape, tabular numerals. Slot length (15 / 30 / 60 min) and open/close hours come from the selected area or room, never from a constant. Default Surface Alt with a `border` outline; selected `primary-action` fill + white text; unavailable Surface Muted + strikethrough + `aria-disabled` and "Unavailable" in the accessible name. Row scrolls horizontally on mobile with a visible edge fade.

### Calendar
Today = Primary Soft fill with `primary-on-soft` number. Selected day = `primary-action` fill, white number. Days with a booking show an 8px Primary dot beneath. Past days are Text Muted and not selectable.

### Booking Summary Card
Ink Soft background, white text; desk/room, seats (when the desk is booked per seat), date, time range, and a full-width orange "Confirm booking" button (large size). Only one primary button in view. On mobile it becomes a sticky bottom sheet.

### Online Work / Meeting Cards
White card, 12px radius, 1px border. Avatar stack (28px, pill) + presence dot, title, time, and an orange "Join" button when live. Live indicator is a Success dot with the text "Live" (never dot alone).

### Inputs
1.5px `border-strong` on Surface Muted, 8px radius, 12px/16px padding, 44px minimum height. Floating label (label shrinks, never disappears; placeholder is not a label). Focus turns border orange and shows the focus ring. Error swaps the border to the Error graphic color and the label and 13px helper text to Error text (#B91C1C), adds an error icon, and links the helper text with `aria-describedby`.

### Chips / Tags
Pill, Surface Alt fill, ink text, 4px/12px padding with 28px minimum height, 13px medium. Active filter chips use `primary-action` fill + white text. Rectangular 4px-radius chips for format tags (Online / On-site / Hybrid). In dark mode every chip gets a 1px `--line` border, because Surface Alt and the card are the same step there.

### Status Badges
Inline label for one state. Always icon + text, never color alone. 4px radius, 4px/8px padding, 24px minimum height, 13px medium (14px for Thai), 16px icon. Soft status background, 1px status border, icon and text in the status **text** color. Labels use the product's own words ("Confirmed", "Needs review"), not the status name ("Success"). Badges are informational and not clickable; if one has to act, wrap it in a real button with a 44px hit area.

### Alerts, Toasts and Banners
Soft status background + 1px status border + icon + text in the status **text** color. Toasts appear bottom-center (mobile) or bottom-right (desktop), auto-dismiss after 6s (never for errors), pause on hover/focus, use `role="status"` (errors: `role="alert"`).

### Modals and Drawers
12px radius, deep shadow, scrim `rgba(28,25,23,0.6)`. Trap focus, close on Esc, return focus to the trigger. Title is `aria-labelledby`. Max width 560px; full-screen sheet on mobile.

### Tabs
Text tabs with a 2px bottom indicator (`primary-strong`) on the active tab, 44px tall, arrow-key navigation, `role="tablist"`.

### Tables and Lists
Header row in Surface Alt, overline-style labels, 1px `border` row dividers, 48px row height, tabular numerals right-aligned. Selected row = Primary Soft. On mobile, tables collapse to stacked cards.

### Empty, Loading and Error States
- **Empty**: simple line illustration or icon, one-line explanation, one action ("Book your first desk").
- **Loading**: skeleton blocks in Surface Muted with a 1.2s subtle pulse (static under reduced-motion).
- **Error**: Error icon, plain-language cause, retry button.

### Navigation
Sticky 72px (64px mobile) white bar with 12px backdrop blur and hairline. Logo left; center links (Learn, Book, Work, Dashboard) at 15px medium; active link gets a 2px orange underline that animates from left and carries `aria-current="page"`. Right side: outlined "Sign in" and orange "Get started". Mobile uses a full-screen drawer with 24px display-weight links, a visible close button, and focus trapping. Include a "Skip to content" link as the first focusable element. Include a language switcher (TH / EN).

### Hero
Min 70vh on landing, 40vh on inner pages. Ink background (or product screenshot / photo under a dark scrim of at least 55%), headline bottom-left in white, one orange overline (`primary-glow`) above, then one primary and one secondary CTA.

### Forms
Single column, max 480px, label above field, full-width orange submit at large size. Validate on blur and on submit, show a summary of errors at the top on submit and move focus to it. Consent checkbox 20px visual size with a 44px hit area, 4px radius, orange fill when checked.

### Footer
Ink Soft background, 80px top padding, 4-column link grid (collapses to 1 column on mobile), 20px social icons with hover to Primary Glow, legal strip in 13px `#A8A29E`.

## Layout and Spacing
- **Base unit**: 4px. Every padding, margin, and gap is a multiple of 4 (documented exceptions: 1px/1.5px borders, 3px focus halo).
- **Scale**: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96, 128px
- **Component padding**: small 8×12, medium 12×16, large 16×24
- **Section spacing**: 64px mobile, 96px tablet, 112px desktop; 32–48px between sub-blocks
- **Breakpoints**: mobile < 640px · tablet 640–1023px · desktop ≥ 1024px · wide ≥ 1280px
- **Container**: max width 1280px; horizontal padding 16 / 24 / 32px (mobile / tablet / desktop)
- **Grid**: 4 columns mobile, 8 tablet, 12 desktop; gap 16–24px
- **Stack rhythm inside cards**: 8px overline→title, 12px title→description, 24px before footer row
- **Minimum touch target**: 44×44px (WCAG 2.2 minimum is 24px; we exceed it)

## Border Radius
- 0px: hero imagery, full-bleed media, card image caps
- 4px: format chips, badges, checkboxes
- 8px: buttons, inputs, seat tiles
- 12px: cards, panels, modals
- 16px: featured cards, video player frames, product screenshots
- 9999px: filter chips, time slots, avatars, progress bars, status dots

## Iconography
Outline icons, 1.5px stroke, rounded joins, on a 24px grid (20px inline with text, 16px in chips). Icons inherit text color; status icons use the status text color. Decorative icons get `aria-hidden="true"`; meaningful icons get a text alternative.

## Imagery and Motion
Use real, human imagery: people studying, collaborating, working at desks. Warm natural grading, soft daylight, no heavy filters. Include meaningful `alt` text. Product screenshots sit inside a 16px-radius frame.

Motion is restrained: 150–250ms ease-out for hovers, 400–600ms for scroll reveals, no parallax. Carousels cross-fade at 400ms and have pause controls. **Under `prefers-reduced-motion: reduce`**, remove translates, reveals, underline animations, and skeleton pulses; keep only instant color and opacity changes.

## Design Tokens (CSS)
Implementation lives in `public/tokens.css`. This document is the source of truth: change it here first, then update the CSS in the same commit. Components use `var(--...)` only; no hex values in markup, CSS rules or JS.

**Naming.** Raw tokens are `--color-<token>` using the names in this document (`--color-primary-action`, `--color-text-muted`). Spacing is `--space-<n>` where the value is n × 4px, radius is `--radius-sm|md|lg|xl|full`, type sizes are `--text-<style>`, z-index is `--z-<layer>`.

**Semantic roles.** Components use these instead of raw tokens, so dark mode needs no per-component overrides.

| Role | Light | Dark |
|---|---|---|
| `--bg` | surface #FFFFFF | ink #1C1917 |
| `--card` | surface #FFFFFF | ink-soft #292524 |
| `--card-alt` | surface-alt #FAFAF9 | ink-soft #292524 |
| `--field-bg` | surface-muted #F5F5F4 | ink #1C1917 |
| `--line` | border #E7E5E4 | border-dark #44403C |
| `--line-strong` | border-strong #857F7A | #78716C |
| `--fg` · `--fg-2` · `--fg-3` | #1C1917 · #57534E · #78716C | #FAFAF9 · #D6D3D1 · #A8A29E |
| `--accent-text` | primary-strong #C2410C | primary-glow #FB923C |
| `--accent-soft` · `--accent-on-soft` | #FFEDD5 · #9A3412 | #431407 · #FB923C |
| `--progress-fill` | primary #EA580C | primary-glow #FB923C |
| `--focus-ring` | #C2410C | #FB923C |
| `--status-success` · `-warning` · `-error` · `-info` (graphic) | #16A34A · #B87D02 · #DC2626 · #57534E | #4ADE80 · #FACC15 · #F87171 · #A8A29E |
| `--status-*-text` | #15803D · #854D0E · #B91C1C · #57534E | #4ADE80 · #FACC15 · #F87171 · #D6D3D1 |
| `--status-*-soft` | #DCFCE7 · #FEF9C3 · #FEE2E2 · #F5F5F4 | #052E16 · #422006 · #450A0A · #1C1917 |

## Accessibility Checklist
- Text contrast ≥ 4.5:1 (≥ 3:1 for 24px+ or 18.66px+ bold text); non-text UI and focus indicators ≥ 3:1.
- Every ratio in this document is WCAG 2.x relative luminance for the exact pair named. A token that passes on white may fail on Surface Muted or Ink Soft, so re-check the pair whenever a hex changes.
- Fully keyboard operable; visible focus on every interactive element; logical tab order.
- Status never conveyed by color alone.
- Semantic landmarks (`header`, `nav`, `main`, `footer`), one `h1` per page, correct `lang` attributes (`th` / `en`) including inline switches.
- Forms: visible labels, programmatic error association, no placeholder-only labels.
- Dynamic updates (booking confirmed, slot taken) announced via live regions.
- Support 200% zoom and 320px width without horizontal scroll.

## Do's and Don'ts
- Do reserve orange for interactive intent, selected state, progress fills and the brand mark — never body text or decoration (the single Hero overline is the one exception).
- Do use `primary-action` (#C2410C) for filled buttons, `primary-strong` (#C2410C) for orange text on light surfaces, and `primary-glow` (#FB923C) on dark surfaces.
- Do use the status **text** tokens for any status copy on light backgrounds.
- Do pair every status color with an icon or text label.
- Do keep the 4px spacing grid, cards at 12px radius, buttons/inputs at 8px, chips as full pills.
- Do give Thai text extra line-height and zero letter-spacing.
- Don't introduce secondary accent colors — status colors are functional only.
- Don't use pure black (#000000) for large dark surfaces — use Ink or Ink Soft.
- Don't use more than one primary orange button per content section (the global nav's "Get started" is exempt).
- Don't apply shadows to static elements — only hover, focus, and floating layers.
- Don't uppercase body copy or any Thai text — uppercase is for Latin overlines and select display moments.
- Don't animate more than two properties at once on hover.
- Don't rely on hover for essential information; it must also work on touch and keyboard.