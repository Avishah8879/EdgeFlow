import logoSvg from "@/assets/logo.svg";
import iconSvg from "@/assets/icon.svg";

type TiphubLogoProps = {
  className?: string;
  size?: "sm" | "md" | "lg";
  /** Use icon-only variant (no text) */
  iconOnly?: boolean;
};

const LOGO_HEIGHTS: Record<NonNullable<TiphubLogoProps["size"]>, number> = {
  sm: 24,
  md: 32,
  lg: 40,
};

const ICON_HEIGHTS: Record<NonNullable<TiphubLogoProps["size"]>, number> = {
  sm: 16,
  md: 20,
  lg: 24,
};

export function TiphubLogo({
  className = "",
  size = "md",
  iconOnly = false,
}: TiphubLogoProps) {
  const height = iconOnly
    ? ICON_HEIGHTS[size] ?? ICON_HEIGHTS.md
    : LOGO_HEIGHTS[size] ?? LOGO_HEIGHTS.md;

  const src = iconOnly ? iconSvg : logoSvg;

  return (
    <img
      src={src}
      alt="Tiphub"
      height={height}
      className={className}
      style={{ height: `${height}px`, width: "auto" }}
    />
  );
}
