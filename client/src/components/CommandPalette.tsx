import { useEffect, useState, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { SearchBar } from "@/components/search";

export function CommandPalette() {
  const [open, setOpen] = useState(false);

  // Keyboard shortcut handler (Ctrl+K / Cmd+K)
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const handleClose = useCallback(() => {
    setOpen(false);
  }, []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="p-0 gap-0 max-w-md overflow-hidden">
        <DialogTitle className="sr-only">Search stocks</DialogTitle>
        <SearchBar onClose={handleClose} />
      </DialogContent>
    </Dialog>
  );
}
