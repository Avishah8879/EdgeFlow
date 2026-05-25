---
name: edgeflow-design-system
description: EdgeFlow / Tiphub design system. Brand color tokens, typography, components, and copy voice for the Tiphub financial analytics product (financial UI, dark default, NSE focus).
---

# EdgeFlow / Tiphub design system skill

When the user asks for designs, mocks, or prototypes for **Tiphub / EdgeFlow** — or anything described as "our financial analytics product", "stock analysis platform", "NSE screener", "trading dashboard", etc — load this skill.

## Setup

1. Read `README.md` for full content/visual fundamentals + iconography.
2. Link `colors_and_type.css` from any HTML file you build:
   ```html
   <link rel="stylesheet" href="path/to/edgeflow-design-system/colors_and_type.css">
   ```
3. Use Lucide icons via CDN: `<script src="https://unpkg.com/lucide@latest"></script>` then `lucide.createIcons()`.
4. Reference React components in `reference/components/*.tsx` and pages in `reference/pages/*.tsx` as ground truth — copy their structure and class patterns, don't invent new ones.

## Critical do's

- **Dark theme by default.** Add `class="dark"` to nothing — `:root` is dark; `.light` opts into light mode.
- **Numbers in mono.** Every price, %, indicator value uses `font-family: var(--font-mono)` and `font-variant-numeric: tabular-nums`.
- **Uppercase eyebrow labels** above every metric and card title (`.eyebrow` utility class).
- **Cyan = interface primary, Orange = brand.** Don't confuse them. Buttons/links/focus rings are cyan; the wordmark and "Run" shimmer are orange.
- **Lucide icons only.** No emoji.
- **+/− signs always shown** on financial deltas; Indian-locale number formatting (`22,041.45`, `₹2,847.50`).

## Critical don'ts

- No gradients on chrome surfaces (only on the gradient-glow card border, run-button shimmer, attractor fallback).
- No drop-shadows in dark mode — use colored glows.
- No emoji, anywhere.
- Don't translate jargon (RSI, MACD, Calmar, Sankey stay as-is).
- Don't use system fonts — Geist + JetBrains Mono are required.

## Tokens cheat sheet

`hsl(var(--primary))` cyan · `hsl(var(--brand-orange))` orange · `hsl(var(--positive))` green · `hsl(var(--negative))` red · `hsl(var(--background))` page · `hsl(var(--card))` card · `hsl(var(--border))` hairline · `hsl(var(--muted-foreground))` secondary text.
