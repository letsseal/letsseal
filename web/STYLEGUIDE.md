# Let's Seal UI style guide

The product UI (everything except the marketing site under `app/site`) follows this guide. It is
inspired by Vercel's Geist design: neutral surfaces, hairline borders, strong typography, one
accent colour, and nothing on screen that does not help the user act.

If a screen needs something this guide does not cover, extend the guide in the same change.

## Principles

1. **Quiet by default.** Black, white and grey carry the interface. Colour is reserved for status
   (success, warning, danger, info) and for links/focus. No decorative colour, gradients, tinted
   icon tiles or coloured shadows.
2. **One way to build each thing.** Use the primitives in `components/ui` and the patterns in
   `components/common`. Never hand-roll a button, badge, card, input, dropzone or copy control.
3. **Every element earns its place.** If removing it would not make a decision, action, recovery
   or important expectation harder, remove it. See "Copy" below.
4. **Content first.** The page title says what the page is; the content says the rest. No
   greetings, banners restating the title, or helper text narrating an obvious control.

## Tokens

Defined once in `app/globals.css`; light and dark switch automatically. Use the Tailwind
utilities generated from them. **Never use raw palette classes** (`bg-gray-100`,
`text-blue-600`, `border-emerald-200`…) or hex values in components.

| Role | Utility | Use |
| --- | --- | --- |
| Page background | `bg-background` | App canvas, inputs |
| Subtle surface | `bg-muted` | Card footers, table hover, code blocks, sidebar |
| Hover fill | `bg-accent` | Hover state of ghost/outline controls |
| Card | `bg-card` + `border` | Grouped content |
| Text | `text-foreground` | Primary text |
| Secondary text | `text-muted-foreground` | Descriptions, metadata, table headers |
| Hairline | `border` (`border-border`) | Every divider and outline |
| Primary action | `bg-primary text-primary-foreground` | One per view |
| Link / focus | `text-brand`, `ring-ring` | Inline links, focus rings, the seal mark |
| Status | `text-success` `text-warning` `text-destructive` `text-info` | State text and icons |
| Status surface | `surface-success` `surface-warning` `surface-destructive` `surface-info` | Tinted pill/alert backgrounds (via `Badge`/`Alert`) |

### Status mapping

Use `StatusBadge` (`components/common/status-badge.tsx`) with these tones so the same state looks
the same everywhere:

| State | Tone |
| --- | --- |
| Sealed, Signed, Verified, Confirmed, Active, Intact | `success` |
| Awaiting, Pending, Sealing, Confirming, Expired | `warning` |
| Viewed, Info | `info` |
| Revoked, Voided, Declined, Failed, Altered, Suspended | `destructive` |
| Draft, Not timestamped, Waiting | `neutral` |

## Typography

Geist Sans for UI, Geist Mono for hashes, IDs, code and keys. Only these sizes:

| Style | Classes |
| --- | --- |
| Public page title (verify, proof, sign) | `text-3xl font-semibold tracking-tight` |
| App page title (`PageHeader`) | `text-2xl font-semibold tracking-tight` |
| Section / card title | `text-base font-semibold tracking-tight` (`CardTitle`) |
| Body | `text-sm` |
| Secondary | `text-sm text-muted-foreground` |
| Meta, table headers, captions | `text-xs text-muted-foreground` |
| Hash / ID | `font-mono text-xs` (truncate or `break-all`) |

Do not use arbitrary sizes (`text-[13px]`), `uppercase tracking-wider` eyebrow labels, or more
than two weights on one screen (`font-medium` and `font-semibold`). The one exception is
`text-[10px]` for initials inside avatars of `size-6` or smaller.

## Spacing, radius, elevation

- 4px grid. Common steps: `gap-2` inside controls, `gap-4` between fields, `gap-6` between
  sections, `pb-8` under the page header.
- Radius: `rounded-md` for controls, `rounded-lg` for cards, dropzones, alerts and tables,
  `rounded-full` for pills and avatars. Nothing larger.
