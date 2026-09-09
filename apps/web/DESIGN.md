# TenzoPay design system

The governing idea:

> **Depth comes from background tint, never from shadow. Emphasis comes from
> weight and size, never from colour. The accent is loud and everything else is
> quiet — so the accent always means "act here".**

Most fintech dashboards do the opposite: grey page, white floating cards,
shadows everywhere, five accent colours. This one inverts it. The page is
**white** and the cards are **tinted** — the accent hue at 8% alpha, which is
what stops the neutrals reading as default grey.

Source of truth: [`src/app/globals.css`](src/app/globals.css). Every component
reads tokens; no component file contains a raw colour.

---

## Colour

| Token | Light | Use |
|---|---|---|
| `--content-primary` | `#0E0F0C` | headings, amounts, active nav |
| `--content-secondary` | `#454745` | body copy — **the default text colour** |
| `--content-tertiary` | `#6A6C6A` | timestamps, meta, axis labels |
| `--content-on-accent` | `#163300` | dark text that sits ON the accent |
| `--brand` | `#9FE870` | the accent. Light fill, dark text |
| `--surface-page` | `#FFFFFF` | the page |
| `--surface-raised` | `rgb(22 51 0 / 0.08)` | cards, list hover, nav active |
| `--surface-inset` | `#FFFFFF` | inputs inside a tinted card |
| `--hairline` | `rgb(14 15 12 / 0.12)` | the only "border" in the system |
| `--positive` `--negative` `--warning` `--info` | — | **text only**, never fills |

Tailwind utilities: `bg-surface-raised`, `text-content-tertiary`, `bg-brand`,
`border-hairline`, `text-positive`.

Rules:

- **One accent-filled button per view.** If a second would be visible, it
  becomes `secondary` (a `--surface-raised` fill).
- **Semantic colours colour text only.** A positive amount, an error message.
  Never a filled green banner or a red card background. `Alert` and
  `StatusBadge` are tinted surfaces with coloured *text*.
- **Zero gradients, zero glassmorphism, zero colour-on-colour.**
- **Dark mode keeps the same structure**: near-black page, `rgb(255 255 255 /
  0.06)` raised surfaces, and an **identical accent** — a light accent works in
  both themes, which is why a light accent was chosen.

## Type

One family (Inter), and **exactly two weights: 400 and 600**. Bold means 600.
There is no 500 and no 700.

| Token | Size / line-height | Use |
|---|---|---|
| `text-display` | 26 / 32 | hero metric (the balance) |
| `text-title` | 22 / 28 | section headings |
| `text-subtitle` | 20 / 26 | card headings |
| `text-value` | 16 / 24 | amounts in list rows |
| `text-ui` | 14 / 20 | **the default, ~70% of the page** |
| `text-caption` | 12 / 16 | axis labels, meta, helper text |

The names are `ui` and `value` rather than `body`/`body-lg` because the
guest-side scale in `tailwind.config.ts` already owns those and the two must
not collide.

- The hero balance is **26px, not 48px**. Isolation and whitespace signal
  importance here, not size.
- Sentence case everywhere. No `uppercase`, no letter-spacing tricks, no
  all-caps micro-labels above fields.
- Default body colour is `--content-secondary`. Primary is reserved.

## Shape and elevation

```
rounded-pill    9999px  → buttons, nav items, chips, tabs
rounded-card    16px    → cards, inputs, list containers, banners
rounded-panel   24px    → large containers, modals, drawers
rounded-full    50%     → avatars, list-row icon circles
```

- **No box-shadow.** The only permitted elevation is a hairline ring on
  floating overlays: `--shadow-overlay: 0 0 0 1px var(--hairline)`, exposed as
  the `.overlay-surface` utility. The three legacy shadow tokens are defined as
  `none` so any straggler is a no-op.
- **No borders used to separate content.** Separation is spacing or a tint
  step. The exceptions are a divider inside a list container, the vertical rule
  in `InfoStrip`, and the mobile bottom bar — all `--hairline`.
