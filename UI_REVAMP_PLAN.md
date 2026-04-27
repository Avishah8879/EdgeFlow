# UI Revamp Plan — Equity Pro

## Context

The current UI mirrors Tickertape's compositional grammar (gauge-grid home, side-by-side scorecard layout on stock detail, dense tabular screener), creating real design-similarity exposure. This plan reskins the entire app into a **Robinhood-adjacent minimalist** direction while preserving 100% of functionality. No backend changes, no hooks rewritten, no API surface touched.

## Locked decisions

| Decision | Choice |
|----------|--------|
| Theme default | **Light** (dark mode preserved as a toggle option) |
| Accent color | **`#FF6B47` coral** (HSL `11 100% 64%`) |
| Chart restyle | **Deferred** — keep lightweight-charts / @nivo / recharts at their current themes; tackle in a follow-up after Phase 5 |
| Aesthetic direction | Robinhood-ish: pastel single-accent, oversized serif-on-numbers typography, mobile-first card stacks, framer-motion-driven micro-interactions |

## Token spec (Phase 1 will write these exact values)

### Color palette — `client/src/index.css`

**Light mode (`:root`):**
```css
--background: 60 9% 99%;       /* #FCFCFB warm off-white */
--foreground: 30 4% 4%;        /* #0A0A09 near-black warm */
--card: 0 0% 100%;             /* pure white for card elevation */
--card-foreground: 30 4% 4%;
--popover: 0 0% 100%;
--popover-foreground: 30 4% 4%;
--primary: 11 100% 64%;        /* #FF6B47 coral */
--primary-foreground: 0 0% 100%;
--secondary: 30 4% 96%;
--secondary-foreground: 30 4% 12%;
--muted: 30 4% 96%;
--muted-foreground: 30 4% 45%;
--accent: 30 4% 94%;
--accent-foreground: 30 4% 12%;
--destructive: 0 72% 51%;
--destructive-foreground: 0 0% 100%;
--border: 30 4% 90%;
--input: 30 4% 90%;
--ring: 11 100% 64%;           /* coral focus rings */
--positive: 152 60% 42%;       /* slightly muted emerald — distinct from coral */
--positive-foreground: 152 60% 32%;
--negative: 0 72% 51%;
--negative-foreground: 0 72% 41%;
--neutral: 30 4% 50%;
--radius: 0.75rem;             /* base radius bumped from 0.5rem */
```

**Dark mode (`.dark`):**
```css
--background: 30 4% 4%;
--foreground: 60 9% 96%;
--card: 30 4% 7%;
--card-foreground: 60 9% 96%;
--popover: 30 4% 7%;
--popover-foreground: 60 9% 96%;
--primary: 11 100% 64%;        /* same coral, works on both */
--primary-foreground: 0 0% 100%;
--secondary: 30 4% 12%;
--secondary-foreground: 60 9% 96%;
--muted: 30 4% 12%;
--muted-foreground: 30 4% 65%;
--accent: 30 4% 14%;
--accent-foreground: 60 9% 96%;
--border: 30 4% 15%;
--input: 30 4% 15%;
--ring: 11 100% 64%;
--positive: 152 50% 50%;
--negative: 0 72% 55%;
```

### Typography — `tailwind.config.ts` + `client/index.html`

```ts
// tailwind.config.ts (extend.fontFamily)
sans: ['Geist', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
mono: ['"Geist Mono"', '"JetBrains Mono"', 'ui-monospace', 'monospace'],
serif: ['"Instrument Serif"', 'Newsreader', 'ui-serif', 'serif'],
```

Add to `client/index.html` `<head>`:
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600;700&family=Geist+Mono:wght@400;500&family=Instrument+Serif:ital@0;1&display=swap" rel="stylesheet">
```

### Lucide icon weight

Add one rule to `client/src/index.css` so every existing `lucide-react` import becomes thin-stroke without per-call edits:
```css
.lucide { stroke-width: 1.25; }
```

### Theme default flip

`client/src/components/ThemeProvider.tsx` — change `defaultTheme="dark"` → `defaultTheme="light"`. Existing user choices stored in localStorage are honored; only first-visit defaults change.

## Phase plan

### Phase 1 — Tokens (≈1 day, 1 commit)

Touches 4 files, fully revertable:
- `client/src/index.css` — palette swap, radius bump, lucide rule
- `tailwind.config.ts` — font families, optional radius scale extensions
- `client/index.html` — Google Fonts `<link>`
- `client/src/components/ThemeProvider.tsx` — light default

**Acceptance**: every page in the app already looks materially different. Smoke-test with `npm run dev`. Sweep for any hardcoded `#ffa31a` orange that bypassed tokens (`grep -rni "ffa31a\|orange" client/src` minus any allowlisted brand-positive uses). Sweep for inline `text-green-*` / `text-red-*` that should be `text-positive` / `text-negative`.

### Phase 2 — Logo + brand assets (≈0.5 day, 1 commit)

- `client/src/components/EquityProLogo.tsx` — redesign SVG. Concept: abstract upward-trending curve (not arrow) in coral, paired with serif "Equity Pro" wordmark.
- `client/public/favicon.ico`, `apple-touch-icon.png` — regenerate from new logo
- `client/public/og-image.png` (or wherever it lives) — regenerate
- Verify [Navigation.tsx](EdgeFlow/client/src/components/Navigation.tsx) and [Footer.tsx](EdgeFlow/client/src/components/Footer.tsx) still consume the logo cleanly

