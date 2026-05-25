import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface OffsetPickerProps {
  /** undefined or 0 = Latest. Positive N = N bars ago. */
  value?: number;
  onChange: (offset: number | undefined) => void;
  className?: string;
}

const PRESET_OFFSETS = [0, 1, 2, 3, 5, 10, 20];

export function OffsetPicker({ value, onChange, className }: OffsetPickerProps) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState("");

  const label = !value || value === 0 ? "Latest" : `${value}d ago`;

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
          <span className="text-muted-foreground">{label}</span>
          <ChevronDown className="w-3 h-3 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[180px] p-0" align="start">
        <Command>
          <CommandList>
            <CommandGroup heading="Offset">
              {PRESET_OFFSETS.map((n) => (
                <CommandItem
                  key={n}
                  value={String(n)}
                  onSelect={() => {
                    onChange(n === 0 ? undefined : n);
                    setOpen(false);
                  }}
                >
                  {n === 0 ? "Latest" : `${n} bar${n === 1 ? "" : "s"} ago`}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
        <div className="border-t border-border/60 p-2">
          <label className="text-[10px] text-muted-foreground uppercase tracking-wide">Custom (1-49)</label>
          <Input
            type="number"
            min={1}
            max={49}
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const n = parseInt(custom, 10);
                if (!isNaN(n) && n >= 1 && n <= 49) {
                  onChange(n);
                  setOpen(false);
                  setCustom("");
                }
              }
            }}
            className="mt-1 h-7 text-xs"
            placeholder="e.g. 5"
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