- Buttons: pill, 48px tall (`size="default"`), 24px horizontal padding, 14px/600
  label. Primary = accent fill + `--content-on-accent`. Secondary =
  `--surface-raised` + `--content-primary`. Ghost = text only.

## Shell

- Sidebar **276px**, with **the same background as the page** — no border, no
  shadow. It reads as part of the canvas.
- Nav item: 20px icon + 14px label, 44px tall, full-width pill. Active =
  `--surface-raised` + 600 + `--content-primary`. **No left accent bar, no
  coloured icons.**
- Content column **max 832px, centred** in the space beside the rail, 64px top
  padding. The reference left-aligns it; centred was preferred here, so a wide
  screen leaves even margins rather than stranding content against one edge.
  The top bar shares the same measure, so the account chip lines up with the
  column's right edge instead of drifting to the window edge.
- Top bar: no title, no search, no notification cluster — one or two contextual
  pills and the account chip, floating on the page background. Search lives in
  the rail (and ⌘K); notifications and the theme toggle sit in the rail footer.
- Vertical rhythm between sections 32–40px; inside a card 16–24px.

## Patterns

Built in [`src/components/ui/patterns.tsx`](src/components/ui/patterns.tsx):
`HeroMetric`, `NavItem`, `ListRow`, `SectionHeader`, `Nudge`, `InfoStrip`,
`ChartFrame`, `IconButton`. They hold no hooks, so server components render
them directly.

- **List rows**: no table borders, no zebra striping, no header row. 48px
  circular tinted icon → title 14/600 primary and meta 14/400 tertiary → amount
  16/600 right-aligned. Incoming amounts are `--positive` with a `+`; outgoing
  stay `--content-primary` — no red minus. Hover tints the whole row at
  `rounded-card`.
- **Section header**: title on the left, a plain underlined "See all" text link
  on the right. Not a button.
- **Empty and upsell slots** are the same tinted card with a centred headline,
  one tertiary line and a circular accent `+`. Never a dashed border.
- **Charts**: line only. 2px stroke in a dark shade of the accent hue, **no area
  fill, no gradient**. No vertical gridlines; dashed horizontal references in
  `--hairline`. Value labels sit outside the plot on the right in
  caption/tertiary. One filled dot with a halo marks the latest point.

## Motion

150ms `ease`, on `background-color` and `color` only. Hover moves the
background one tint step. **No translate, no scale, no shadow bloom, no border
animation.** Skeletons are `--surface-raised` blocks at the right radius with an
opacity pulse — no shimmer sweep.

## Copy

Sentence case. Plain words. "Add money", not "Initiate Deposit". Short
second-person sentences. No exclamation marks in UI chrome.

---

## Documented exceptions

Three places hold literal colours or a semantic fill, each for a reason:

1. `src/app/(app)/deposit/page.tsx` — the QR code is rasterised by `qrcode` to a
   data URL, which cannot read CSS custom properties.
2. `src/components/ui/chart.tsx` — the `#ccc` / `#fff` values are **attribute
   selectors** matching Recharts' own inline defaults, not colours being
   applied.
3. The unread dot in `notifications-menu.tsx` is an 8px `--negative` status
   marker, not a fill.

## Migration status

**All customer screens are migrated.** Tokens, `Button`, `Input`, `Card`,
`Skeleton`, `primitives.tsx`, the app shell, and every screen: dashboard
(the reference implementation), cards, card detail, transactions, deposit,
settings, onboarding — plus the transaction list and feed, the spending chart,
and the dialogs and sheets.

Two structural changes worth knowing about:

- **Pages no longer set their own width.** The shell owns the 832px measure, so
  a page that adds `mx-auto max-w-*` will fight it. None do.
- **The deposit history is no longer a `<table>`.** It is the same borderless
  row shape as the transaction feed. `components/ui/table.tsx` is now unused by
  the customer app; it is left in place for the admin app and future use.
