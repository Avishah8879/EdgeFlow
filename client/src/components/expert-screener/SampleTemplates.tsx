import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { LucideIcon } from "lucide-react";

/**
 * Shape of a built-in sample template. Both Expert and Fundamental screeners
 * supply their own list (see expert-sample-templates.ts and
 * fundamental-sample-templates.ts). The component renders any list the same
 * way, so visual style stays in sync between screeners.
 */
export interface SampleTemplate {
  id: string;
  name: string;
  description: string;
  expression: string;
  Icon: LucideIcon;
}

interface SampleTemplatesProps {
  templates: SampleTemplate[];
  onTemplateSelect: (expression: string) => void;
  disabled?: boolean;
  /** Optional override for the heading subtitle (Fundamental's may differ). */
  subtitle?: string;
}

export default function SampleTemplates({
  templates,
  onTemplateSelect,
  disabled = false,
  subtitle = "Start from a battle-tested expression",
}: SampleTemplatesProps) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold mb-1">Sample Templates</h2>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {templates.map((template) => {
          const Icon = template.Icon;
          return (
            <Card
              key={template.id}
              className={`cursor-pointer transition-all duration-200 ${
                disabled
                  ? "opacity-50 cursor-not-allowed"
                  : "hover-elevate hover:border-primary/50"
              }`}
              onClick={() => !disabled && onTemplateSelect(template.expression)}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Icon className="w-5 h-5 text-primary" />
                      {template.name}
                    </CardTitle>
                    <CardDescription className="text-xs mt-1">
                      {template.description}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="p-2 bg-accent text-accent-foreground rounded text-xs font-mono break-words">
                  {template.expression}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