**Open**: I can sketch the SVG concept in code, but you may want a designer round on the actual mark. We can ship a placeholder and swap later.

### Phase 3 — Layout primitives + motion library (≈1 day, 1 commit)

New files:
- `client/src/lib/motion.ts` — exports `fadeInUp`, `pageTransition`, `numberSpring` variants for `framer-motion`
- `client/src/components/HeroNumber.tsx` — oversized serif price (60–120px responsive) with spring-animated updates via `useMotionValue`
- `client/src/components/AnimatedNumber.tsx` — small ticker-flash component for live LTP cells

Modified:
- `client/src/components/ui/card.tsx` — bump default padding (`p-6` → `p-8` on lg variant), add a `hover-lift` variant
- `client/src/App.tsx` — wrap `<AppRoutes>` in `<AnimatePresence mode="wait">`, give each `<Route>` element a motion wrapper key

**Acceptance**: navigate between pages — see cross-fade. Hit a page with live prices — see numbers spring on update.

### Phase 4 — Page reflows (≈5–7 days, 4 commits)

This is where lookalike risk actually lives. One commit per page so each is independently reviewable.

**4a. [Home.tsx](EdgeFlow/client/src/pages/Home.tsx)** (1 day)
- Replace gauge-grid composition with a single full-bleed "Today" hero card: Nifty 50 in `<HeroNumber>`, sparkline, change %, market-status pill
- Below: horizontal scroll-snap row for top movers (no longer a grid)
- Below: vertical sector cards (Sankey-style mini-bars, 1-per-row on mobile, 2-up on desktop)
- F&G gauge moves off the home page into a dedicated `/mood` route (small new page, reuses existing `useMarketMood` hook untouched)

**4b. [StockDetail.tsx](EdgeFlow/client/src/pages/StockDetail.tsx)** (2 days, highest-risk page)
- Top: hero price section. Ticker symbol in mono, price in `<HeroNumber>`, change in colored chip
- Sticky action bar below price: Watchlist / Ask Equity Pro / Compare (single row, full-width on mobile)
- Everything else collapses into accordion sections (using existing shadcn `Collapsible`): Chart → Scorecard → Financials (Sankey + Reverse DCF) → Shareholding → Analyst → News
- Scorecard's 7 dimensions become a horizontal scroll-snap rail, not a grid
- Action-cards-with-hover-expand pattern (the most Tickertape-like piece) gets removed entirely; the actions move into the sticky bar

**4c. [Screener.tsx](EdgeFlow/client/src/pages/Screener.tsx) + [Stocks.tsx](EdgeFlow/client/src/pages/Stocks.tsx)** (1.5 days)
- Filter sheet slides up from bottom (use shadcn `Sheet` with `side="bottom"`); replaces the inline filter sidebar
- Results render as a vertical card list with avatar-style ticker badges (initials + coral background), not a table
- Sort + filter state preserved verbatim — only the rendering changes
- Pagination becomes infinite-scroll with `IntersectionObserver`

**4d. [Indices.tsx](EdgeFlow/client/src/pages/Indices.tsx) + [IndexDetail.tsx](EdgeFlow/client/src/pages/IndexDetail.tsx)** (1 day)
- Indices hub: card grid replaced with a 2-up vertical stack on mobile, 3-up on desktop. Each card has the index name as a serif heading and the current value in `<HeroNumber>`
- IndexDetail: hero-card pattern matching StockDetail, then constituents list

### Phase 5 — QA sweep (≈1–2 days, 1 commit if needed)

Spot-check every route inheriting Phase 1 tokens:
- Admin (11 pages): [/admin](EdgeFlow/client/src/pages/admin/) — should mostly Just Work; expect 2-3 spacing tweaks
- Auth (5 pages): EquityProLogin, Signup, ForgotPassword, OAuthSetup, AuthCallback
- FT terminal (24 pages under [client/src/pages/ft/](EdgeFlow/client/src/pages/ft/))
- Tip-tease chat
- Developer portal
- Profile

For each: verify dark mode toggle still works, verify the original orange isn't lurking anywhere, screenshot-compare critical paths.

## Total cost

**~9–12 dev days.** End of week 1 (Phases 1-3): app already looks completely different. End of week 2 (Phases 4-5): no longer compositionally resembles Tickertape.

## What stays untouched

- All hooks, all server code, all `*.py`, all migrations
- TanStack Query keys (no cache invalidation)
- Auth flows, JWT, sessions
- API routes
- Existing chart libraries (deferred to a follow-up pass)
- localStorage keys (still preserves users' saved state)
- Wouter routing structure (only the rendering inside each `<Route>` changes)

## Verification per phase

- After Phase 1: `npm run check`, `npm run build`, manual visit `/`, `/login`, `/stocks/RELIANCE`, `/admin` — see new palette + fonts everywhere, no console errors
- After Phase 2: Browser tab favicon shows new mark, navigation logo updated, OG-image-debug renders new card
- After Phase 3: Cross-fade visible between routes; live LTP cells flash on update
- After Phase 4: Each page reviewed against the design spec above; mobile viewport (375px) tested for every reflowed page
- After Phase 5: All admin/auth/FT pages still render without layout breakage in both themes
