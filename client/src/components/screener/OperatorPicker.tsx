import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { COMMON_OPERATORS, CROSSOVER_OPERATORS, operatorLabel } from "@/lib/screener/compile";
import type { Operator } from "@/lib/screener/types";

interface OperatorPickerProps {
  value: Operator;
  onChange: (op: Operator) => void;
  /** When false, hides crossed_above / crossed_below. Fundamental screener = false. */
  allowCrossovers?: boolean;
  className?: string;
}

export function OperatorPicker({ value, onChange, allowCrossovers = true, className }: OperatorPickerProps) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-muted/50 hover:bg-muted px-2 py-1 text-xs font-mono transition-colors focus:outline-none focus:ring-2 focus:ring-primary/50",
            className,
          )}
        >
          <span>{operatorLabel(value)}</span>
          <ChevronDown className="w-3 h-3 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[180px] p-0" align="start">
        <Command>
          <CommandList>
            <CommandGroup heading="Comparison">
              {COMMON_OPERATORS.map((op) => (
                <CommandItem
                  key={op}
                  value={op}
                  onSelect={() => { onChange(op); setOpen(false); }}
                  className="font-mono"
                >
                  {operatorLabel(op)}
                </CommandItem>
              ))}
            </CommandGroup>
            {allowCrossovers && (
              <CommandGroup heading="Crossovers">
                {CROSSOVER_OPERATORS.map((op) => (
                  <CommandItem
                    key={op}
                    value={op}
                    onSelect={() => { onChange(op); setOpen(false); }}
                  >
                    {operatorLabel(op)}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
