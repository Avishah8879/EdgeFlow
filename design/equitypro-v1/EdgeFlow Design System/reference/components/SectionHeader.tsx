import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { type ReactNode } from "react";

interface SectionHeaderProps {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
  showSeparator?: boolean;
  size?: "sm" | "md" | "lg";
}

const sizeStyles = {
  sm: {
    title: "text-base font-semibold",
    description: "text-xs",
    spacing: "space-y-1",
  },
  md: {
    title: "text-xl font-semibold",
    description: "text-sm",
    spacing: "space-y-1.5",
  },
  lg: {
    title: "text-2xl font-semibold",
    description: "text-base",
    spacing: "space-y-2",
  },
};

export function SectionHeader({
  title,
  description,
  action,
  className,
  showSeparator = false,
  size = "md",
}: SectionHeaderProps) {
  const styles = sizeStyles[size];

  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex items-start justify-between gap-4">
        <div className={cn("flex-1", styles.spacing)}>
          <h2 className={cn(styles.title, "tracking-tight")}>{title}</h2>
          {description && (
            <p className={cn(styles.description, "text-muted-foreground")}>{description}</p>
          )}
        </div>
        {action && <div className="flex-shrink-0">{action}</div>}
      </div>
      {showSeparator && <Separator />}
    </div>
  );
}
