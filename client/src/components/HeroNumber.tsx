import { useEffect } from "react";
import { animate, motion, useMotionValue, useTransform } from "framer-motion";
import { cn } from "@/lib/utils";

type HeroNumberProps = {
  value: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
  /** Indian number system grouping (lakhs/crores) */
  indianFormat?: boolean;
};

const formatNumber = (n: number, decimals: number, indianFormat: boolean) => {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString(indianFormat ? "en-IN" : "en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
};

/**
 * Oversized serif number with spring-animated updates.
 * Use for hero prices, market indices, headline metrics.
 */
export function HeroNumber({
  value,
  decimals = 2,
  prefix,
  suffix,
  className,
  indianFormat = true,
}: HeroNumberProps) {
  const motionValue = useMotionValue(value);
  const display = useTransform(motionValue, (v) =>
    formatNumber(v, decimals, indianFormat),
  );

  useEffect(() => {
    const controls = animate(motionValue, value, {
      type: "spring",
      stiffness: 80,
      damping: 22,
      mass: 0.6,
    });
    return controls.stop;
  }, [value, motionValue]);

  return (
    <span
      className={cn(
        "font-serif italic font-light tabular-nums tracking-tight",
        className,
      )}
      style={{ display: "inline-flex", alignItems: "baseline", gap: "0.1em" }}
    >
      {prefix && <span className="text-[0.65em] not-italic font-sans">{prefix}</span>}
      <motion.span>{display}</motion.span>
      {suffix && <span className="text-[0.5em] not-italic font-sans">{suffix}</span>}
    </span>
  );
}