- Elevation: borders, not shadows. `shadow-xs` only on outline buttons and inputs; `shadow-sm`
  only on popovers, dialogs and the active segment of a segmented control.

## Layout

- App shell: 240px sidebar + 56px (`h-14`) header. Content area `px-6 py-8 md:px-10`.
- Content width: `max-w-5xl` for lists and dashboards, `max-w-3xl` for forms and settings,
  `max-w-2xl` for public single-purpose pages (verify, sign states, auth).
- Page anatomy: `PageHeader` → content. One `h1` per page.
- Settings: a vertical stack of `SettingsCard`s (`gap-6`), each with title, short description,
  content and an optional footer with the save action on the right.

## Components

| Need | Use |
| --- | --- |
| Action | `Button` — `default` (primary, one per view), `outline` (secondary), `ghost` (tertiary/icon), `destructive`, `link` |
| Sizes | `default` h-9 in forms and headers, `sm` h-8 in toolbars and table rows, `icon-sm` for icon-only |
| Text input | `Input`, `Textarea` inside `Field` |
| Pick one of a few | `ToggleGroup` (segmented) for 2–4 options, `RadioGroup` for options needing descriptions, `Select` for long lists |
| On/off setting | `Switch` |
| Grouped content | `Card` (`CardHeader`/`CardTitle`/`CardContent`/`CardFooter`) |
| List of records | `Table` inside a bordered `rounded-lg` container |
| Label/value pairs | `DetailList` + `DetailRow` |
| Record state | `StatusBadge` |
| Count / tag | `Badge variant="secondary"` or `outline` |
| Inline message | `Alert` (`default`, `info`, `success`, `warning`, `destructive`) |
| Explanation some users need | `InfoTip` next to the label it explains (opens on click/tap, not hover) |
| Transient feedback | `toast` from `sonner` — short past-tense sentence ("Link copied") |
| Nothing to show | `EmptyState` (title + one-line description + action) |
| File input | `Dropzone` |
| Copy a value | `CopyButton` |
| Modal task | `Dialog` with title, optional one-line description, footer with Cancel + primary |
| Confirm destructive | `Dialog`, not `window.confirm`/`window.prompt` |
| Loading | `Loader2` spinner inside the busy button; `Skeleton` for content |

Icons: `lucide-react`, `size-4` (default inside buttons), `size-3.5` in dense rows. Icons support
text; never use an icon alone without an `aria-label`.

### Organisation brand colour

A business's chosen colour appears only on surfaces its recipients see: the signer's primary
button, the org avatar/logo, and field highlights in the signing canvas. App chrome stays neutral.
Text on a brand-coloured surface is `text-white` (the colour is user-chosen, so no token fits).
Use `OrgAvatar` for a business's logo or initial.

### Paper

PDF pages and signature pads are physical paper: wrap them in the `light` class so they stay
white with dark ink in dark mode.

## Copy

Write for a busy business owner, a one-time signer and a stranger verifying a file.

- Say what a thing is in as few words as possible; prefer a good title over a title plus subtitle.
- Page descriptions are optional. Add one only if the user needs it to act — not to restate the
  title ("Documents" does not need "Everything this business has sealed, issued, or sent to sign").
- Don't narrate controls ("Click below to…"), report implementation ("Auto-resized to 256px"), or
  reassure generically ("Here's what's happening").
- Secondary information goes one layer down: an `InfoTip`, a collapsed `details`, a dialog, or the
  state where it matters (e.g. "DNS changes can take a few minutes" belongs in the failed-check
  message, not permanently under the button).
- No counts or sub-metrics that don't drive a decision ("1 this week").
- Keep honest caveats (unverified issuer, revocation, attribution limits) short and next to what
  they qualify.
- Errors say what happened and what to do next.
- Sentence case everywhere. No exclamation marks.
- Terms: **business** (not organisation), **document** (not envelope/contract), **timestamp**
  (not anchor/blockchain in everyday UI), **proof** / **proof link**, **Revoked**. Technical terms
  belong in collapsed technical sections.
