import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { type ReactNode } from "react";

interface FinancialCardProps {
  children: ReactNode;
  className?: string;
  variant?: "elevated" | "outlined" | "ghost" | "compact";
  title?: string;
  description?: string;
  headerAction?: ReactNode;
  footer?: ReactNode;
  noPadding?: boolean;
}

const variantStyles = {
  elevated: "hover-elevate transition-all duration-200",
  outlined: "border-2 bg-card/50",
  ghost: "border-0 shadow-none bg-transparent",
  compact: "p-3",
};

export function FinancialCard({
  children,
  className,
  variant = "elevated",
  title,
  description,
  headerAction,
  footer,
  noPadding = false,
}: FinancialCardProps) {
  return (
    <Card className={cn(variantStyles[variant], className)}>
      {(title || description || headerAction) && (
        <CardHeader className={variant === "compact" ? "p-3 pb-2" : undefined}>
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1 flex-1">
              {title && <CardTitle className="text-base font-semibold">{title}</CardTitle>}
              {description && (
                <CardDescription className="text-sm text-muted-foreground">
                  {description}
                </CardDescription>
              )}
            </div>
            {headerAction && <div className="flex-shrink-0">{headerAction}</div>}
          </div>
        </CardHeader>
      )}
      <CardContent className={cn(
        variant === "compact" ? "p-3 pt-0" : noPadding ? "p-0" : undefined
      )}>
        {children}
      </CardContent>
      {footer && (
        <CardFooter className={variant === "compact" ? "p-3 pt-0" : undefined}>
          {footer}
        </CardFooter>
      )}
    </Card>
  );
}
