import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

type AnimatedNumberProps = {
  value: number;
  decimals?: number;
  className?: string;
  /** Highlights the cell briefly when value changes (price-flash effect) */
  flashOnChange?: boolean;
};

const formatNumber = (n: number, decimals: number) => {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-IN", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
};

/**
 * Compact inline number with optional price-flash on change.
 * Use for live LTP cells in tables and tickers.
 */
export function AnimatedNumber({
  value,
  decimals = 2,
  className,
  flashOnChange = true,
}: AnimatedNumberProps) {
  const [direction, setDirection] = useState<"up" | "down" | null>(null);
  const prev = useRef(value);

  useEffect(() => {
    if (!flashOnChange) return;
    if (value === prev.current) return;
    setDirection(value > prev.current ? "up" : "down");
    prev.current = value;
    const t = setTimeout(() => setDirection(null), 600);
    return () => clearTimeout(t);
  }, [value, flashOnChange]);

  return (
    <span className={cn("font-mono tabular-nums relative inline-block", className)}>
      <AnimatePresence>
        {direction && (
          <motion.span
            initial={{ opacity: 0.28 }}
            animate={{ opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className={cn(
              "absolute inset-0 -mx-1 -my-0.5 rounded-sm pointer-events-none",
              direction === "up" ? "bg-positive" : "bg-negative",
            )}
            aria-hidden
          />
        )}
      </AnimatePresence>
      <span className="relative">{formatNumber(value, decimals)}</span>
    </span>
  );
}
