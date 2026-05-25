import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface PeriodPickerProps {
  value?: number;
  onChange: (period: number) => void;
  commonPeriods?: number[];
  className?: string;
}

export function PeriodPicker({ value, onChange, commonPeriods = [], className }: PeriodPickerProps) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState("");

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-1 rounded-md border border-border/60 bg-muted/50 hover:bg-muted px-1.5 py-1 text-xs font-mono transition-colors focus:outline-none focus:ring-2 focus:ring-primary/50",
            className,
          )}
          aria-label="Period"
        >
          <span className="text-muted-foreground">{value ?? "n"}</span>
          <ChevronDown className="w-3 h-3 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[160px] p-0" align="start">
        <Command>
          <CommandList>
            {commonPeriods.length > 0 && (
              <CommandGroup heading="Common">
                {commonPeriods.map((p) => (
                  <CommandItem
                    key={p}
                    value={String(p)}
                    onSelect={() => { onChange(p); setOpen(false); }}
                    className="font-mono"
                  >
                    {p}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
        <div className="border-t border-border/60 p-2">
          <label className="text-[10px] text-muted-foreground uppercase tracking-wide">Custom</label>
          <Input
            type="number"
            min={1}
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const n = parseInt(custom, 10);
                if (!isNaN(n) && n >= 1) {
                  onChange(n);
                  setOpen(false);
                  setCustom("");
                }
              }
            }}
            className="mt-1 h-7 text-xs"
            placeholder="e.g. 30"
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
