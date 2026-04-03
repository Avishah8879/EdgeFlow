import { useState, useRef, useEffect } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { HourlyTickerOption } from "@/hooks/use-hourly-ticker-options";

// Check if long_name is valid (not garbage data like "MOS.NS,0P0001QQNM,24800")
function isValidLongName(name: string | null | undefined): name is string {
  if (!name) return false;
  // Garbage patterns: contains .NS followed by comma, or multiple commas
  if (name.includes(".NS,") || name.includes(",0P")) return false;
  // Too short to be a real company name
  if (name.length < 3) return false;
  return true;
}

interface TickerComboboxProps {
  options: HourlyTickerOption[];
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  isLoading?: boolean;
}

export function TickerCombobox({
  options,
  value,
  onValueChange,
  placeholder = "Select ticker...",
  disabled = false,
  isLoading = false,
}: TickerComboboxProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [triggerWidth, setTriggerWidth] = useState(300);

  // Measure trigger width when popover opens
  useEffect(() => {
    if (open && triggerRef.current) {
      const width = triggerRef.current.offsetWidth;
      setTriggerWidth(Math.max(300, width));
    }
  }, [open]);

  const selectedOption = options.find((opt) => opt.symbol === value);
  const displayLabel = selectedOption
    ? `${selectedOption.symbol}${isValidLongName(selectedOption.long_name) ? ` - ${selectedOption.long_name}` : ""}`
    : placeholder;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          ref={triggerRef}
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
          disabled={disabled || isLoading}
        >
          <span className="truncate">
            {isLoading ? "Loading tickers..." : displayLabel}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="p-0"
        style={{ width: triggerWidth }}
        align="start"
      >
        <Command
          filter={(value, search) => {
            // Show ALL items when search is empty (user can browse full list)
            if (!search) return 1;
            // Custom filter: search by symbol AND long_name
            const option = options.find((o) => o.symbol === value);
            if (!option) return 0;
            const searchLower = search.toLowerCase();
            const symbolMatch = option.symbol.toLowerCase().includes(searchLower);
            const longNameMatch = (option.long_name || "").toLowerCase().includes(searchLower);
            return symbolMatch || longNameMatch ? 1 : 0;
          }}
        >
          <CommandInput placeholder="Search by symbol or company name..." />
          <CommandList className="max-h-[300px]">
            <CommandEmpty>No ticker found.</CommandEmpty>
            <CommandGroup>
              {options.map((option) => {
                const validLongName = isValidLongName(option.long_name) ? option.long_name : null;
                const tooltipText = validLongName
                  ? `${option.symbol} - ${validLongName}`
                  : option.symbol;
                return (
                  <CommandItem
                    key={option.symbol}
                    value={option.symbol}
                    onSelect={(currentValue) => {
                      onValueChange(currentValue === value ? "" : currentValue);
                      setOpen(false);
                    }}
                    className="cursor-pointer"
                    title={tooltipText}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4 shrink-0",
                        value === option.symbol ? "opacity-100" : "opacity-0"
                      )}
                    />
                    <span className="truncate">
                      <span className="font-medium">{option.symbol}</span>
                      {validLongName && (
                        <span className="text-muted-foreground"> - {validLongName}</span>
                      )}
                    </span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
