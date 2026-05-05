/**
 * EquityPro brand lockup — shield mark + wordmark.
 *
 * Visual reference: design/equitypro-v1/EdgeFlow Design System/assets/shield.png
 * Wordmark colors come from theme tokens:
 *   - Light theme: --brand-navy (#1F3A5F)
 *   - Dark theme:  --brand-gold (#C8A04A)
 */
type EquityProLogoProps = {
  className?: string;
  size?: "sm" | "md" | "lg";
  iconOnly?: boolean;
};

const SIZES = {
  sm: { icon: 22, text: 16 },
  md: { icon: 28, text: 18 },
  lg: { icon: 40, text: 26 },
} as const;

export function EquityProLogo({
  className = "",
  size = "md",
  iconOnly = false,
}: EquityProLogoProps) {
  const dims = SIZES[size] ?? SIZES.md;

  const Icon = (
    <img
      src="/equitypro-shield.png"
      alt=""
      width={dims.icon}
      height={dims.icon}
      style={{ width: dims.icon, height: dims.icon, display: "block" }}
      aria-hidden="true"
    />
  );

  if (iconOnly) {
    return (
      <span className={className} aria-label="EquityPro">
        {Icon}
      </span>
    );
  }

  return (
    <span
      className={className}
      style={{ display: "inline-flex", alignItems: "center", gap: 10 }}
      aria-label="EquityPro"
    >
      {Icon}
      <span
        className="text-[hsl(var(--brand-navy))] dark:text-[hsl(var(--brand-gold))]"
        style={{
          fontFamily: 'var(--font-sans)',
          fontWeight: 800,
          fontSize: dims.text,
          letterSpacing: "-0.015em",
          lineHeight: 1,
        }}
      >
        EquityPro
      </span>
    </span>
  );
}
