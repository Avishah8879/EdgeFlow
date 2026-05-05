import { ChangeIndicator } from "@/components/ChangeIndicator";
import { cn } from "@/lib/utils";
import { type ReactNode } from "react";

interface MetricDisplayProps {
  label: string;
  value: string | number;
  change?: number;
  changeType?: "percentage" | "absolute";
  icon?: ReactNode;
  className?: string;
  size?: "sm" | "md" | "lg";
  valueClassName?: string;
  orientation?: "vertical" | "horizontal";
}

const sizeStyles = {
  sm: {
    label: "text-xs",
    value: "text-sm font-semibold",
    container: "gap-1",
  },
  md: {
    label: "text-sm",
    value: "text-lg font-semibold",
    container: "gap-1.5",
  },
  lg: {
    label: "text-base",
    value: "text-2xl font-semibold",
    container: "gap-2",
  },
};

export function MetricDisplay({
  label,
  value,
  change,
  changeType = "percentage",
  icon,
  className,
  size = "md",
  valueClassName,
  orientation = "vertical",
}: MetricDisplayProps) {
  const styles = sizeStyles[size];

  if (orientation === "horizontal") {
    return (
      <div className={cn("flex items-center justify-between gap-3", className)}>
        <div className="flex items-center gap-2 text-muted-foreground">
          {icon}
          <span className={styles.label}>{label}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={cn(styles.value, valueClassName)}>{value}</span>
          {change !== undefined && (
            <ChangeIndicator
              value={change}
              className={size === "sm" ? "text-xs" : size === "lg" ? "text-base" : "text-sm"}
            />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col", styles.container, className)}>
      <div className="flex items-center gap-1.5 text-muted-foreground">
        {icon}
        <span className={styles.label}>{label}</span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className={cn(styles.value, "font-mono", valueClassName)}>{value}</span>
        {change !== undefined && (
          <ChangeIndicator
            value={change}
            className={size === "sm" ? "text-xs" : size === "lg" ? "text-base" : "text-sm"}
          />
        )}
      </div>
    </div>
  );
}
