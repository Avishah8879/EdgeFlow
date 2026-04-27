type EquityProLogoProps = {
  className?: string;
  size?: "sm" | "md" | "lg";
  iconOnly?: boolean;
};

const SIZES = {
  sm: { icon: 20, text: 16 },
  md: { icon: 28, text: 22 },
  lg: { icon: 36, text: 30 },
} as const;

export function EquityProLogo({
  className = "",
  size = "md",
  iconOnly = false,
}: EquityProLogoProps) {
  const dims = SIZES[size] ?? SIZES.md;

  const Icon = (
    <svg
      width={dims.icon}
      height={dims.icon}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M3 25 Q 11 22, 17 15 T 29 4"
        stroke="hsl(var(--primary))"
        strokeWidth={3}
        strokeLinecap="round"
        fill="none"
      />
      <circle cx={29} cy={4} r={2.5} fill="hsl(var(--primary))" />
    </svg>
  );

  if (iconOnly) {
    return (
      <span className={className} aria-label="Equity Pro">
        {Icon}
      </span>
    );
  }

  return (
    <span
      className={className}
      style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
      aria-label="Equity Pro"
    >
      {Icon}
      <span
        style={{
          fontFamily: '"Instrument Serif", Newsreader, Georgia, serif',
          fontSize: dims.text,
          fontStyle: "italic",
          letterSpacing: "-0.01em",
          lineHeight: 1,
          color: "hsl(var(--foreground))",
        }}
      >
        Equity Pro
      </span>
    </span>
  );
}
