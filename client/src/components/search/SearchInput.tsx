import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { forwardRef } from "react";

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  onClear: () => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
}

export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(
  ({ value, onChange, onClear, onKeyDown, placeholder = "Search for stocks", className, autoFocus = true }, ref) => {
    return (
      <div className={cn("flex items-center gap-2 px-4 py-3 border-b", className)}>
        <Search className="h-4 w-4 text-muted-foreground shrink-0" />
        <input
          ref={ref}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          autoFocus={autoFocus}
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
        {value && (
          <button
            onClick={onClear}
            className="p-1 hover:bg-muted rounded-sm transition-colors"
            aria-label="Clear search"
          >
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        )}
      </div>
    );
  }
);

SearchInput.displayName = "SearchInput";
