# CLAUDE.md — EquityPro design-system migration

> Auto-loaded by Claude Code when working anywhere under this folder.
> If you're an engineer reading this, the same rules apply.

## Your role

You are integrating a finished visual design (`design/equitypro-v1/`) into the
existing EquityPro web application. The reference is **56 static HTML pages**
plus `app.css`, `app.js`, and `assets/`.

**Treat the reference as a visual spec, not as source code.** Do not copy the
HTML or vanilla JS verbatim. Rebuild every page using the framework,
components, data layer, and routing already present in the host app.

Read `DESIGN_NOTES.md` (in this folder) before doing anything else. It is the
source of truth for tokens, type, components, and migration order.

## Hard rules

1. **Do not introduce a new CSS framework or component library.** Adapt the
   design to whatever the host app uses (Tailwind, shadcn/ui, CSS modules,
   etc.). If the host has Tailwind, lift tokens into `tailwind.config`. If it
   has CSS variables, lift them there.
2. **Do not change API routes, data schemas, auth flows, or business logic.**
   This is a UI migration, full stop.
3. **Do not copy `app.js` verbatim.** It is vanilla-JS demo plumbing
   (top-bar injection, theme toggle, mobile nav). Rebuild those behaviors via
   the host app's existing theme provider, router, and layout components.
4. **Do not hard-code colors.** Every color must reference a token from the
   theme. Even one-off chart colors map to `--chart-1` … `--chart-5`.
5. **Do not hard-code mock data.** Every number, ticker, news item, and
   chart series in the reference is mock. Replace with real hooks/queries
   from the existing data layer.
6. **All numeric values use mono + tabular-nums.** Prices, percentages, P/E,
   volumes, market cap, dates in tables — all mono. This is the
   "premium terminal" visual signal; do not break it.
7. **Semantic colors only for gains/losses.** Use `text-positive` /
   `text-negative` (or whatever helper classes exist in the host app) — never
   raw green / red hex.
8. **Preserve all existing loading, error, empty, and permission states**
   from the current pages. The reference design assumes happy-path data; you
   must keep the existing UX for the unhappy paths.
9. **Accessibility ≥ existing.** Focus rings, ARIA labels, keyboard nav, and
   screen-reader behavior must be at least as good as what's currently
   shipping. Eyebrow labels are `<span>`, not headings.

## Workflow Claude Code must follow

### Step 1 — Read & plan (do not skip)
1. Read `design/equitypro-v1/all-pages.html` and `design/equitypro-v1/app.css`
   end to end.
2. Read `DESIGN_NOTES.md` in this folder end to end.
3. Inspect the host app: `package.json`, the routing tree, the existing
   theme/token file, the existing component library, and the data-fetching
   pattern (server components / RSC / SWR / React Query / etc.).

### Step 2 — Produce a migration plan
Write `MIGRATION_PLAN.md` at the host repo root with:
- The exact destination for design tokens (file path and format).
- A page → route table covering all 56 reference files. For each row:
  `reference file | existing route | status (new / replace / extend)`.
- A list of new component primitives to add and where they live.
- Anything in the design that conflicts with current functionality.

**Stop and wait for human approval before writing code.**

### Step 3 — Token & shell migration
1. Extract all color, type, radius, shadow, and motion tokens from
   `app.css` and `colors_and_type.css` into the host theme.
2. Implement light/dark via the host's existing theme provider; the reference
   uses `.dark` on `<html>` — wire it through whatever the host already has.
3. Migrate the top-bar and footer into the host's layout components.
4. Smoke-test on one existing page. **Stop for review.**

### Step 4 — Component primitives
Build the reusable pieces from §6 of `DESIGN_NOTES.md` (Button, Card,
Eyebrow, KpiTile, DeltaBadge, MarketStatusPill, Sparkline, DataTable, TabBar,
ChipFilter, ScorecardRing, HeatmapCell, PayoffChart). Show them on a
`/_design` route or Storybook. **Stop for review.**

### Step 5 — Page-by-page migration
Work in this order (see `DESIGN_NOTES.md` §8):
1. Pricing or Privacy (simplest)
2. Dashboard
3. Stock detail
4. Remaining pages in batches of 5–8, grouped by section

For each page:
- Use the reference HTML purely as a visual spec.
- Rebuild using the host's components/framework.
- Wire to the existing data layer; preserve loading/error/empty/permission states.
- Open a focused PR or commit. Show a diff. **Stop before the next page.**

## Defaults & conventions

- **Charting library:** ask which lib the host already uses. Map series colors
  to `--chart-1` … `--chart-5`. Do not add a new chart lib.
- **Tables:** if the host already has a table component, extend it with the
  reference's mono cells / sticky header / hover-row treatment.
- **Icons:** use whatever icon set the host already imports. The reference
  uses inline SVG and a few unicode glyphs as placeholders — do not adopt the
  unicode glyphs.
- **Dates & timezones:** keep whatever the host currently does (date-fns,
  dayjs, Intl). Do not switch libraries.

## When in doubt

- Prefer **fewer changes** to the host's existing code over more.
- Prefer **more questions to the human** over more guesses.
- Prefer **stopping and showing a diff** over batching multiple pages.

## Things you should never do

- Run `rm -rf` on existing components or routes.
- Replace the host's CSS framework with a different one.
- Add a runtime dependency that isn't already in `package.json` without asking.
- Mock or stub the existing API. If a page needs new data, surface that as a
  question, not a workaround.
- Ship a page with the reference's mock data still present.

If you're unsure, stop and ask. The human reviewing your work will tell you
whether to proceed.
