# Tiphub Design Guidelines

**Version:** 2.0
**Last Updated:** 2025-11-30
**Project:** Tiphub - Financial Market Analysis Platform

---

## Table of Contents

1. [Brand Identity & Colors](#1-brand-identity--colors)
2. [Typography System](#2-typography-system)
3. [Spacing & Layout](#3-spacing--layout)
4. [Component Library](#4-component-library)
5. [Navigation Patterns](#5-navigation-patterns)
6. [Data Visualization](#6-data-visualization)
7. [Financial Data Patterns](#7-financial-data-patterns)
8. [Responsive Design](#8-responsive-design)
9. [Icons & Iconography](#9-icons--iconography)
10. [Animations & Micro-interactions](#10-animations--micro-interactions)
11. [Forms & Validation](#11-forms--validation)
12. [Special UI Patterns](#12-special-ui-patterns)
13. [Accessibility](#13-accessibility)
14. [Code Patterns & Best Practices](#14-code-patterns--best-practices)
15. [CSS Variables & Theming](#15-css-variables--theming)
16. [shadcn/ui Integration](#16-shadcnui-integration)

---

## 1. Brand Identity & Colors

### 1.1 Primary Brand Color

**Orange (Primary Accent)**
- **HEX:** `#ffa31a`
- **HSL:** `35 100% 55%`
- **RGB:** `255, 163, 26`
- **CSS Variable:** `--primary: 35 100% 55%`

**Usage:**
- Logo icon (upward arrow)
- Primary buttons and CTAs
- Active navigation states
- Links and interactive elements
- Focus rings and highlights
- Chart accent color

**Accessibility:**
- Contrast ratio on dark background: 8.2:1 (AAA)
- Contrast ratio on white background: 4.1:1 (AA)

**Code Example:**
```tsx
// Primary button
<Button className="bg-primary text-primary-foreground hover-elevate">
  Analyze Sentiment
</Button>

// Primary text/link
<span className="text-primary">View Details</span>

// Primary border
<div className="border-2 border-primary">Featured</div>
```

---

### 1.2 Dark Theme Color Palette

#### Base Surface Colors

| Color Name | HEX | HSL | CSS Variable | Usage |
|------------|-----|-----|--------------|-------|
| Background (Main) | `#1b1b1b` | `0 0% 11%` | `--background` | Page background, main canvas |
| Card Background | `#242424` | `0 0% 14%` | `--card` | Card surfaces, elevated elements |
| Sidebar | N/A | `0 0% 12%` | `--sidebar` | Sidebar panels |
| Accent | N/A | `0 0% 18%` | `--accent` | Accent panels, code blocks |
| Secondary | N/A | `0 0% 20%` | `--secondary` | Secondary buttons, badges |
| Muted | N/A | `0 0% 18%` | `--muted` | Muted backgrounds, disabled states |

**Layering Strategy:**
- Background (11%) → Card (14%) → Elevated Card (18%)
- Creates visual hierarchy through subtle contrast
- Maintains readability while avoiding harsh edges

---

#### Text Colors

| Color Name | HSL | CSS Variable | Usage |
|------------|-----|--------------|-------|
| Foreground (Primary Text) | `0 0% 100%` | `--foreground` | Main text, headings |
| Muted Foreground | `0 0% 70%` | `--muted-foreground` | Secondary text, descriptions |
| Secondary Foreground | `0 0% 92%` | `--secondary-foreground` | Text on secondary backgrounds |

**Hierarchy:**
1. Foreground (100%) - Headings, important text
2. Secondary Foreground (92%) - Body text
3. Muted Foreground (70%) - Helper text, labels

---

#### Border Colors

| Color Name | HEX | HSL | CSS Variable | Usage |
|------------|-----|-----|--------------|-------|
| Border | `#333333` | `0 0% 20%` | `--border` | Default borders |
| Card Border | N/A | `0 0% 22%` | `--card-border` | Card outlines |
| Input Border | N/A | `0 0% 26%` | `--input` | Input field borders |

**Border Strategy:**
- Use sparingly for separation
- Increase contrast on hover/focus
- Combine with background changes for depth

---

### 1.3 Financial Data Colors

#### Semantic Color Tokens

Tiphub uses **semantic color tokens** that automatically adapt to light/dark themes. Never use hardcoded Tailwind colors like `green-600` or `red-600`.

| Semantic | CSS Variable | Tailwind Class | Usage |
|----------|--------------|----------------|-------|
| Positive/Gains/Bullish | `--positive` | `text-positive` / `bg-positive` | Price increases, positive sentiment |
| Negative/Losses/Bearish | `--negative` | `text-negative` / `bg-negative` | Price decreases, negative sentiment |
| Neutral | `--neutral` | `text-neutral` / `text-neutral-foreground` | Neutral sentiment, no change |

**Foreground Variants (for text on colored backgrounds):**
- `--positive-foreground` / `text-positive-foreground` - Darker green for text
- `--negative-foreground` / `text-negative-foreground` - Darker red for text
- `--neutral-foreground` / `text-neutral-foreground` - Gray for text

**Tailwind Configuration:**
```typescript
// tailwind.config.ts
colors: {
  positive: {
    DEFAULT: "hsl(var(--positive))",
    foreground: "hsl(var(--positive-foreground))",
  },
  negative: {
    DEFAULT: "hsl(var(--negative))",
    foreground: "hsl(var(--negative-foreground))",
  },
  neutral: {
    DEFAULT: "hsl(var(--neutral))",
    foreground: "hsl(var(--neutral-foreground))",
  },
}
```

**Code Example:**
```tsx
const isPositive = changePercent >= 0;

<div className={isPositive ? 'text-positive' : 'text-negative'}>
  {isPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
  <span>{isPositive ? '+' : ''}{changePercent.toFixed(2)}%</span>
</div>
```

**Anti-Patterns:**
```tsx
// ❌ DON'T use hardcoded colors (not theme-aware)
<div className="text-green-600">+2.5%</div>
<div className="text-red-600">-1.2%</div>

// ❌ DON'T use change value directly (could be 0)
const isPositive = change >= 0;

// ✅ DO use semantic tokens
<div className="text-positive">+2.5%</div>
<div className="text-negative">-1.2%</div>

// ✅ DO use changePercent
const isPositive = changePercent >= 0;
```

---

### 1.4 Chart Color Palette

**Semantic Chart Colors (CSS Variables):**
```css
/* Financial chart colors - theme-aware */
--chart-positive: 142 71% 45%;   /* Green for gains/bullish */
--chart-negative: 0 72% 51%;     /* Red for losses/bearish */
--chart-neutral: 0 0% 60%;       /* Gray for neutral data */
--chart-volume: 0 0% 40%;        /* Subtle gray for volume bars */
```

**Using Chart Colors with `getCSSColor()`:**
```tsx
import { getCSSColor } from '@/lib/theme-utils';

// For lightweight-charts or other charting libraries
const chartOptions = {
  upColor: getCSSColor('--chart-positive'),
  downColor: getCSSColor('--chart-negative'),
  volumeColor: getCSSColor('--chart-volume'),
};
```

**Candlestick Colors (Theme-Aware):**
```tsx
// Use getCSSColor() helper from theme-utils.ts
import { getCSSColor } from '@/lib/theme-utils';

// Bullish (Up) Candles
upColor: getCSSColor('--chart-positive'),
wickUpColor: getCSSColor('--positive-foreground'),
borderUpColor: getCSSColor('--chart-positive'),

// Bearish (Down) Candles
downColor: getCSSColor('--chart-negative'),
wickDownColor: getCSSColor('--negative-foreground'),
borderDownColor: getCSSColor('--chart-negative'),
```

**Price Line:**
```tsx
priceLineColor: getCSSColor('--primary'),  // Orange
priceLineWidth: 2
```

**Theme-Aware Chart Hook:**
```tsx
// Use useChartTheme hook for real-time theme changes
import { useChartTheme } from '@/hooks/use-chart-theme';

function PriceChart() {
  const chartColors = useChartTheme();
  // chartColors updates automatically when theme changes
}
```

---

### 1.5 Status & Sentiment Colors

#### Sentiment Badges

Use semantic color tokens for theme-aware sentiment styling:

```tsx
// Positive Sentiment (uses --positive CSS variable)
className="bg-positive text-positive-foreground"

// Negative Sentiment (uses --negative CSS variable)
className="bg-negative text-negative-foreground"

// Neutral Sentiment (uses --neutral CSS variable)
className="bg-neutral/20 text-neutral-foreground"
```

**Helper Functions** (from `client/src/lib/theme-utils.ts`):
```tsx
import { getSentimentBadgeClass, getSentimentColorClass } from '@/lib/theme-utils';

// For badge backgrounds
<Badge className={getSentimentBadgeClass('positive')}>Bullish</Badge>

// For text colors
<span className={getSentimentColorClass('negative')}>Bearish</span>
```

#### Status Indicators

| Status | RGB | Usage |
|--------|-----|-------|
| Online/Active | `rgb(34 197 94)` | Online status, active connections |
| Away/Warning | `rgb(245 158 11)` | Away status, warnings |
| Busy/Error | `rgb(239 68 68)` | Busy status, errors |
| Offline | `rgb(156 163 175)` | Offline status, inactive |

---

### 1.6 Elevation System

**Overlay Layers for Depth:**

```css
/* Dark mode (default) */
--elevate-1: rgba(255, 255, 255, 0.04)  /* Hover state */
--elevate-2: rgba(255, 255, 255, 0.09)  /* Active/pressed state */
--button-outline: rgba(255, 255, 255, 0.08)
--badge-outline: rgba(255, 255, 255, 0.05)

/* Light mode overrides */
.light {
  --elevate-1: rgba(0, 0, 0, 0.04);
  --elevate-2: rgba(0, 0, 0, 0.09);
  --button-outline: rgba(0, 0, 0, 0.08);
  --badge-outline: rgba(0, 0, 0, 0.05);
}
```

**Base Implementation:**
```css
.hover-elevate::after {
  content: '';
  position: absolute;
  inset: 0;
  background-color: var(--elevate-1);
  opacity: 0;
  transition: opacity 0.2s;
  pointer-events: none;
  border-radius: inherit;
}

.hover-elevate:hover::after {
  opacity: 1;
}
```

**Available Elevation Utilities:**

| Utility | Effect | Use Case |
|---------|--------|----------|
| `hover-elevate` | Light overlay on hover | Cards, list items |
| `hover-elevate-2` | Stronger overlay on hover | Important interactive elements |
| `active-elevate` | Light overlay on press | Buttons, toggles |
| `active-elevate-2` | Stronger overlay on press | Primary buttons |
| `toggle-elevate` | Overlay when toggled on | Toggle buttons, filters |
| `toggle-elevated` | Permanent elevated state | Selected items |

**Implementation for New Utilities:**
```css
/* Stronger hover effect */
.hover-elevate-2::after {
  background-color: var(--elevate-2);
}

/* Active/pressed states */
.active-elevate:active::after { opacity: 1; }
.active-elevate-2:active::after {
  opacity: 1;
  background-color: var(--elevate-2);
}

/* Toggle states (use with data-state or aria-pressed) */
.toggle-elevate[data-state="on"]::after,
.toggle-elevate[aria-pressed="true"]::after {
  opacity: 1;
}

.toggle-elevated {
  background-color: var(--elevate-1);
}
```

**Usage Examples:**
```tsx
// Card hover
<Card className="hover-elevate cursor-pointer">

// Button with stronger press effect
<Button className="hover-elevate active-elevate-2">

// Toggle button
<Toggle className="toggle-elevate" data-state={isOn ? "on" : "off"}>

// Selected item (permanent elevation)
<div className={cn("hover-elevate", isSelected && "toggle-elevated")}>
```

---

### 1.7 Color Decision Tree

**When to use which color (always use semantic tokens):**

```
Need to indicate data direction?
├─ Positive/Increase → text-positive / bg-positive
├─ Negative/Decrease → text-negative / bg-negative
└─ Neutral/No change → text-neutral / bg-neutral

Need market status?
├─ Market Open → text-[hsl(var(--status-open))]
├─ Market Closed → text-[hsl(var(--status-closed))]
└─ Pre/Post Market → text-[hsl(var(--status-pre-market))]

Need a button?
├─ Primary action → bg-primary (orange)
├─ Secondary action → bg-secondary (gray)
├─ Destructive action → bg-destructive (red)
└─ Subtle action → variant="ghost"

Need a background?
├─ Main page → bg-background
├─ Card/Panel → bg-card
├─ Elevated element → bg-accent
└─ Interactive hover → hover-elevate

Need text?
├─ Heading/Important → text-foreground
├─ Body text → text-secondary-foreground
├─ Helper/Label → text-muted-foreground
└─ Link/Interactive → text-primary (orange)

Need chart colors?
├─ Price up/gains → getCSSColor('--chart-positive')
├─ Price down/losses → getCSSColor('--chart-negative')
├─ Volume bars → getCSSColor('--chart-volume')
└─ Neutral data → getCSSColor('--chart-neutral')
```

**Important:** Never use hardcoded colors like `text-green-600` or `text-red-600`. Always use semantic tokens for theme compatibility.

---

## 1A. Theme System

### 1A.1 Overview

Tiphub supports light and dark themes using `next-themes` (v0.4.6). The default theme is **dark mode**.

**Key Components:**
- `ThemeProvider` - Wraps the app in `client/src/App.tsx`
- `ModeToggle` - Theme toggle button (`client/src/components/ModeToggle.tsx`)
- CSS Variables - Theme-specific values in `client/src/index.css`

### 1A.2 Configuration

**ThemeProvider Setup (App.tsx):**
```tsx
import { ThemeProvider } from "next-themes";

function App() {
  return (
    <ThemeProvider
      attribute="class"      // Uses .light class for light mode
      defaultTheme="dark"    // Default to dark theme
      enableSystem={false}   // Disable system preference detection
    >
      <YourApp />
    </ThemeProvider>
  );
}
```

### 1A.3 ModeToggle Component

**Location:** `client/src/components/ModeToggle.tsx`

```tsx
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";

export function ModeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
    >
      <Sun className="h-5 w-5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
      <Moon className="absolute h-5 w-5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
      <span className="sr-only">Toggle theme</span>
    </Button>
  );
}
```

### 1A.4 FOUC Prevention

**Flash of Unstyled Content (FOUC)** is prevented by:

1. `:root` contains dark mode colors (matches `defaultTheme="dark"`)
2. `.light` class overrides for light mode
3. Theme class applied to `<html>` before React hydrates

**CSS Structure:**
```css
/* Dark mode (default) */
:root {
  --background: 0 0% 11%;
  --foreground: 0 0% 100%;
  /* ...dark colors */
}

/* Light mode (only when .light class present) */
.light {
  --background: 0 0% 98%;
  --foreground: 0 0% 5%;
  /* ...light colors */
}
```

### 1A.5 Theme-Aware Component Patterns

**Reading Current Theme:**
```tsx
import { useTheme } from "next-themes";

function MyComponent() {
  const { theme, resolvedTheme } = useTheme();
  // resolvedTheme is the actual theme ("light" or "dark")
  // theme could be "system" which then resolves
}
```

**Conditional Styling:**
```tsx
// Using Tailwind dark: modifier
<div className="bg-white dark:bg-gray-900">

// Using theme directly (avoid if possible)
<div className={theme === 'dark' ? 'bg-black' : 'bg-white'}>
```

**Best Practices:**
- Prefer CSS variables over conditional JavaScript
- Use Tailwind's `dark:` modifier for simple toggles
- Use `resolvedTheme` not `theme` when checking actual state
- Avoid flash by not rendering theme-dependent UI until mounted

### 1A.6 Light Mode Overrides

Key adjustments for light mode readability:

| Token | Dark Mode | Light Mode |
|-------|-----------|------------|
| `--positive` | `142 71% 45%` | `142 71% 35%` (darker green) |
| `--negative` | `0 72% 51%` | `0 72% 45%` (darker red) |
| `--elevate-1` | `rgba(255,255,255,0.04)` | `rgba(0,0,0,0.04)` |
| `--elevate-2` | `rgba(255,255,255,0.09)` | `rgba(0,0,0,0.09)` |

---

## 1B. Theme Utilities

**Location:** `client/src/lib/theme-utils.ts`

### 1B.1 CSS Variable Reader

```tsx
import { getCSSColor } from '@/lib/theme-utils';

// Read any CSS variable as a color string
const positiveColor = getCSSColor('--positive');  // Returns "hsl(142 71% 45%)"
const chartGreen = getCSSColor('--chart-positive');

// Use with charting libraries that need color strings
const chartOptions = {
  upColor: getCSSColor('--chart-positive'),
  downColor: getCSSColor('--chart-negative'),
};
```

### 1B.2 Value Color Helpers

```tsx
import {
  getValueColorClass,
  getSentimentColorClass,
  getSentimentBadgeClass
} from '@/lib/theme-utils';

// Numeric value coloring (positive/negative/zero)
<span className={getValueColorClass(changePercent)}>
  {changePercent}%
</span>

// Sentiment text colors
<span className={getSentimentColorClass('positive')}>Bullish</span>
<span className={getSentimentColorClass('negative')}>Bearish</span>
<span className={getSentimentColorClass('neutral')}>Neutral</span>

// Sentiment badge backgrounds
<Badge className={getSentimentBadgeClass('positive')}>Buy</Badge>
```

### 1B.3 Market Status Helpers

```tsx
import { getStatusColorClass } from '@/lib/theme-utils';

// Market status colors
<span className={getStatusColorClass('open')}>Market Open</span>
<span className={getStatusColorClass('closed')}>Market Closed</span>
<span className={getStatusColorClass('pre-market')}>Pre-Market</span>
```

### 1B.4 Rating Helpers

```tsx
import { getRatingColorClass, getRatingTextClass } from '@/lib/theme-utils';

// Analyst rating backgrounds
<Badge className={getRatingColorClass('buy')}>Buy</Badge>
<Badge className={getRatingColorClass('sell')}>Sell</Badge>
<Badge className={getRatingColorClass('hold')}>Hold</Badge>

// Rating text colors only
<span className={getRatingTextClass('strong_buy')}>Strong Buy</span>
```

### 1B.5 Financial Formatting

```tsx
import { formatFinancialValue } from '@/lib/theme-utils';

// Indian numbering format
formatFinancialValue(15000000);    // "1.50 Cr"
formatFinancialValue(500000);      // "5.00 L"
formatFinancialValue(25000);       // "25.00 K"
formatFinancialValue(999);         // "999"

// With currency symbol
formatFinancialValue(15000000, { currency: true });  // "₹1.50 Cr"
```

---

## 1C. Smart Loading System

### 1C.1 Overview

The smart loading system prevents UI flicker by only showing skeletons when data takes longer than 300ms to load.

**Key Files:**
- `client/src/hooks/use-smart-loader.ts` - Core hook
- `client/src/components/LoadingSkeleton.tsx` - Skeleton components

### 1C.2 useSmartLoader Hook

```tsx
import { useSmartLoader } from '@/hooks/use-smart-loader';

function StockCard({ ticker }: { ticker: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['stock', ticker],
    queryFn: () => fetchStock(ticker),
  });

  const { showSkeleton, shouldAnimate } = useSmartLoader(isLoading);

  if (showSkeleton) {
    return <StockCardSkeleton />;
  }

  return (
    <AnimatePresence>
      {shouldAnimate ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2 }}
        >
          <StockCardContent data={data} />
        </motion.div>
      ) : (
        <StockCardContent data={data} />
      )}
    </AnimatePresence>
  );
}
```

**Behavior:**
- If data loads in < 300ms: No skeleton shown, no animation
- If data loads in > 300ms: Skeleton shown, then fade animation to content

### 1C.3 Skeleton Components

```tsx
import {
  Skeleton,
  StockCardSkeleton,
  IndexCardSkeleton,
  ChartSkeleton,
  TableSkeleton,
  CardContentSkeleton
} from '@/components/LoadingSkeleton';

// Base skeleton with pulse animation
<Skeleton className="h-4 w-[200px]" />

// Pre-built component skeletons
<StockCardSkeleton />      // Stock card placeholder
<IndexCardSkeleton />      // Index card placeholder
<ChartSkeleton />          // Chart placeholder with axes
<TableSkeleton rows={5} /> // Table with n rows
<CardContentSkeleton />    // Generic card content
```

### 1C.4 AnimatePresence Integration

```tsx
import { AnimatePresence, motion } from 'framer-motion';

function DataSection({ data, isLoading }) {
  const { showSkeleton, shouldAnimate } = useSmartLoader(isLoading);

  return (
    <AnimatePresence mode="wait">
      {showSkeleton ? (
        <motion.div
          key="skeleton"
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          <DataSkeleton />
        </motion.div>
      ) : (
        <motion.div
          key="content"
          initial={shouldAnimate ? { opacity: 0 } : false}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2 }}
        >
          <DataContent data={data} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
```

---

## 1D. Custom Hooks Reference

### 1D.1 Data Fetching Hooks

| Hook | Purpose | Refetch Interval |
|------|---------|------------------|
| `useMarketMood()` | Fear & Greed Index | 15 minutes |
| `useMarketStatus()` | NSE market open/closed | 60 seconds |
| `useMarketMovers()` | Top gainers/losers | 5 minutes |
| `useStockLtp(ticker)` | Single stock LTP | On demand |
| `useIndices()` | All market indices | 5 minutes |
| `useTechnicalIndicators(ticker)` | Technical analysis | On demand |

### 1D.2 useMarketMood

```tsx
import { useMarketMood } from '@/hooks/use-market-mood';

function FearGreedGauge() {
  const { data, isLoading, error } = useMarketMood();

  // data.status: 'live' | 'stale' | 'default'
  // data.current: { value: 45, category: 'Fear', timestamp: '...' }
  // data.history: Array of 5-day historical values
}
```

### 1D.3 useMarketStatus

```tsx
import { useMarketStatus } from '@/hooks/use-market-status';

function MarketIndicator() {
  const { data, isLoading } = useMarketStatus();

  // data.is_open: boolean
  // data.status: 'PRE-MARKET' | 'OPEN' | 'POST-MARKET' | 'CLOSED'
  // data.message: Human-readable status
  // data.next_open: Next market open time
}
```

### 1D.4 useSearch

```tsx
import { useSearch } from '@/hooks/use-search';

function SearchBar() {
  const {
    results,        // Search results with prices
    isLoading,      // Initial search loading
    isPricesLoading, // Price data loading
    error,
    query,
    cancelSearch    // Cancel pending requests
  } = useSearch(searchTerm, { limit: 20 });
}
```

### 1D.5 useChartTheme

```tsx
import { useChartTheme } from '@/hooks/use-chart-theme';

function PriceChart() {
  const chartColors = useChartTheme();
  // Returns colors that update when theme changes:
  // chartColors.upColor, chartColors.downColor,
  // chartColors.volumeColor, chartColors.gridColor, etc.
}
```

### 1D.6 useSmartLoader

```tsx
import { useSmartLoader } from '@/hooks/use-smart-loader';

function DataComponent({ isLoading }) {
  const { showSkeleton, shouldAnimate } = useSmartLoader(isLoading, {
    delay: 300,  // ms before showing skeleton (default: 300)
  });
}
```

---

## 2. Typography System

### 2.1 Font Families

#### Sans-Serif (Default)
```css
--font-sans: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif
```
- **Primary Use:** All UI text, headings, body copy, buttons, navigation
- **Characteristics:** Clean, modern, highly readable
- **Font Weights Available:** 300, 400, 500, 600, 700, 800
- **Variable Font:** Yes (Inter supports variable font technology)

**Why Inter?**
- Designed specifically for screens
- Excellent legibility at small sizes
- Wide range of weights for hierarchy
- OpenType features for numbers (tabular figures)

#### Monospace (Financial Data)
```css
--font-mono: "JetBrains Mono", Menlo, Monaco, "Courier New", monospace
```
- **Primary Use:** Prices, tickers, percentages, technical indicators, code
- **Characteristics:** Fixed-width, easy to scan numbers
- **Font Weights Available:** 400, 500, 600, 700

**Why Monospace for Financial Data?**
- Aligns digits vertically in tables
- Makes numbers easier to compare
- Professional financial terminal aesthetic
- Prevents layout shifts when numbers change

#### Serif (Optional)
```css
--font-serif: Georgia, "Times New Roman", Times, serif
```
- **Primary Use:** Rarely used, available for special content
- **Usage Example:** Long-form articles, editorial content

---

### 2.2 Type Scale

| Class | Size (px/rem) | Line Height | Font Weight | Usage | Example |
|-------|---------------|-------------|-------------|-------|---------|
| `text-3xl font-bold` | 32px / 2rem | 1.25 | 700 | Page titles | "AI-Powered Sentiment Analysis" |
| `text-2xl font-bold` | 24px / 1.5rem | 1.33 | 700 | Major sections | "Market Overview" |
| `text-xl font-semibold` | 20px / 1.25rem | 1.4 | 600 | Section headers | "Today's Stocks" |
| `text-lg font-semibold` | 18px / 1.125rem | 1.5 | 600 | Card titles, labels | "Stock Screener" |
| `text-base font-medium` | 16px / 1rem | 1.5 | 500 | Large body text | Form labels |
| `text-sm` | 14px / 0.875rem | 1.5 | 400 | Default body text | Descriptions, content |
| `text-xs uppercase` | 12px / 0.75rem | 1.5 | 400-600 | Labels, metadata | "NSE", "MARKET CAP" |

**Financial Data Sizes:**
| Class | Size | Weight | Font | Usage |
|-------|------|--------|------|-------|
| `text-2xl font-bold font-mono` | 32px | 700 | Mono | Large metrics (sentiment counts) |
| `text-lg font-semibold font-mono` | 18px | 600 | Mono | Stock prices in cards |
| `text-sm font-mono` | 14px | 400 | Mono | Table numbers, indicators |
| `text-xs font-mono` | 12px | 400 | Mono | Small metrics, helper numbers |

---

### 2.3 Font Weight Guidelines

| Weight | Tailwind Class | Numeric Value | Usage |
|--------|----------------|---------------|-------|
| Bold | `font-bold` | 700 | Page titles, important headings, emphasis |
| Semibold | `font-semibold` | 600 | Section headers, card titles, subheadings |
| Medium | `font-medium` | 500 | Buttons, labels, stock names, active states |
| Normal | `font-normal` | 400 | Body text (default), descriptions |
| Light | `font-light` | 300 | Rarely used, decorative text |

**Decision Tree:**
```
Is it a page title? → font-bold (700)
Is it a section header? → font-semibold (600)
Is it a button or label? → font-medium (500)
Is it body text? → font-normal (400)
```

---

### 2.4 Letter Spacing & Line Height

#### Letter Spacing

```tsx
tracking-tight   // -0.025em - Page titles, large headings
tracking-normal  // 0em (default) - Body text
tracking-wide    // 0.025em - Uppercase labels, tickers
tracking-wider   // 0.05em - Very spaced text (rare)
```

**Usage Example:**
```tsx
// Page title
<h1 className="text-3xl font-bold tracking-tight">
  Alpha Generation
</h1>

// Ticker symbol
<span className="text-xs uppercase tracking-wide text-muted-foreground">
  RELIANCE.NS
</span>
```

#### Line Height

```tsx
leading-none     // 1 - Tight spacing (titles, logos)
leading-tight    // 1.25 - Headings
leading-snug     // 1.375 - Subheadings
leading-normal   // 1.5 (default) - Body text
leading-relaxed  // 1.625 - Loose body text
```

**Responsive Line Height:**
- Mobile: Use `leading-tight` for headings to save vertical space
- Desktop: Can use `leading-normal` for better readability

---

### 2.5 Typography Patterns

#### Page Header Pattern
```tsx
<div className="flex items-center gap-3">
  <div className="rounded-lg bg-primary/10 p-3">
    <Icon className="h-8 w-8 text-primary" />
  </div>
  <div>
    <h1 className="text-3xl font-bold">Page Title</h1>
    <p className="text-muted-foreground mt-1">
      Brief description of the page purpose
    </p>
  </div>
</div>
```

#### Card Title Pattern
```tsx
<Card>
  <CardHeader className="p-6">
    <CardTitle className="text-xl font-semibold">
      Card Title
    </CardTitle>
    <CardDescription className="text-sm text-muted-foreground mt-1">
      Optional description
    </CardDescription>
  </CardHeader>
</Card>
```

#### Financial Data Display
```tsx
// Price with change
<div className="text-right">
  <p className="font-semibold font-mono">₹{price.toFixed(2)}</p>
  <div className={`flex items-center gap-1 text-sm ${colorClass}`}>
    <Icon className="h-3 w-3" />
    <span className="font-mono">
      {isPositive ? '+' : ''}{changePercent.toFixed(2)}%
    </span>
  </div>
</div>
```

#### Label + Value Pattern
```tsx
<div className="space-y-1">
  <p className="text-xs text-muted-foreground uppercase tracking-wide">
    Market Cap
  </p>
  <p className="text-lg font-semibold font-mono">
    ₹1.24L Cr
  </p>
</div>
```

---

### 2.6 Responsive Typography

**Mobile (< 768px):**
```tsx
// Slightly larger for better readability on small screens
<Input className="text-base" /> // 16px prevents zoom on iOS
```

**Desktop (>= 768px):**
```tsx
<Input className="text-base md:text-sm" /> // 14px on desktop
```

**Scaling Pattern:**
```tsx
// Headings scale down on mobile
<h1 className="text-2xl md:text-3xl font-bold">
  Responsive Title
</h1>

// Body text remains consistent
<p className="text-sm">
  Body text stays 14px across breakpoints
</p>
```

---

### 2.7 Typography Anti-Patterns

**❌ DON'T:**
```tsx
// Using sans font for numbers in tables
<td className="text-sm">{price}</td>

// Inconsistent case in labels
<Label>market cap</Label>
<Label>MARKET CAP</Label>
<Label>Market Cap</Label>

// Too many font weights
<h2 className="font-black">Title</h2>
<h3 className="font-extrabold">Subtitle</h3>
<h4 className="font-bold">Heading</h4>

// No line height for multi-line text
<p className="leading-none">
  Long paragraph text that wraps...
</p>
```

**✅ DO:**
```tsx
// Monospace for financial numbers
<td className="text-sm font-mono text-right">{price.toFixed(2)}</td>

// Consistent label casing (uppercase with tracking)
<Label className="text-xs uppercase tracking-wide">
  Market Cap
</Label>

// Stick to 3-4 font weights
<h1 className="font-bold">Title</h1>
<h2 className="font-semibold">Subtitle</h2>
<p className="font-medium">Label</p>
<p className="font-normal">Body</p>

// Proper line height for readability
<p className="leading-normal">
  Paragraph text with comfortable spacing...
</p>
```

---

## 3. Spacing & Layout

### 3.1 Spacing Philosophy

**8px Grid System:**
- All spacing is a multiple of 8px (or 4px for fine-tuning)
- Creates consistent visual rhythm
- Aligns with Tailwind's default spacing scale

**Tailwind Spacing Scale:**
```
0    = 0px
0.5  = 2px
1    = 4px
2    = 8px
3    = 12px
4    = 16px
5    = 20px
6    = 24px
7    = 28px
8    = 32px
10   = 40px
12   = 48px
16   = 64px
20   = 80px
24   = 96px
```

**Most Used Values:**
- `p-2`, `p-3`, `p-4`, `p-6` - Component padding
- `gap-2`, `gap-3`, `gap-4` - Grid/flex gaps
- `space-y-4`, `space-y-6`, `space-y-8` - Vertical stacks
- `mt-1`, `mt-2`, `mt-4` - Margins

---

### 3.2 Container System

#### Page Container Pattern
```tsx
<div className="mx-auto w-full px-6 py-8">
  {/* Page content */}
</div>
```
- **No max-width constraint** - Full width layout
- **Horizontal padding:** `px-6` (24px) on all screens
- **Vertical padding:** `py-8` (32px) top and bottom

**Constrained Container (Optional):**
```tsx
<div className="mx-auto max-w-7xl px-6 py-8">
  {/* Centered content, max 1280px wide */}
</div>
```

#### Section Container
```tsx
<section className="space-y-6">
  <h2 className="text-2xl font-bold">Section Title</h2>
  {/* Section content */}
</section>
```
- **Vertical spacing:** `space-y-6` between child elements
- Alternatives: `space-y-4` (tighter), `space-y-8` (looser)

---

### 3.3 Component Spacing

#### Card Padding
```tsx
// Standard card
<Card className="p-6">  {/* 24px all sides */}

// Compact card
<Card className="p-4">  {/* 16px all sides */}

// Card header/content split
<CardHeader className="p-6">
  <CardTitle>Title</CardTitle>
</CardHeader>
<CardContent className="p-6 pt-0">  {/* No top padding */}
  Content
</CardContent>
```

#### Button Padding
```tsx
// Default button
className="px-4 py-2"  // 16px horizontal, 8px vertical

// Small button
className="px-3 py-1.5"  // 12px horizontal, 6px vertical

// Large button
className="px-8 py-3"  // 32px horizontal, 12px vertical

// Icon button
className="h-9 w-9"  // 36px × 36px square
```

#### Input Field Padding
```tsx
className="px-3 py-2"  // 12px horizontal, 8px vertical
// Results in ~36px total height with border
```

#### Table Cell Padding
```tsx
<TableCell className="p-4">  // 16px all sides
  Cell content
</TableCell>
```

---

### 3.4 Grid Systems

#### 2-Column Grid (Responsive)
```tsx
<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
  <div>Column 1</div>
  <div>Column 2</div>
</div>
```
- Mobile: Stacked (1 column)
- Tablet+: Side-by-side (2 columns)
- Gap: 24px

#### 3-Column Grid
```tsx
<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
  <div>Column 1</div>
  <div>Column 2</div>
  <div>Column 3</div>
</div>
```

#### 2/3 + 1/3 Asymmetric Layout
```tsx
<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
  <div className="lg:col-span-2">
    {/* Main content (2/3 width) */}
  </div>
  <div>
    {/* Sidebar (1/3 width) */}
  </div>
</div>
```

#### Auto-fit Grid (Dynamic Columns)
```tsx
<div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
  {/* Cards automatically wrap */}
</div>
```
- 2 columns on mobile
- 3 columns on tablet
- 4 columns on desktop

---

### 3.5 Gap Sizing Decision Tree

```
How related are the items?
├─ Very tight grouping (icon + text) → gap-1 or gap-2
├─ Related items (form field + label) → gap-3 or gap-4
├─ Independent items in grid → gap-4 or gap-6
└─ Distinct sections → gap-8 or gap-12

What type of content?
├─ Cards in grid → gap-4 or gap-6
├─ List items → gap-2 or gap-3
├─ Navigation items → gap-1 or gap-2
└─ Page sections → gap-8 or gap-12
```

---

### 3.6 Vertical Rhythm

**Section Spacing:**
```tsx
// Page with multiple sections
<div className="space-y-12">
  <section>Section 1</section>
  <section>Section 2</section>
  <section>Section 3</section>
</div>
```
- `space-y-12` (48px) between major sections
- `space-y-8` (32px) for less important sections
- `space-y-6` (24px) for subsections

**Component Internal Spacing:**
```tsx
// Vertical stack of related items
<div className="space-y-4">
  <div>Item 1</div>
  <div>Item 2</div>
  <div>Item 3</div>
</div>
```

**Margin Top for Secondary Elements:**
```tsx
<h1 className="text-3xl font-bold">Title</h1>
<p className="text-muted-foreground mt-1">  {/* 4px gap */}
  Description directly below title
</p>

<div className="mt-6">  {/* 24px gap before new section */}
  Next content block
</div>
```

---

### 3.7 Layout Patterns

#### Dashboard Grid
```tsx
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
  <StatCard />
  <StatCard />
  <StatCard />
  <StatCard />
</div>
```

#### Content + Sidebar
```tsx
<div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
  <main className="lg:col-span-3">
    {/* Main content */}
  </main>
  <aside>
    {/* Sidebar */}
  </aside>
</div>
```

#### Full-Width Table Container
```tsx
<div className="w-full overflow-x-auto">
  <Table className="min-w-[800px]">
    {/* Table scrolls horizontally on mobile */}
  </Table>
</div>
```

---

## 4. Component Library

### 4.1 Buttons

#### Variants

**Default (Primary)**
```tsx
<Button>
  Click Me
</Button>

// CSS Classes:
// bg-primary text-primary-foreground border border-primary-border
// hover-elevate active-elevate-2
```

**Secondary**
```tsx
<Button variant="secondary">
  Secondary Action
</Button>

// CSS Classes:
// bg-secondary text-secondary-foreground border border-secondary-border
// hover-elevate active-elevate-2
```

**Outline**
```tsx
<Button variant="outline">
  Outlined
</Button>

// CSS Classes:
// border [border-color:var(--button-outline)] shadow-xs
// hover-elevate
```

**Ghost**
```tsx
<Button variant="ghost">
  Ghost
</Button>

// CSS Classes:
// border border-transparent
// hover-elevate
```

**Destructive**
```tsx
<Button variant="destructive">
  Delete
</Button>

// CSS Classes:
// bg-destructive text-destructive-foreground
// hover-elevate
```

---

#### Sizes

```tsx
// Default
<Button size="default">Default Button</Button>
// min-h-9 px-4 py-2

// Small
<Button size="sm">Small Button</Button>
// min-h-8 px-3 text-xs

// Large
<Button size="lg">Large Button</Button>
// min-h-10 px-8

// Icon only
<Button size="icon">
  <SearchIcon className="h-4 w-4" />
</Button>
// h-9 w-9
```

---

#### Button States

**Loading State:**
```tsx
<Button disabled={isPending}>
  {isPending ? (
    <>
      <Loader2 className="h-4 w-4 animate-spin" />
      Loading...
    </>
  ) : (
    <>
      <Play className="h-4 w-4" />
      Run Analysis
    </>
  )}
</Button>
```

**Disabled State:**
```tsx
<Button disabled>
  Disabled
</Button>
// Automatically applies: opacity-50 pointer-events-none
```

**With Icon:**
```tsx
<Button className="gap-2">
  <Icon className="h-4 w-4" />
  Button Text
</Button>
```

---

#### Button Usage Guidelines

| Scenario | Variant | Size | Example |
|----------|---------|------|---------|
| Primary CTA | `default` | `default` or `lg` | "Analyze Sentiment", "Run Optimization" |
| Secondary action | `secondary` | `default` | "View Details", "Export Data" |
| Cancel/back | `outline` or `ghost` | `default` | "Cancel", "Back" |
| Delete/remove | `destructive` | `default` or `sm` | "Delete", "Remove from Watchlist" |
| Toolbar action | `ghost` | `sm` or `icon` | Sort, filter, refresh buttons |
| Icon-only | `ghost` or `outline` | `icon` | Watchlist heart, settings |

---

### 4.2 Cards

#### Base Card Structure
```tsx
<Card className="p-6">
  <h3 className="text-lg font-semibold mb-4">
    Card Title
  </h3>
  <p className="text-sm text-muted-foreground">
    Card content goes here
  </p>
</Card>

// CSS Classes:
// rounded-xl border bg-card border-card-border text-card-foreground shadow-sm
```

#### Card with Header/Content Split
```tsx
<Card>
  <CardHeader className="p-6">
    <CardTitle className="text-xl font-semibold">
      Title
    </CardTitle>
    <CardDescription className="text-sm text-muted-foreground mt-1">
      Description
    </CardDescription>
  </CardHeader>
  <CardContent className="p-6 pt-0">
    Main content
  </CardContent>
  <CardFooter className="p-6 pt-0">
    <Button>Action</Button>
  </CardFooter>
</Card>
```

#### Interactive Card (Clickable)
```tsx
<Card className="hover-elevate cursor-pointer">
  <div className="p-4">
    Interactive card content
  </div>
</Card>
```

#### Compact Card
```tsx
<Card className="p-4">
  {/* Reduced padding for tighter layouts */}
</Card>
```

---

### 4.3 Badges

#### Badge Variants
```tsx
// Default (primary)
<Badge>New</Badge>

// Secondary
<Badge variant="secondary">Beta</Badge>

// Destructive
<Badge variant="destructive">Error</Badge>

// Outline
<Badge variant="outline">Draft</Badge>
```

#### Custom Sentiment Badges
```tsx
// Positive sentiment (theme-aware)
<Badge className="bg-positive text-positive-foreground">
  Positive
</Badge>

// Negative sentiment (theme-aware)
<Badge className="bg-negative text-negative-foreground">
  Negative
</Badge>

// Neutral sentiment (theme-aware)
<Badge className="bg-neutral/20 text-neutral-foreground">
  Neutral
</Badge>

// Using helper functions (recommended)
import { getSentimentBadgeClass } from '@/lib/theme-utils';
<Badge className={getSentimentBadgeClass('positive')}>Bullish</Badge>
```

#### Badge Usage
```tsx
// With icon
<Badge className="gap-1.5">
  <CheckCircle className="h-3 w-3" />
  Verified
</Badge>

// Category badge
<Badge variant="secondary" className="text-xs">
  Technology
</Badge>

// Count badge
<Badge variant="outline">{count}</Badge>
```

---

### 4.4 Input Fields

#### Text Input
```tsx
<div>
  <Label htmlFor="email">Email</Label>
  <Input
    id="email"
    type="email"
    placeholder="Enter your email"
    className="mt-2"
  />
</div>

// Input CSS classes:
// flex h-9 w-full rounded-md border border-input
// bg-background px-3 py-2 text-base ring-offset-background
// placeholder:text-muted-foreground
// focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
// disabled:cursor-not-allowed disabled:opacity-50
// md:text-sm
```

#### Search Input with Icon
```tsx
<div className="relative">
  <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
  <Input
    type="search"
    placeholder="Search stocks..."
    className="pl-9"
  />
</div>
```

#### File Input
```tsx
<Input
  ref={fileInputRef}
  type="file"
  accept=".csv"
  onChange={handleFileChange}
  className="cursor-pointer"
/>

// Or hidden with button trigger:
<Input ref={fileInputRef} type="file" className="hidden" />
<Button onClick={() => fileInputRef.current?.click()}>
  <FileUp className="h-4 w-4" />
</Button>
```

---

### 4.5 Select Dropdowns

#### shadcn/ui Select
```tsx
<Select value={value} onValueChange={setValue}>
  <SelectTrigger className="w-[200px]">
    <SelectValue placeholder="Select option..." />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="option1">Option 1</SelectItem>
    <SelectItem value="option2">Option 2</SelectItem>
    <SelectItem value="option3">Option 3</SelectItem>
  </SelectContent>
</Select>
```

#### With Icons
```tsx
<SelectContent>
  <SelectItem value="bullish">
    <div className="flex items-center gap-2">
      <TrendingUp className="h-4 w-4 text-green-600" />
      Bullish
    </div>
  </SelectItem>
  <SelectItem value="bearish">
    <div className="flex items-center gap-2">
      <TrendingDown className="h-4 w-4 text-red-600" />
      Bearish
    </div>
  </SelectItem>
</SelectContent>
```

#### Loading State
```tsx
<SelectContent>
  {isLoading && (
    <SelectItem value="_loading" disabled>
      Loading options...
    </SelectItem>
  )}
  {!isLoading && options.length === 0 && (
    <SelectItem value="_empty" disabled>
      No options available
    </SelectItem>
  )}
  {options.map(option => (
    <SelectItem key={option.value} value={option.value}>
      {option.label}
    </SelectItem>
  ))}
</SelectContent>
```

---

### 4.6 Tables

#### Complete Table Structure
```tsx
<Table>
  <TableHeader>
    <TableRow>
      <TableHead className="w-[200px]">Symbol</TableHead>
      <TableHead>Name</TableHead>
      <TableHead className="text-right">Price</TableHead>
      <TableHead className="text-right">Change %</TableHead>
    </TableRow>
  </TableHeader>
  <TableBody>
    {data.map((row) => (
      <TableRow key={row.id}>
        <TableCell className="font-medium uppercase">{row.symbol}</TableCell>
        <TableCell>{row.name}</TableCell>
        <TableCell className="text-right font-mono">
          ₹{row.price.toFixed(2)}
        </TableCell>
        <TableCell className={`text-right font-mono ${row.change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
          {row.change >= 0 ? '+' : ''}{row.change.toFixed(2)}%
        </TableCell>
      </TableRow>
    ))}
  </TableBody>
</Table>
```

#### Sortable Table Headers
```tsx
<TableHead
  className="cursor-pointer select-none hover:bg-muted/50"
  onClick={() => handleSort('price')}
>
  <div className="flex items-center gap-1">
    Price
    {sortColumn === 'price' ? (
      sortDirection === 'asc' ? (
        <ArrowUp className="h-3 w-3" />
      ) : (
        <ArrowDown className="h-3 w-3" />
      )
    ) : (
      <ArrowUpDown className="h-3 w-3 opacity-50" />
    )}
  </div>
</TableHead>
```

#### Responsive Table (Horizontal Scroll)
```tsx
<div className="w-full overflow-x-auto">
  <Table className="min-w-[800px]">
    {/* Table content */}
  </Table>
</div>
```

#### Data Alignment Rules
- **Text columns:** `text-left` (default)
- **Numeric columns:** `text-right font-mono`
- **Status/badges:** `text-center`
- **Actions:** `text-right`

---

### 4.7 Tabs

#### Pills Style Tabs
```tsx
<Tabs defaultValue="tab1">
  <TabsList>
    <TabsTrigger value="tab1">Tab 1</TabsTrigger>
    <TabsTrigger value="tab2">Tab 2</TabsTrigger>
    <TabsTrigger value="tab3">Tab 3</TabsTrigger>
  </TabsList>
  <TabsContent value="tab1">
    Content for tab 1
  </TabsContent>
  <TabsContent value="tab2">
    Content for tab 2
  </TabsContent>
</Tabs>

// TabsList CSS:
// inline-flex h-10 items-center justify-center
// rounded-md bg-muted p-1 text-muted-foreground

// TabsTrigger CSS:
// rounded-sm px-3 py-1.5 text-sm font-medium
// data-[state=active]:bg-background data-[state=active]:text-foreground
// data-[state=active]:shadow-sm
```

#### Tabs with Icons
```tsx
<TabsTrigger value="overview" className="gap-2">
  <LayoutDashboard className="h-4 w-4" />
  Overview
</TabsTrigger>
```

#### Horizontal Scroll for Many Tabs
```tsx
<div className="overflow-x-auto">
  <TabsList className="w-full justify-start">
    {/* Many tabs that might overflow */}
  </TabsList>
</div>
```

---

### 4.8 Dialogs & Modals

#### Basic Dialog
```tsx
<Dialog open={open} onOpenChange={setOpen}>
  <DialogTrigger asChild>
    <Button>Open Dialog</Button>
  </DialogTrigger>
  <DialogContent className="sm:max-w-[425px]">
    <DialogHeader>
      <DialogTitle>Dialog Title</DialogTitle>
      <DialogDescription>
        Dialog description goes here.
      </DialogDescription>
    </DialogHeader>
    <div className="py-4">
      {/* Dialog content */}
    </div>
    <DialogFooter>
      <Button variant="outline" onClick={() => setOpen(false)}>
        Cancel
      </Button>
      <Button onClick={handleConfirm}>
        Confirm
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

#### Alert Dialog (Confirmation)
```tsx
<AlertDialog>
  <AlertDialogTrigger asChild>
    <Button variant="destructive">Delete</Button>
  </AlertDialogTrigger>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Are you sure?</AlertDialogTitle>
      <AlertDialogDescription>
        This action cannot be undone.
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>Cancel</AlertDialogCancel>
      <AlertDialogAction>Delete</AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

---

### 4.9 Data Display Components

#### DataCard
Multi-column grid for displaying labeled metrics.

**Location:** `client/src/components/DataCard.tsx`

```tsx
import { DataCard } from '@/components/DataCard';

<DataCard
  title="Key Metrics"
  columns={3}  // 1-4 columns supported
  loading={isLoading}
  action={<Button size="sm">Refresh</Button>}
>
  <DataCard.Item label="Market Cap" value="₹2.5 Cr" />
  <DataCard.Item label="P/E Ratio" value="25.4" />
  <DataCard.Item label="52W High" value="₹450" />
</DataCard>
```

#### FinancialCard
Card wrapper with multiple variants for different contexts.

**Location:** `client/src/components/FinancialCard.tsx`

```tsx
import { FinancialCard } from '@/components/FinancialCard';

// Variants: elevated (default), outlined, ghost, compact
<FinancialCard
  variant="elevated"
  header={{
    title: "Portfolio Summary",
    description: "Today's performance",
    action: <Button variant="ghost" size="sm">View All</Button>
  }}
  footer={<div>Last updated: 5 mins ago</div>}
>
  {/* Card content */}
</FinancialCard>
```

#### MetricDisplay
Single metric display with optional change indicator.

**Location:** `client/src/components/MetricDisplay.tsx`

```tsx
import { MetricDisplay } from '@/components/MetricDisplay';

<MetricDisplay
  label="Current Price"
  value="₹1,234.50"
  change={2.5}          // Optional: shows ChangeIndicator
  size="lg"             // sm, md, lg
  orientation="vertical" // vertical, horizontal
/>
```

#### SectionHeader
Reusable page section headers.

**Location:** `client/src/components/SectionHeader.tsx`

```tsx
import { SectionHeader } from '@/components/SectionHeader';

<SectionHeader
  title="Market Overview"
  description="Live market data and trends"
  size="lg"              // sm, md, lg
  action={<Button>See All</Button>}
  separator={true}       // Show bottom border
/>
```

---

### 4.10 Change Indicator Components

#### ChangeIndicator
Inline percentage with directional icon and color.

```tsx
import { ChangeIndicator } from '@/components/ChangeIndicator';

<ChangeIndicator value={2.5} />   // +2.50% with up arrow (green)
<ChangeIndicator value={-1.3} />  // -1.30% with down arrow (red)
<ChangeIndicator value={0} />     // 0.00% (neutral)
```

#### ChangeBadge
Percentage in badge with background color.

```tsx
import { ChangeBadge } from '@/components/ChangeIndicator';

<ChangeBadge value={5.2} />  // Green badge: +5.20%
<ChangeBadge value={-3.1} /> // Red badge: -3.10%
```

#### ChangeText
Simple colored text with sign, no icon.

```tsx
import { ChangeText } from '@/components/ChangeIndicator';

<ChangeText value={1.5} />  // "+1.50%" in green
```

---

### 4.11 Status Components

#### MarketStatusBadge
Market open/closed indicator with pulse animation.

**Location:** `client/src/components/MarketStatusBadge.tsx`

```tsx
import { MarketStatusBadge } from '@/components/MarketStatusBadge';

<MarketStatusBadge />
// Shows: "Open" (green pulse) or "Closed" (red) based on useMarketStatus()
```

#### MarketMood
Fear & Greed Index gauge with sparkline history.

**Location:** `client/src/components/MarketMood.tsx`

```tsx
import { MarketMood } from '@/components/MarketMood';

<MarketMood />
// Displays circular gauge (0-100) with category label
// Shows 5-day trend sparkline
// Auto-updates via useMarketMood() hook
```

#### ComputeStatusBadge
GPU/CPU compute backend indicator.

**Location:** `client/src/components/ComputeStatusBadge.tsx`

```tsx
import { ComputeStatusBadge } from '@/components/ComputeStatusBadge';

<ComputeStatusBadge
  backend="webgpu"  // webgpu, webgl2, cpu, server
  isComputing={false}
/>
// Color-coded: WebGPU (green), WebGL2 (yellow), CPU (orange), Server (blue)
// Shows spinner when isComputing=true
```

---

### 4.12 Search Components

**Location:** `client/src/components/search/`

#### SearchBar
Main search component with inline and dialog variants.

```tsx
import { SearchBar } from '@/components/search/SearchBar';

// Inline variant (always visible)
<SearchBar variant="inline" placeholder="Search stocks..." />

// Dialog variant (opens modal on click)
<SearchBar variant="dialog" />
```

#### SearchResults
Results list with prices, suffix badges, and keyboard navigation.

```tsx
import { SearchResults } from '@/components/search/SearchResults';

<SearchResults
  results={searchResults}
  onSelect={(stock) => navigate(`/stocks/${stock.symbol}`)}
  selectedIndex={activeIndex}
/>
```

#### RecentSearches
localStorage-based search history (max 10 items).

```tsx
import { RecentSearches } from '@/components/search/RecentSearches';

<RecentSearches onSelect={handleSelect} />
```

#### TrendingStocks
Top gainers from market movers API.

```tsx
import { TrendingStocks } from '@/components/search/TrendingStocks';

<TrendingStocks onSelect={handleSelect} limit={5} />
```

---

## 5. Navigation Patterns

### 5.1 Top Navigation Bar

#### Structure
```tsx
<nav className="sticky top-0 z-50 border-b bg-background">
  <div className="flex h-16 items-center justify-between px-6">
    {/* Logo */}
    <Link href="/">
      <TiphubLogo />
    </Link>

    {/* Desktop nav items */}
    <div className="hidden lg:flex items-center gap-1">
      {navItems.map(item => (
        <Button
          key={item.path}
          variant={isActive(item.path) ? "secondary" : "ghost"}
          size="sm"
          className="gap-2"
        >
          <item.icon className="h-4 w-4" />
          {item.label}
        </Button>
      ))}
    </div>

    {/* Search bar */}
    <div className="hidden md:flex flex-1 max-w-md mx-8">
      <SearchInput />
    </div>

    {/* User menu */}
    <div className="flex items-center gap-2">
      <Button variant="ghost" size="icon">
        <User className="h-5 w-5" />
      </Button>
    </div>
  </div>
</nav>
```

---

### 5.2 Mobile Navigation

#### Collapsible Menu
```tsx
<div className="lg:hidden border-t px-6 py-2">
  <div className="flex items-center gap-2">
    {/* Mobile menu items */}
  </div>
</div>
```

#### Mobile Search
```tsx
<div className="md:hidden border-t px-6 py-2">
  <SearchInput placeholder="Search..." />
</div>
```

---

### 5.3 Footer Navigation

```tsx
<footer className="mt-16 border-t border-[#2a2a2a] bg-[#1b1b1b] text-white">
  <div className="mx-auto w-full px-6 py-12">
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-8">
      {/* Logo column */}
      <div className="col-span-2 md:col-span-4 lg:col-span-1">
        <TiphubLogo size="lg" />
        <p className="text-sm text-white/70 mt-4">
          Just the Tip
        </p>
      </div>

      {/* Link columns */}
      {footerSections.map(section => (
        <div key={section.title}>
          <h3 className="font-semibold mb-4 text-white/90">
            {section.title}
          </h3>
          <ul className="space-y-2">
            {section.links.map(link => (
              <li key={link.label}>
                <Link href={link.href}>
                  <span className="text-sm text-white/70 hover:text-[#ffa31a] transition-colors cursor-pointer">
                    {link.label}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>

    {/* Bottom bar */}
    <div className="border-t border-[#2a2a2a] mt-8 pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
      <p className="text-sm text-white/60">
        © 2025 Tiphub. All rights reserved.
      </p>
      <div className="flex items-center gap-6 text-sm text-white/60">
        <Link href="#">Terms</Link>
        <Link href="#">Privacy</Link>
        <Link href="#">Disclaimer</Link>
      </div>
    </div>
  </div>
</footer>
```

---

## 6. Data Visualization

### 6.1 Lightweight Charts Configuration

#### Base Chart Setup
```tsx
const chart = createChart(container, {
  width: container.clientWidth,
  height: 400,
  layout: {
    background: { type: ColorType.Solid, color: "transparent" },
    textColor: "hsl(var(--muted-foreground))",
    fontSize: 12,
    fontFamily: "var(--font-sans, 'Inter', sans-serif)",
  },
  grid: {
    horzLines: { color: "hsla(var(--foreground), 0.025)" },
    vertLines: { color: "hsla(var(--foreground), 0.025)" },
  },
  crosshair: {
    mode: CrosshairMode.Normal,
    vertLine: {
      color: "hsla(var(--primary), 0.35)",
      width: 1,
      style: 3,
      visible: true,
    },
    horzLine: {
      color: "hsla(var(--primary), 0.35)",
      width: 1,
      style: 3,
      visible: true,
    },
  },
  rightPriceScale: {
    borderVisible: false,
    scaleMargins: { top: 0.2, bottom: 0.1 },
  },
  timeScale: {
    borderVisible: false,
    barSpacing: 10,
    minBarSpacing: 4,
  },
});
```

---

### 6.2 Candlestick Chart Pattern (Theme-Aware)

**Using `getCSSColor()` helper:**
```tsx
import { getCSSColor } from '@/lib/theme-utils';

const series = chart.addSeries(CandlestickSeries, {
  // Use semantic chart colors (theme-aware)
  upColor: getCSSColor('--chart-positive'),
  downColor: getCSSColor('--chart-negative'),
  wickUpColor: getCSSColor('--positive-foreground'),
  wickDownColor: getCSSColor('--negative-foreground'),
  borderUpColor: getCSSColor('--chart-positive'),
  borderDownColor: getCSSColor('--chart-negative'),
  priceLineColor: getCSSColor('--primary'),
  priceLineWidth: 2,
  priceLineVisible: true,
});

// Add data
const candleData: CandlestickData[] = data.map(bar => ({
  time: toUTCTimestamp(bar.date),
  open: Number(bar.open),
  high: Number(bar.high),
  low: Number(bar.low),
  close: Number(bar.close),
}));

series.setData(candleData);
chart.timeScale().fitContent();
```

**Using `useChartTheme()` hook (recommended):**
```tsx
import { useChartTheme } from '@/hooks/use-chart-theme';

function CandlestickChart({ data }) {
  const chartColors = useChartTheme();
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    // Colors update automatically when theme changes
    if (chartRef.current) {
      chartRef.current.applyOptions({
        layout: {
          textColor: chartColors.textColor,
        },
        grid: {
          horzLines: { color: chartColors.gridColor },
          vertLines: { color: chartColors.gridColor },
        },
      });
    }
  }, [chartColors]);

  // ... chart setup
}
```

**Anti-pattern (avoid):**
```tsx
// DON'T: Hardcoded colors won't adapt to theme changes
upColor: "#16a34a",
downColor: "#dc2626",
```

---

### 6.3 Chart Markers (Entry/Exit Signals)
```tsx
const markers: SeriesMarker<UTCTimestamp>[] = [];

data.forEach((bar) => {
  if (bar.entry) {
    markers.push({
      time: toUTCTimestamp(bar.date),
      position: "belowBar",
      shape: "arrowUp",
      color: "#16a34a",
      text: "Entry",
    });
  }
  if (bar.exit) {
    markers.push({
      time: toUTCTimestamp(bar.date),
      position: "aboveBar",
      shape: "arrowDown",
      color: "#dc2626",
      text: "Exit",
    });
  }
});

const markersPlugin = createSeriesMarkers(series, markers);
```

---

### 6.4 Chart Watermark
```tsx
chart.applyOptions({
  watermark: {
    visible: true,
    text: ticker,
    fontSize: 36,
    horzAlign: "left",
    vertAlign: "bottom",
    color: "hsla(var(--foreground), 0.06)",
  },
});
```

---

## 7. Financial Data Patterns

### 7.1 Price Formatting

**Rules:**
- Always use monospace font (`font-mono`)
- Always show currency symbol (₹)
- Always show 2 decimal places
- Right-align in tables

```tsx
// In card
<p className="font-semibold font-mono">₹{price.toFixed(2)}</p>

// In table
<TableCell className="text-right font-mono">
  ₹{price.toFixed(2)}
</TableCell>

// With conditional display (hide ₹0.00)
{price > 0 && (
  <p className="font-semibold font-mono">₹{price.toFixed(2)}</p>
)}
```

---

### 7.2 Percentage Formatting

**Rules:**
- Always show +/- sign for non-zero values
- Always use 2 decimal places
- Color code: green (positive), red (negative)
- Always use monospace font
- Include % symbol

```tsx
const isPositive = changePercent >= 0;

<div className={`flex items-center gap-1 text-sm ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
  {isPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
  <span className="font-mono">
    {isPositive ? '+' : ''}{changePercent.toFixed(2)}%
  </span>
</div>
```

**Anti-Pattern:**
```tsx
// ❌ DON'T use change value directly
const isPositive = change >= 0;  // Could be wrong if change is 0

// ❌ DON'T omit the + sign
<span>{changePercent.toFixed(2)}%</span>  // Confusing for positive

// ✅ DO use changePercent and include sign
const isPositive = changePercent >= 0;
<span>{isPositive ? '+' : ''}{changePercent.toFixed(2)}%</span>
```

---

### 7.3 Market Cap Formatting (Indian System)

**Rules:**
- Use Crores (Cr) for values under 1 Lakh Crore
- Use Lakh Crores (L Cr) for values above 1 Lakh Crore
- 1 Crore = 10,000,000 (10 million)
- 1 Lakh Crore = 1 trillion

```tsx
const formatMarketCap = (cap: number) => {
  const crores = cap / 10000000;
  if (crores >= 100000) {
    return `₹${(crores / 100000).toFixed(2)}L Cr`;
  }
  return `₹${crores.toFixed(2)} Cr`;
}

// Examples:
// 50,000,000,000 → ₹5.00L Cr
// 5,000,000,000 → ₹500.00 Cr
```

---

### 7.4 Volume Formatting

**Rules:**
- Use toLocaleString() for comma separators
- Indian numbering system by default

```tsx
<TableCell className="text-right font-mono text-sm">
  {volume.toLocaleString()}
</TableCell>

// Example: 1234567 → 12,34,567 (Indian system)
```

---

### 7.5 Ratio Formatting (P/E, P/B, etc.)

**Rules:**
- 2 decimal places
- Show "N/A" if null/undefined
- Monospace font

```tsx
<div>
  <p className="text-xs text-muted-foreground">P/E Ratio</p>
  <p className="font-medium font-mono">
    {trailingPE !== null ? trailingPE.toFixed(2) : 'N/A'}
  </p>
</div>
```

---

### 7.6 Stock Card Pattern

**Complete stock card with all financial data:**
```tsx
<div className="flex items-center justify-between p-4 border-b hover-elevate cursor-pointer">
  {/* Left: Logo + Name/Symbol */}
  <div className="flex items-center gap-3 flex-1 min-w-0">
    <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center flex-shrink-0 overflow-hidden">
      {logo ? (
        <img src={logo} alt={name} className="h-full w-full object-cover" />
      ) : (
        <span className="text-xs font-bold text-muted-foreground">
          {symbol.slice(0, 2)}
        </span>
      )}
    </div>
    <div className="flex-1 min-w-0">
      <h3 className="font-medium truncate">{name}</h3>
      <p className="text-xs text-muted-foreground uppercase">{symbol}</p>
    </div>
  </div>

  {/* Right: Price + Change */}
  <div className="flex items-center gap-4">
    <div className="text-right">
      {price > 0 && (
        <p className="font-semibold font-mono">₹{price.toFixed(2)}</p>
      )}
      <div className={`flex items-center gap-1 text-sm ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
        {isPositive ? (
          <TrendingUp className="h-3 w-3" />
        ) : (
          <TrendingDown className="h-3 w-3" />
        )}
        <span className="font-mono">
          {isPositive ? '+' : ''}{changePercent.toFixed(2)}%
        </span>
      </div>
    </div>

    {/* Watchlist button */}
    <Button
      variant="ghost"
      size="icon"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        handleWatchlist();
      }}
    >
      <Heart className={`h-4 w-4 ${isInWatchlist ? 'fill-red-500 text-red-500' : ''}`} />
    </Button>
  </div>
</div>
```

---

### 7.7 Technical Indicator Display

**Table of indicators:**
```tsx
<Table>
  <TableHead>
    <TableRow>
      <TableHead>Indicator</TableHead>
      <TableHead className="text-right">Value</TableHead>
    </TableRow>
  </TableHead>
  <TableBody>
    <TableRow>
      <TableCell className="font-medium">SMA 20</TableCell>
      <TableCell className="text-right font-mono">
        {sma20 !== null ? sma20.toFixed(2) : 'N/A'}
      </TableCell>
    </TableRow>
    <TableRow>
      <TableCell className="font-medium">RSI 14</TableCell>
      <TableCell className="text-right font-mono">
        {rsi14 !== null ? rsi14.toFixed(2) : 'N/A'}
      </TableCell>
    </TableRow>
  </TableBody>
</Table>
```

---

## 8. Responsive Design

### 8.1 Breakpoints

```tsx
// Tailwind default breakpoints
sm: '640px'   // Tablet portrait
md: '768px'   // Tablet landscape
lg: '1024px'  // Desktop
xl: '1280px'  // Large desktop
2xl: '1536px' // Extra large
```

**Usage in Tiphub:**
- `md:` for tablet+ (768px)
- `lg:` for desktop+ (1024px)
- Rarely use `sm:` or `2xl:`

---

### 8.2 Mobile-First Strategy

**Always write mobile styles first, then override for larger screens:**

```tsx
// ✅ Good: Mobile first
<div className="flex-col lg:flex-row">
  {/* Stacks on mobile, row on desktop */}
</div>

// ❌ Bad: Desktop first, then mobile
<div className="flex-row md:flex-col">
  {/* Harder to reason about */}
</div>
```

---

### 8.3 Common Responsive Patterns

#### Hide/Show Elements
```tsx
// Hidden on mobile, visible on desktop
<div className="hidden md:block">
  Desktop content
</div>

// Visible on mobile, hidden on desktop
<div className="md:hidden">
  Mobile content
</div>
```

#### Grid Responsiveness
```tsx
// 1 column mobile, 2 on tablet, 3 on desktop
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
```

#### Text Size Responsiveness
```tsx
// Larger on mobile for iOS zoom prevention
<Input className="text-base md:text-sm" />

// Heading scales down on mobile
<h1 className="text-2xl md:text-3xl font-bold">
```

#### Padding/Margin Adjustments
```tsx
// More padding on desktop
<div className="p-4 lg:p-6">

// Larger gaps on desktop
<div className="gap-3 lg:gap-6">
```

---

### 8.4 Responsive Navigation

```tsx
// Desktop navigation
<div className="hidden lg:flex items-center gap-1">
  {navItems.map(item => <NavButton />)}
</div>

// Mobile menu button
<Button className="lg:hidden" variant="ghost" size="icon">
  <Menu className="h-5 w-5" />
</Button>
```

---

### 8.5 Responsive Tables

**Horizontal scroll wrapper:**
```tsx
<div className="w-full overflow-x-auto">
  <Table className="min-w-[800px]">
    {/* Table content */}
  </Table>
</div>
```

**Alternative: Stacked cards on mobile:**
```tsx
// Desktop: Table
<div className="hidden md:block">
  <Table>...</Table>
</div>

// Mobile: Cards
<div className="md:hidden space-y-2">
  {data.map(item => (
    <Card key={item.id}>
      <div className="p-4">
        <p className="font-medium">{item.name}</p>
        <p className="text-sm text-muted-foreground">{item.value}</p>
      </div>
    </Card>
  ))}
</div>
```

---

### 8.6 Touch Target Sizes

**Minimum touch target:** 44×44px (Apple HIG, WCAG 2.1)

```tsx
// ✅ Good: Adequate touch target
<Button size="default">  {/* min-h-9 = 36px */}
  Click
</Button>

// ✅ Better for mobile
<Button size="lg">  {/* min-h-10 = 40px */}
  Click
</Button>

// ⚠️ Caution: Small for touch
<Button size="sm">  {/* min-h-8 = 32px */}
  Click
</Button>
```

**Icon buttons:**
```tsx
<Button size="icon">  {/* h-9 w-9 = 36×36px */}
  <Icon className="h-5 w-5" />
</Button>

// For critical mobile actions, increase:
<Button size="icon" className="h-11 w-11">
  <Icon className="h-5 w-5" />
</Button>
```

---

### 8.7 Responsive Search Bar

```tsx
// Hidden on mobile, variable width on desktop
<div className="hidden md:flex flex-1 max-w-sm md:max-w-md lg:max-w-lg mx-4 lg:mx-8">
  <SearchInput />
</div>

// Mobile search in separate section
<div className="md:hidden border-t px-6 py-2">
  <SearchInput />
</div>
```

---

## 9. Icons & Iconography

### 9.1 Icon Library

**lucide-react** - https://lucide.dev/

**Installation:**
```bash
npm install lucide-react
```

**Import:**
```tsx
import {
  TrendingUp,
  TrendingDown,
  Search,
  Filter,
  User,
  // ... etc
} from "lucide-react";
```

---

### 9.2 Icon Sizing Reference

| Size Class | Pixels | Usage |
|-----------|--------|-------|
| `h-3 w-3` | 12×12px | Inline with small text (trend indicators) |
| `h-4 w-4` | 16×16px | Default size for buttons, nav, labels |
| `h-5 w-5` | 20×20px | Larger buttons, action items |
| `h-6 w-6` | 24×24px | Page header icons |
| `h-8 w-8` | 32×32px | Feature icons, section headers |
| `h-10 w-10` | 40×40px | Large feature icons |
| `h-12 w-12` | 48×48px | Empty state icons |

---

### 9.3 Icon Patterns

#### Icon with Text (Button)
```tsx
<Button className="gap-2">
  <PlayCircle className="h-4 w-4" />
  Run Analysis
</Button>
```

#### Icon with Text (Label)
```tsx
<div className="flex items-center gap-2">
  <User className="h-4 w-4 text-muted-foreground" />
  <span className="text-sm">Profile</span>
</div>
```

#### Icon-Only Button
```tsx
<Button variant="ghost" size="icon" aria-label="Search">
  <Search className="h-5 w-5" />
</Button>
```

#### Inline Icon with Text
```tsx
<div className="flex items-center gap-1">
  <TrendingUp className="h-3 w-3 text-green-600" />
  <span className="text-sm text-green-600">+2.5%</span>
</div>
```

#### Loading Spinner
```tsx
<Loader2 className="h-4 w-4 animate-spin" />
```

---

### 9.4 Icon Color Inheritance

**Default behavior:** Icons inherit text color

```tsx
<div className="text-primary">
  <Star className="h-4 w-4" />  {/* Will be orange */}
  Featured
</div>

<div className="text-green-600">
  <TrendingUp className="h-4 w-4" />  {/* Will be green */}
</div>
```

**Override with explicit color:**
```tsx
<TrendingUp className="h-4 w-4 text-green-600" />
```

---

### 9.5 Common Icons & Their Semantic Meaning

| Icon | Semantic Meaning | Usage |
|------|------------------|-------|
| `TrendingUp` / `TrendingDown` | Price movement | Gains/losses indicators |
| `Search` | Search functionality | Search inputs, search buttons |
| `Filter` | Filtering options | Filter buttons, screener |
| `Brain` | AI/ML features | Sentiment analysis |
| `LineChart` / `BarChart3` | Analytics, data | Strategy backtesting, charts |
| `Activity` | Real-time data | Technical indicators |
| `Plus` / `Minus` / `X` | Add/remove/close | Action buttons |
| `ChevronRight` / `ChevronLeft` | Navigation | Pagination, dropdowns |
| `PlayCircle` / `Play` | Execute action | Run analysis, start process |
| `Loader2` | Loading state | With `animate-spin` |
| `ExternalLink` | External link | Opens in new tab |
| `Heart` | Favorite/watchlist | Add to watchlist |
| `User` | User profile | Profile, portfolio |
| `Menu` | Mobile menu | Hamburger menu |
| `AlertCircle` | Info/warning | Alerts, notifications |
| `CheckCircle` | Success | Success states |
| `XCircle` | Error | Error states |

---

### 9.6 Icon Accessibility

**Always provide accessible labels for icon-only buttons:**

```tsx
// ✅ Good
<Button variant="ghost" size="icon" aria-label="Add to watchlist">
  <Heart className="h-4 w-4" />
</Button>

// ❌ Bad
<Button variant="ghost" size="icon">
  <Heart className="h-4 w-4" />
</Button>
```

---

## 10. Animations & Micro-interactions

### 10.1 Elevation System

**CSS Implementation:**
```css
.hover-elevate {
  position: relative;
}

.hover-elevate::after {
  content: '';
  position: absolute;
  inset: 0;
  background-color: var(--elevate-1);
  opacity: 0;
  transition: opacity 0.2s;
  pointer-events: none;
  border-radius: inherit;
}

.hover-elevate:hover::after {
  opacity: 1;
}

.active-elevate-2::after {
  background-color: var(--elevate-2);
}
```

**Usage:**
```tsx
// Card hover
<Card className="hover-elevate cursor-pointer">

// Button
<Button className="hover-elevate active-elevate-2">

// List item
<div className="hover-elevate">
```

---

### 10.2 Transitions

**Standard transition classes:**
```tsx
transition-colors      // For color changes (200ms)
transition-all         // For comprehensive changes (150ms)
transition-opacity     // For opacity fades
transition-transform   // For movements
```

**Custom durations:**
```tsx
duration-75    // 75ms
duration-100   // 100ms
duration-150   // 150ms (default)
duration-200   // 200ms
duration-300   // 300ms
duration-500   // 500ms
```

**Example:**
```tsx
<Button className="transition-colors duration-200 hover:bg-primary/90">
  Smooth color transition
</Button>
```

---

### 10.3 Loading States

#### Spinner
```tsx
<Loader2 className="h-4 w-4 animate-spin text-primary" />
```

#### Button Loading State
```tsx
<Button disabled={isPending}>
  {isPending ? (
    <>
      <Loader2 className="h-4 w-4 animate-spin" />
      Analyzing...
    </>
  ) : (
    <>
      <Brain className="h-4 w-4" />
      Analyze Sentiment
    </>
  )}
</Button>
```

#### Skeleton Loading
```tsx
<div className="space-y-2">
  <Skeleton className="h-4 w-full" />
  <Skeleton className="h-4 w-3/4" />
  <Skeleton className="h-4 w-1/2" />
</div>
```

---

### 10.4 Custom Animations

#### Marquee (Stock Ticker)
```css
@keyframes marquee {
  0% {
    transform: translateX(0);
  }
  100% {
    transform: translateX(-50%);
  }
}

.animate-marquee {
  animation: marquee 60s linear infinite;
}

.animate-marquee:hover {
  animation-play-state: paused;
}
```

**Usage:**
```tsx
<div className="overflow-hidden">
  <div className="flex animate-marquee">
    {/* Ticker items */}
  </div>
</div>
```

#### Accordion (from Tailwind config)
```tsx
// Defined in tailwind.config.ts
animation: {
  "accordion-down": "accordion-down 0.2s ease-out",
  "accordion-up": "accordion-up 0.2s ease-out",
}

// Usage
<div className="animate-accordion-down">
  Expanding content
</div>
```

---

### 10.5 Focus Animations

**Standard focus ring:**
```tsx
focus-visible:outline-none
focus-visible:ring-2
focus-visible:ring-ring
focus-visible:ring-offset-2
```

**Focus ring color:**
- Primary: Orange (`--ring`)
- Matches brand color for consistency

---

## 11. Forms & Validation

### 11.1 Form Layout Patterns

#### Vertical Form (Default)
```tsx
<form onSubmit={handleSubmit} className="space-y-4">
  <div>
    <Label htmlFor="name">Name</Label>
    <Input id="name" placeholder="Enter name" className="mt-2" />
  </div>
  <div>
    <Label htmlFor="email">Email</Label>
    <Input id="email" type="email" placeholder="Enter email" className="mt-2" />
  </div>
  <Button type="submit">Submit</Button>
</form>
```

#### Horizontal Form (Label + Input Side-by-Side)
```tsx
<form className="space-y-3">
  <div className="grid grid-cols-4 items-center gap-4">
    <Label htmlFor="name" className="text-right">
      Name
    </Label>
    <Input id="name" className="col-span-3" />
  </div>
  <div className="grid grid-cols-4 items-center gap-4">
    <Label htmlFor="email" className="text-right">
      Email
    </Label>
    <Input id="email" type="email" className="col-span-3" />
  </div>
</form>
```

---

### 11.2 Form Field Pattern

**Complete field with label, input, and helper text:**
```tsx
<div className="space-y-2">
  <Label htmlFor="ticker" className="text-sm font-medium">
    Ticker Symbol
  </Label>
  <Input
    id="ticker"
    placeholder="e.g., RELIANCE.NS"
    value={ticker}
    onChange={(e) => setTicker(e.target.value)}
  />
  <p className="text-xs text-muted-foreground">
    Enter the NSE ticker symbol with .NS suffix
  </p>
</div>
```

---

### 11.3 Validation States

#### Error State
```tsx
<div>
  <Label htmlFor="email" className="text-sm font-medium">
    Email
    {error && <span className="text-red-600 ml-1">*</span>}
  </Label>
  <Input
    id="email"
    type="email"
    className={error ? 'border-red-600 focus-visible:ring-red-600' : ''}
    aria-invalid={!!error}
    aria-describedby={error ? "email-error" : undefined}
  />
  {error && (
    <p id="email-error" className="text-xs text-red-600 mt-1">
      {error}
    </p>
  )}
</div>
```

#### Success State
```tsx
<div className="relative">
  <Input
    className="border-green-600"
  />
  <CheckCircle className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-green-600" />
</div>
```

---

### 11.4 Required Fields

**Indicate required fields:**
```tsx
<Label htmlFor="name">
  Name <span className="text-red-600">*</span>
</Label>
```

**Or use helper text:**
```tsx
<Label htmlFor="name">Name</Label>
<Input id="name" required />
<p className="text-xs text-muted-foreground">Required field</p>
```

---

### 11.5 Form Validation Toast Pattern (Sonner)

**Toast notifications use Sonner** (`client/src/components/ui/sonner.tsx`):

```tsx
import { toast } from 'sonner';

const handleSubmit = (e: React.FormEvent) => {
  e.preventDefault();

  if (!ticker) {
    // Error toast
    toast.error("Validation Error", {
      description: "Please enter a ticker symbol",
    });
    return;
  }

  // Success toast
  toast.success("Submitted", {
    description: "Your request has been processed",
  });

  // Proceed with submission
};
```

**Available Toast Types:**
```tsx
toast("Default message");           // Neutral toast
toast.success("Success!");          // Green checkmark
toast.error("Something went wrong"); // Red error icon
toast.warning("Warning!");          // Yellow warning icon
toast.info("Information");          // Blue info icon
toast.loading("Processing...");     // Loading spinner
toast.promise(asyncFn, {            // Promise-based with loading/success/error states
  loading: 'Loading...',
  success: 'Done!',
  error: 'Failed',
});
```

**Note:** The old shadcn toast system (`use-toast.ts`, `toast.tsx`, `toaster.tsx`) has been removed. Use Sonner for all toast notifications.

---

## 12. Special UI Patterns

### 12.1 Empty State Pattern

```tsx
<div className="text-center py-16">
  <SearchX className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
  <h3 className="text-lg font-semibold mb-2">
    No results found
  </h3>
  <p className="text-muted-foreground mb-6">
    Try adjusting your search or filters
  </p>
  <Button variant="outline" onClick={handleReset}>
    Reset Filters
  </Button>
</div>
```

---

### 12.2 Loading State Pattern

#### Skeleton Cards
```tsx
<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
  {[1, 2, 3].map(i => (
    <Card key={i} className="p-6">
      <Skeleton className="h-4 w-1/2 mb-4" />
      <Skeleton className="h-8 w-full mb-2" />
      <Skeleton className="h-4 w-3/4" />
    </Card>
  ))}
</div>
```

#### Loading Overlay
```tsx
<div className="relative">
  {/* Content */}
  {isLoading && (
    <div className="absolute inset-0 flex items-center justify-center bg-background/70 backdrop-blur-sm">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  )}
</div>
```

---

### 12.3 Error State Pattern

```tsx
<Card className="p-6 border-red-600 bg-red-50 dark:bg-red-950/20">
  <div className="flex items-start gap-3">
    <AlertCircle className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" />
    <div>
      <h3 className="font-semibold text-red-900 dark:text-red-100">
        Error Loading Data
      </h3>
      <p className="text-sm text-red-800 dark:text-red-200 mt-1">
        {error.message}
      </p>
      <Button
        variant="outline"
        size="sm"
        className="mt-4"
        onClick={handleRetry}
      >
        Try Again
      </Button>
    </div>
  </div>
</Card>
```

---

### 12.4 Info/Alert Card Pattern

```tsx
<Card className="p-4 border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/20">
  <div className="flex items-start gap-3">
    <AlertCircle className="h-5 w-5 text-blue-600 mt-0.5" />
    <div>
      <h3 className="font-semibold text-blue-900 dark:text-blue-100">
        Technical Details
      </h3>
      <p className="text-sm text-blue-800 dark:text-blue-200 mt-1">
        QIGA uses quantum-inspired probabilistic optimization...
      </p>
    </div>
  </div>
</Card>
```

---

### 12.5 Page Header with Icon

```tsx
<div className="flex items-center gap-3 mb-6">
  <div className="rounded-lg bg-primary/10 p-3">
    <BarChart3 className="h-8 w-8 text-primary" />
  </div>
  <div>
    <h1 className="text-3xl font-bold">Alpha Generation</h1>
    <p className="text-muted-foreground mt-1">
      Quantum-Inspired Genetic Algorithm optimization
    </p>
  </div>
</div>
```

---

### 12.6 Stat Card Pattern

```tsx
<Card className="p-6">
  <div className="flex items-center justify-between mb-2">
    <p className="text-sm text-muted-foreground">Total PnL</p>
    <TrendingUp className="h-4 w-4 text-green-600" />
  </div>
  <p className="text-2xl font-bold font-mono text-green-600">
    +12.5%
  </p>
  <p className="text-xs text-muted-foreground mt-1">
    vs previous period
  </p>
</Card>
```

---

## 13. Accessibility

### 13.1 Color Contrast Requirements

**WCAG 2.1 Level AA:**
- Normal text: 4.5:1
- Large text (18pt+): 3:1
- UI components: 3:1

**Tiphub Compliance:**
- Primary orange on dark background: 8.2:1 (AAA) ✅
- White text on dark background: 15.8:1 (AAA) ✅
- Green-600 on dark background: 5.2:1 (AA) ✅
- Red-600 on dark background: 5.1:1 (AA) ✅

---

### 13.2 Focus States

**All interactive elements must have visible focus:**

```tsx
// Buttons (automatic via shadcn/ui)
<Button>
  // Has focus-visible:ring-2 by default
</Button>

// Custom elements
<div
  tabIndex={0}
  className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
>
  Custom interactive element
</div>
```

---

### 13.3 ARIA Labels

**Icon-only buttons MUST have aria-label:**
```tsx
<Button variant="ghost" size="icon" aria-label="Add to watchlist">
  <Heart className="h-4 w-4" />
</Button>
```

**Form fields should use proper labeling:**
```tsx
// ✅ Good: Explicit label
<Label htmlFor="email">Email</Label>
<Input id="email" />

// ❌ Bad: No label
<Input placeholder="Email" />

// ✅ Acceptable: aria-label if visual label not desired
<Input aria-label="Email" placeholder="Email" />
```

---

### 13.4 Keyboard Navigation

**Ensure logical tab order:**
```tsx
// Use tabIndex={0} for custom interactive elements
<div
  role="button"
  tabIndex={0}
  onClick={handleClick}
  onKeyDown={(e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      handleClick();
    }
  }}
>
  Custom button
</div>
```

**Skip links for long navigation:**
```tsx
<a
  href="#main-content"
  className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4"
>
  Skip to main content
</a>
```

---

### 13.5 Error Announcements

**Use aria-live for dynamic errors:**
```tsx
<div aria-live="polite" aria-atomic="true">
  {error && (
    <p className="text-red-600">
      {error}
    </p>
  )}
</div>
```

---

### 13.6 Test ID Conventions

**Pattern:** `data-testid="{type}-{identifier}"`

```tsx
// Buttons
<Button data-testid="button-analyze">Analyze</Button>
<Button data-testid="button-submit">Submit</Button>

// Cards
<Card data-testid={`card-stock-${stock.id}`}>

// Inputs
<Input data-testid="input-ticker" />

// Links
<Link data-testid="link-view-details">
```

---

## 14. Code Patterns & Best Practices

### 14.1 Utility Class Ordering

**Recommended order:**
1. Layout (flex, grid, block)
2. Positioning (relative, absolute)
3. Display properties
4. Sizing (w-, h-, min-, max-)
5. Spacing (p-, m-, gap-, space-)
6. Typography (text-, font-, leading-, tracking-)
7. Colors (text-, bg-, border-)
8. Effects (shadow-, opacity-, hover-)
9. Transitions/animations

**Example:**
```tsx
<div className="flex items-center justify-between w-full px-4 py-2 text-sm font-medium text-foreground bg-card border border-border rounded-md shadow-sm hover-elevate transition-colors">
```

---

### 14.2 Truncating Text

**Single line truncate:**
```tsx
<p className="truncate">
  Very long text that will be cut off...
</p>

// Ensure parent has defined width
<div className="w-[200px]">
  <p className="truncate">Text</p>
</div>

// For flex children
<div className="flex-1 min-w-0">
  <p className="truncate">Text</p>
</div>
```

**Multi-line truncate (line clamp):**
```tsx
<p className="line-clamp-2">
  Long text that will be limited to 2 lines...
</p>

<p className="line-clamp-3">
  Limited to 3 lines...
</p>
```

---

### 14.3 Common Class Combinations

```tsx
// Flex row with items aligned
"flex items-center gap-2"

// Flex row with space between
"flex items-center justify-between"

// Flex column with spacing
"flex flex-col gap-4"

// Vertical stack (simpler)
"space-y-4"

// Grid with responsive columns
"grid grid-cols-1 md:grid-cols-3 gap-4"

// Text right-aligned
"text-right"

// Text with ellipsis
"flex-1 min-w-0 truncate"

// Hidden on mobile, visible on desktop
"hidden md:block"

// Full width container
"w-full"

// Centered container
"mx-auto max-w-7xl"

// Card with hover
"rounded-xl border bg-card p-6 hover-elevate cursor-pointer"
```

---

### 14.4 Component Composition

**Compose components from shadcn/ui primitives:**

```tsx
// ✅ Good: Composed from primitives
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const StockCard = ({ stock }) => (
  <Card className="p-4 hover-elevate cursor-pointer">
    <h3>{stock.name}</h3>
    <Button variant="outline" size="sm">
      View Details
    </Button>
  </Card>
);

// ❌ Bad: Reimplementing from scratch
const StockCard = ({ stock }) => (
  <div className="rounded-xl border bg-card p-4 ...">
    <button className="inline-flex items-center ...">
      View Details
    </button>
  </div>
);
```

---

### 14.5 Conditional Rendering

**Use logical operators for simple conditions:**
```tsx
{isLoading && <Loader />}
{error && <ErrorMessage />}
{data && <DataTable data={data} />}
```

**Ternary for if-else:**
```tsx
{isPositive ? (
  <TrendingUp className="text-green-600" />
) : (
  <TrendingDown className="text-red-600" />
)}
```

**Early returns for complex conditions:**
```tsx
if (!data) {
  return <EmptyState />;
}

if (error) {
  return <ErrorState error={error} />;
}

return <DataView data={data} />;
```

---

### 14.6 Performance Patterns

**Memoize expensive computations:**
```tsx
const formatMarketCap = useMemo(() => {
  return computeMarketCap(stockData);
}, [stockData]);
```

**Debounce search inputs:**
```tsx
const [searchTerm, setSearchTerm] = useState('');
const debouncedSearch = useDebounce(searchTerm, 300);

useEffect(() => {
  if (debouncedSearch) {
    performSearch(debouncedSearch);
  }
}, [debouncedSearch]);
```

**Virtualize long lists:**
```tsx
// For 1000+ items, consider react-window or similar
import { FixedSizeList } from 'react-window';
```

---

### 14.7 Anti-Patterns to Avoid

**❌ DON'T:**
```tsx
// Using inline styles instead of Tailwind
<div style={{ padding: '16px', color: '#fff' }}>

// Not using semantic HTML
<div onClick={handleClick}>Click me</div>

// Missing keys in lists
{items.map(item => <div>{item.name}</div>)}

// Nested ternaries (hard to read)
{condition1 ? (
  condition2 ? <A /> : <B />
) : (
  condition3 ? <C /> : <D />
)}

// Too many props drilling
<Component prop1={a} prop2={b} prop3={c} prop4={d} prop5={e} />

// Magic numbers without explanation
<div className="mt-7">  // Why 7?
```

**✅ DO:**
```tsx
// Use Tailwind classes
<div className="p-4 text-white">

// Use semantic HTML
<button onClick={handleClick}>Click me</button>

// Always use keys
{items.map(item => <div key={item.id}>{item.name}</div>)}

// Extract complex logic
const content = getContent(conditions);
return <div>{content}</div>;

// Use composition and context
<Provider value={sharedData}>
  <Component />
</Provider>

// Use CSS variables or constants
const ALIGNMENT_OFFSET = 7;  // Aligns with ticker dropdown
<div className="mt-7">
```

---

## 15. CSS Variables & Theming

### 15.1 CSS Variables (Dark Theme)

**Complete reference from `client/src/index.css`:**

```css
:root {
  /* Layout */
  --radius: 0.5rem;

  /* Colors - Dark Theme (Default) */
  --background: 0 0% 11%;           /* #1b1b1b */
  --foreground: 0 0% 100%;          /* #ffffff */

  --card: 0 0% 14%;                 /* #242424 */
  --card-foreground: 0 0% 100%;
  --card-border: 0 0% 22%;

  --popover: 0 0% 14%;
  --popover-foreground: 0 0% 100%;

  --primary: 35 100% 55%;           /* #ffa31a - Orange */
  --primary-foreground: 0 0% 100%;
  --primary-border: 35 100% 45%;

  --secondary: 0 0% 20%;
  --secondary-foreground: 0 0% 92%;
  --secondary-border: 0 0% 26%;

  --muted: 0 0% 18%;
  --muted-foreground: 0 0% 70%;

  --accent: 0 0% 18%;
  --accent-foreground: 0 0% 100%;

  --destructive: 0 84% 60%;
  --destructive-foreground: 0 0% 100%;

  --border: 0 0% 20%;               /* #333333 */
  --input: 0 0% 26%;
  --ring: 35 100% 55%;              /* Same as primary */

  --sidebar: 0 0% 12%;
  --sidebar-foreground: 0 0% 92%;
  --sidebar-border: 0 0% 18%;

  /* Financial data colors (semantic) */
  --positive: 142 71% 45%;
  --positive-foreground: 142 71% 35%;
  --negative: 0 72% 51%;
  --negative-foreground: 0 72% 41%;
  --neutral: 0 0% 50%;
  --neutral-foreground: 0 0% 70%;

  /* Chart colors (semantic) */
  --chart-positive: 142 71% 45%;
  --chart-negative: 0 72% 51%;
  --chart-neutral: 0 0% 60%;
  --chart-volume: 0 0% 40%;

  /* Market status colors */
  --status-open: 142 71% 45%;
  --status-closed: 0 72% 51%;
  --status-pre-market: 35 100% 55%;

  /* Elevation */
  --elevate-1: rgba(255, 255, 255, 0.04);
  --elevate-2: rgba(255, 255, 255, 0.09);
  --button-outline: rgba(255, 255, 255, 0.08);
  --badge-outline: rgba(255, 255, 255, 0.05);
}
```

---

### 15.2 Using CSS Variables

**In Tailwind classes:**
```tsx
// Background using CSS variable
<div className="bg-primary">  // Uses var(--primary)

// Text color
<span className="text-primary">

// Border
<div className="border-border">
```

**In HSL format with alpha:**
```tsx
// 50% opacity primary
<div className="bg-primary/50">

// Custom opacity
<div style={{ backgroundColor: 'hsl(var(--primary) / 0.3)' }}>
```

**Direct CSS variable access:**
```tsx
<div style={{ color: 'hsl(var(--muted-foreground))' }}>
```

---

### 15.3 Extending the Theme

**In `tailwind.config.ts`:**

```typescript
export default {
  theme: {
    extend: {
      colors: {
        // Custom color not in CSS variables
        customBlue: '#3b82f6',

        // Or extend from CSS variables
        brand: {
          orange: 'hsl(var(--primary))',
          dark: 'hsl(var(--background))',
        }
      },
      spacing: {
        // Custom spacing
        '128': '32rem',
      }
    }
  }
}
```

---

### 15.4 Light Theme (Optional)

**If implementing light theme in the future:**

```css
@media (prefers-color-scheme: light) {
  :root {
    --background: 0 0% 100%;
    --foreground: 0 0% 11%;
    --card: 0 0% 98%;
    --card-foreground: 0 0% 11%;
    /* ... other variables */
  }
}
```

**Class-based theming (Tiphub uses this approach):**

```css
/* Dark mode is default (in :root) */
:root {
  --background: 0 0% 11%;
  --foreground: 0 0% 100%;

  /* Financial semantic colors - dark mode */
  --positive: 142 71% 45%;
  --positive-foreground: 142 71% 35%;
  --negative: 0 72% 51%;
  --negative-foreground: 0 72% 41%;
  --neutral: 0 0% 50%;
  --neutral-foreground: 0 0% 70%;

  /* Chart colors */
  --chart-positive: 142 71% 45%;
  --chart-negative: 0 72% 51%;
  --chart-neutral: 0 0% 60%;
  --chart-volume: 0 0% 40%;

  /* Market status */
  --status-open: 142 71% 45%;
  --status-closed: 0 72% 51%;
  --status-pre-market: 35 100% 55%;

  /* Elevation (white overlays for dark mode) */
  --elevate-1: rgba(255, 255, 255, 0.04);
  --elevate-2: rgba(255, 255, 255, 0.09);
}

/* Light mode overrides */
.light {
  --background: 0 0% 98%;
  --foreground: 0 0% 5%;

  /* Financial semantic colors - darker for light mode readability */
  --positive: 142 71% 35%;           /* Darker green */
  --positive-foreground: 142 71% 25%;
  --negative: 0 72% 45%;             /* Darker red */
  --negative-foreground: 0 72% 35%;
  --neutral: 0 0% 40%;
  --neutral-foreground: 0 0% 50%;

  /* Chart colors - darker for light mode */
  --chart-positive: 142 71% 35%;
  --chart-negative: 0 72% 45%;
  --chart-neutral: 0 0% 50%;
  --chart-volume: 0 0% 60%;

  /* Market status - same hue, darker */
  --status-open: 142 71% 35%;
  --status-closed: 0 72% 45%;
  --status-pre-market: 35 100% 45%;

  /* Elevation (black overlays for light mode) */
  --elevate-1: rgba(0, 0, 0, 0.04);
  --elevate-2: rgba(0, 0, 0, 0.09);
}
```

---

## 16. shadcn/ui Integration

### 16.1 Configuration

**`components.json`:**
```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "tailwind.config.ts",
    "css": "client/src/index.css",
    "baseColor": "neutral",
    "cssVariables": true,
    "prefix": ""
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui"
  }
}
```

**Key Settings:**
- **Style:** `new-york` (refined, professional variant)
- **RSC:** `false` (client-side only, not using React Server Components)
- **CSS Variables:** `true` (enables theming via CSS variables)
- **Base Color:** `neutral` (gray-based, with custom primary orange)

---

### 16.2 Adding New Components

```bash
# Install a component
npx shadcn@latest add button

# Install multiple
npx shadcn@latest add card dialog tabs

# Update existing components
npx shadcn@latest add button --overwrite
```

**Components are copied into `client/src/components/ui/`**

---

### 16.3 Customizing Components

**After adding, components can be freely modified:**

```tsx
// client/src/components/ui/button.tsx

// Original
const buttonVariants = cva(
  "inline-flex items-center justify-center...",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground...",
        // ...
      }
    }
  }
);

// Customize by adding a new variant
const buttonVariants = cva(
  "inline-flex items-center justify-center...",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground...",
        // Add custom variant
        premium: "bg-gradient-to-r from-orange-500 to-yellow-500 text-white",
      }
    }
  }
);
```

---

### 16.4 Theme Customization

**All theming happens via CSS variables in `index.css`**

**To change primary color:**
```css
:root {
  --primary: 35 100% 55%;  /* Change this */
  --primary-foreground: 0 0% 100%;
}
```

**To adjust border radius globally:**
```css
:root {
  --radius: 0.5rem;  /* Increase for more rounded corners */
}
```

---

### 16.5 Component Overrides

**Global style overrides in `index.css`:**

```css
/* Override all buttons */
.btn-custom {
  @apply hover-elevate active-elevate-2;
}

/* Override specific component */
[data-radix-dialog-overlay] {
  backdrop-filter: blur(4px);
}
```

---

## Appendix: Quick Reference

### Color Palette
| Color | Value | Usage |
|-------|-------|-------|
| Primary | `#ffa31a` / `hsl(35 100% 55%)` | Brand, CTAs, links |
| Background | `#1b1b1b` / `hsl(0 0% 11%)` | Page background |
| Card | `#242424` / `hsl(0 0% 14%)` | Card surfaces |
| Green | `#16a34a` | Positive/gains |
| Red | `#dc2626` | Negative/losses |
| Border | `#333333` / `hsl(0 0% 20%)` | Borders |

### Spacing Scale
| Class | Value | Common Use |
|-------|-------|------------|
| `p-2` | 8px | Compact padding |
| `p-4` | 16px | Standard padding |
| `p-6` | 24px | Card padding |
| `gap-4` | 16px | Grid/flex gap |
| `space-y-4` | 16px | Vertical stack |

### Typography Scale
| Class | Size | Usage |
|-------|------|-------|
| `text-3xl font-bold` | 32px | Page titles |
| `text-xl font-semibold` | 20px | Section headers |
| `text-sm` | 14px | Body text |
| `text-xs uppercase` | 12px | Labels |

### Icon Sizes
| Class | Size | Usage |
|-------|------|-------|
| `h-3 w-3` | 12px | Inline indicators |
| `h-4 w-4` | 16px | Buttons, nav |
| `h-5 w-5` | 20px | Action buttons |
| `h-8 w-8` | 32px | Page headers |

### Breakpoints
| Name | Value | Usage |
|------|-------|-------|
| `md:` | 768px | Tablet+ |
| `lg:` | 1024px | Desktop+ |

---

## Version History

- **v2.0** (2025-11-30): Major update with theme system and semantic colors
  - Added light/dark theme system documentation (Section 1A)
  - Added theme utilities (Section 1B): getCSSColor(), formatFinancialValue(), etc.
  - Added smart loading system (Section 1C): useSmartLoader hook, skeleton components
  - Added custom hooks reference (Section 1D): useMarketMood, useMarketStatus, useSearch, etc.
  - Replaced hardcoded colors with semantic tokens (text-positive/text-negative)
  - Replaced chart-1..5 with semantic chart colors (--chart-positive/negative/neutral/volume)
  - Added new components: DataCard, FinancialCard, MetricDisplay, SectionHeader
  - Added change indicators: ChangeIndicator, ChangeBadge, ChangeText
  - Added status components: MarketStatusBadge, MarketMood, ComputeStatusBadge
  - Added search components: SearchBar, SearchResults, RecentSearches, TrendingStocks
  - Updated elevation system with new utilities (hover-elevate-2, toggle-elevate)
  - Updated chart patterns to use theme-aware getCSSColor() and useChartTheme()
  - Updated toast system to use Sonner (removed old shadcn toast)
  - Added complete light mode CSS variable overrides
  - Removed outdated patterns and hardcoded color examples

- **v1.0** (2025-01-09): Initial comprehensive design guidelines
  - Created after extensive codebase analysis
  - Extracted patterns from Tiphub production code
  - Includes all design decisions and rationale

---

## Contributing to These Guidelines

When making design changes to Tiphub:

1. Update this document with new patterns
2. Document rationale for design decisions
3. Include code examples
4. Update anti-patterns section if applicable
5. Keep color palette and spacing references up to date

---

**End of Design Guidelines**
