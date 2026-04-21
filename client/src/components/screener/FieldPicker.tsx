import { useMemo, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { getFieldCatalog, groupFields } from "@/lib/screener/fields";
import type { FieldDef, Variant } from "@/lib/screener/types";

interface FieldPickerProps {
  variant: Variant;
  /** Currently selected field's base name (e.g. "ema", "close", "trailing_pe") */
  value?: string;
  onSelect: (def: FieldDef) => void;
  placeholder?: string;
  className?: string;
}

export function FieldPicker({ variant, value, onSelect, placeholder = "Select field", className }: FieldPickerProps) {
  const [open, setOpen] = useState(false);
  const catalog = useMemo(() => getFieldCatalog(variant), [variant]);
  const grouped = useMemo(() => groupFields(catalog), [catalog]);
  const selected = useMemo(() => catalog.find((f) => f.name === value), [catalog, value]);

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
          <span className={selected ? "text-foreground" : "text-muted-foreground"}>
            {selected?.label ?? placeholder}
          </span>
          <ChevronDown className="w-3 h-3 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search fields..." />
          <CommandList className="max-h-[320px]">
            <CommandEmpty>No field found.</CommandEmpty>
            {grouped.map((g) => (
              <CommandGroup key={g.group} heading={g.group}>
                {g.fields.map((f) => (
                  <CommandItem
                    key={f.name}
                    value={`${f.label} ${f.name}`}
                    onSelect={() => { onSelect(f); setOpen(false); }}
                  >
                    <Check className={cn("mr-2 h-3 w-3", selected?.name === f.name ? "opacity-100" : "opacity-0")} />
                    <span className="flex-1">{f.label}</span>
                    <code className="text-[10px] text-muted-foreground ml-2">{f.name}</code>
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
