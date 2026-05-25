import { ReactNode, HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/* ────────────────────────────────────────────────────────────────────────── */
/*  KPI strip — design pattern: 5 cells in a single bordered card,            */
/*  divided by 1px borders. Each cell: eyebrow + mono numeric + delta.        */
/* ────────────────────────────────────────────────────────────────────────── */

export interface AdminKpiStripProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  cols?: 2 | 3 | 4 | 5 | 6;
}

export function AdminKpiStrip({
  children,
  cols = 5,
  className,
  ...rest
}: AdminKpiStripProps) {
  const colsClass = {
    2: "grid-cols-2",
    3: "grid-cols-2 md:grid-cols-3",
    4: "grid-cols-2 md:grid-cols-4",
    5: "grid-cols-2 md:grid-cols-3 lg:grid-cols-5",
    6: "grid-cols-2 md:grid-cols-3 lg:grid-cols-6",
  }[cols];
  return (
    <div
      className={cn(
        "grid bg-card border border-border rounded-lg overflow-hidden",
        colsClass,
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

export interface AdminKpiProps {
  label: string;
  value: ReactNode;
  delta?: ReactNode;
  /** Tone for the delta line. */
  tone?: "positive" | "negative" | "neutral";
  /** Highlight the value in gold (used for monetary KPIs in design). */
  accent?: "gold" | "navy";
}

export function AdminKpi({ label, value, delta, tone = "neutral", accent }: AdminKpiProps) {
  const valueClass =
    accent === "gold"
      ? "text-[hsl(var(--brand-gold))]"
      : "text-[hsl(var(--brand-navy))] dark:text-foreground";
  const deltaClass = {
    positive: "text-positive",
    negative: "text-negative",
    neutral: "text-muted-foreground",
  }[tone];
  return (
    <div className="px-5 py-4 border-r border-border last:border-r-0 [&:nth-child(n+4)]:border-t md:[&:nth-child(n+4)]:border-t-0 lg:[&:nth-child(n+6)]:border-t">
      <div className="text-[10.5px] font-bold uppercase tracking-uppercase text-muted-foreground">
        {label}
      </div>
      <div className={cn("font-mono tabular-nums text-2xl font-bold mt-1", valueClass)}>
        {value}
      </div>
      {delta && (
        <div className={cn("font-mono tabular-nums text-[11.5px] font-semibold mt-0.5", deltaClass)}>
          {delta}
        </div>
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Panel — design pattern: bordered card with editorial Playfair heading     */
/*  + gold-bottom rule + actions on the right.                                */
/* ────────────────────────────────────────────────────────────────────────── */

export interface AdminPanelProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  /** Render without internal padding (for full-bleed tables). */
  flush?: boolean;
  children: ReactNode;
}

export function AdminPanel({
  title,
  description,
  actions,
  flush = false,
  className,
  children,
  ...rest
}: AdminPanelProps) {
  return (
    <section
      className={cn(
        "bg-card border border-border rounded-lg",
        flush ? "" : "p-5",
        className,
      )}
      {...rest}
    >
      {(title || actions) && (
        <header
          className={cn(
            "flex items-end justify-between gap-3 pb-3.5 mb-4 border-b border-border",
            flush && "px-5 pt-5",
          )}
        >
          <div className="min-w-0">
            {title && (
              <h2 className="font-display text-lg font-bold tracking-tight text-[hsl(var(--brand-navy))] dark:text-foreground">
                {title}
              </h2>
            )}
            {description && (
              <p className="text-xs text-muted-foreground mt-1">{description}</p>
            )}
          </div>
          {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
        </header>
      )}
      <div className={cn(flush && "px-0")}>{children}</div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  FeedRow — timestamp/badge + title + sub. Used for audit logs, activity,   */
/*  feature flag rollout lists, etc.                                          */
/* ────────────────────────────────────────────────────────────────────────── */

export interface AdminFeedRowProps {
  /** Left gutter — short timestamp, percentage, or badge. */
  marker?: ReactNode;
  title: ReactNode;
  sub?: ReactNode;
  actions?: ReactNode;
}

export function AdminFeedRow({ marker, title, sub, actions }: AdminFeedRowProps) {
  return (
    <div className="grid grid-cols-[auto_1fr_auto] gap-3 items-start py-3 border-b border-border last:border-0 text-[12.5px]">
      {marker && (
        <div className="font-mono tabular-nums text-[10.5px] text-muted-foreground pt-0.5 min-w-[60px]">
          {marker}
        </div>
      )}
      {!marker && <div />}
      <div className="min-w-0">
        <div className="font-semibold leading-snug">{title}</div>
        {sub && <div className="text-[11.5px] text-muted-foreground mt-0.5 leading-snug">{sub}</div>}
      </div>
      {actions && <div className="flex-shrink-0">{actions}</div>}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  HealthRow — service-name + horizontal meter + percentage. Used for the    */
/*  System health panel.                                                      */
/* ────────────────────────────────────────────────────────────────────────── */

export interface AdminHealthRowProps {
  label: ReactNode;
  /** 0..100. */
  pct: number;
  /** Override the bar fill colour token. Default: positive when pct>=99, gold otherwise. */
  tone?: "positive" | "gold" | "negative";
  /** Override the percentage text. */
  value?: ReactNode;
}

export function AdminHealthRow({ label, pct, tone, value }: AdminHealthRowProps) {
  const inferredTone: "positive" | "gold" | "negative" =
    tone ?? (pct >= 99 ? "positive" : pct >= 95 ? "gold" : "negative");
  const fillClass = {
    positive: "bg-[hsl(var(--positive))]",
    gold: "bg-[hsl(var(--brand-gold))]",
    negative: "bg-[hsl(var(--negative))]",
  }[inferredTone];
  const pctClass = {
    positive: "text-positive",
    gold: "text-[hsl(var(--brand-gold))]",
    negative: "text-negative",
  }[inferredTone];
  return (
    <div className="grid grid-cols-[1fr_auto_auto] gap-3 items-center py-2.5 border-b border-border last:border-0 text-[12.5px]">
      <span className="truncate">{label}</span>
      <div className="w-[90px] h-[5px] bg-muted rounded-full overflow-hidden">
        <div className={cn("h-full", fillClass)} style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
      </div>
      <span className={cn("font-mono tabular-nums font-bold text-xs min-w-[52px] text-right", pctClass)}>
        {value ?? `${pct.toFixed(2)} %`}
      </span>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Avatar — colored circle with initials. Auto-derived from a string.        */
/* ────────────────────────────────────────────────────────────────────────── */

const AVATAR_COLORS = [
  "hsl(var(--brand-navy))",
  "hsl(var(--brand-gold))",
  "hsl(213 50% 50%)",
  "hsl(150 60% 40%)",
  "hsl(0 50% 50%)",
  "hsl(38 60% 50%)",
];

function hash(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export interface AdminAvatarProps {
  name: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function AdminAvatar({ name, size = "sm", className }: AdminAvatarProps) {
  const initials = name
    .split(/\s+|@|\./)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("") || "?";
  const bg = AVATAR_COLORS[hash(name) % AVATAR_COLORS.length];
  const sizeClass = {
    sm: "w-7 h-7 text-[11px]",
    md: "w-9 h-9 text-xs",
    lg: "w-11 h-11 text-sm",
  }[size];
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-full text-white font-bold flex-shrink-0",
        sizeClass,
        className,
      )}
      style={{ background: bg }}
      aria-hidden="true"
    >
      {initials}
    </span>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Section title — for "Section · sub-section" block titles inside a page    */
/*  (between AdminLayout masthead and panels).                                */
/* ────────────────────────────────────────────────────────────────────────── */

export function AdminSectionTitle({
  eyebrow,
  title,
  description,
  className,
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1", className)}>
      {eyebrow && (
        <div className="text-[10.5px] font-bold uppercase tracking-uppercase text-muted-foreground">
          {eyebrow}
        </div>
      )}
      <h2 className="font-display text-xl font-bold tracking-tight text-[hsl(var(--brand-navy))] dark:text-foreground">
        {title}
      </h2>
      {description && (
        <p className="text-sm text-muted-foreground">{description}</p>
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Status badge — small inline pill for plan / role / state markers.         */
/* ────────────────────────────────────────────────────────────────────────── */

export type AdminBadgeTone =
  | "gold"
  | "navy"
  | "positive"
  | "negative"
  | "neutral"
  | "muted";

export function AdminPill({
  tone = "muted",
  pulse = false,
  children,
  className,
}: {
  tone?: AdminBadgeTone;
  pulse?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const toneClass = {
    gold: "bg-[hsl(var(--brand-gold))]/15 text-[hsl(var(--brand-gold))] border-[hsl(var(--brand-gold))]/30",
    navy: "bg-[hsl(var(--brand-navy))]/10 text-[hsl(var(--brand-navy))] dark:text-[hsl(38_30%_88%)] border-[hsl(var(--brand-navy))]/30",
    positive: "bg-[hsl(var(--positive))]/12 text-positive border-[hsl(var(--positive))]/30",
    negative: "bg-[hsl(var(--negative))]/12 text-negative border-[hsl(var(--negative))]/30",
    neutral: "bg-muted text-foreground border-border",
    muted: "bg-muted/40 text-muted-foreground border-border",
  }[tone];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 h-6 px-2 rounded-full border text-[10.5px] font-bold uppercase tracking-uppercase",
        toneClass,
        className,
      )}
    >
      {pulse && (
        <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
      )}
      {children}
    </span>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Numeric cell — convenience for table cells where the design specifies     */
/*  mono + tabular-nums + right-aligned numerics.                             */
/* ────────────────────────────────────────────────────────────────────────── */

export function AdminNumCell({
  children,
  tone = "default",
  className,
}: {
  children: ReactNode;
  tone?: "default" | "muted" | "positive" | "negative" | "gold";
  className?: string;
}) {
  const toneClass = {
    default: "text-foreground",
    muted: "text-muted-foreground",
    positive: "text-positive",
    negative: "text-negative",
    gold: "text-[hsl(var(--brand-gold))]",
  }[tone];
  return (
    <span className={cn("font-mono tabular-nums", toneClass, className)}>
      {children}
    </span>
  );
}
