import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { type ReactNode } from "react";

interface DataItem {
  label: string;
  value: string | number | ReactNode;
  icon?: ReactNode;
  valueClassName?: string;
}

interface DataCardProps {
  title?: string;
  data: DataItem[];
  columns?: 1 | 2 | 3 | 4;
  className?: string;
  isLoading?: boolean;
  headerAction?: ReactNode;
}

const columnStyles = {
  1: "grid-cols-1",
  2: "grid-cols-1 sm:grid-cols-2",
  3: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
  4: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4",
};

export function DataCard({
  title,
  data,
  columns = 2,
  className,
  isLoading = false,
  headerAction,
}: DataCardProps) {
  if (isLoading) {
    return (
      <Card className={className}>
        {title && (
          <CardHeader>
            <Skeleton className="h-6 w-32" />
          </CardHeader>
        )}
        <CardContent>
          <div className={cn("grid gap-4", columnStyles[columns])}>
            {Array.from({ length: columns * 2 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-6 w-full" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn("hover-elevate transition-all duration-200", className)}>
      {title && (
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <CardTitle className="text-base font-semibold">{title}</CardTitle>
            {headerAction}
          </div>
        </CardHeader>
      )}
      <CardContent>
        <div className={cn("grid gap-4", columnStyles[columns])}>
          {data.map((item, index) => (
            <div key={index} className="flex flex-col gap-1">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                {item.icon}
                <span>{item.label}</span>
              </div>
              <div className={cn("text-sm font-semibold font-mono", item.valueClassName)}>
                {item.value}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
