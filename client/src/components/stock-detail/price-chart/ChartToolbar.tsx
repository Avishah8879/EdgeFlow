import { Button } from "@/components/ui/button";
import { Maximize2, Minimize2, Camera } from "lucide-react";

interface ChartToolbarProps {
  isFullscreen: boolean;
  onFullscreenToggle: () => void;
  onScreenshot: () => void;
}

export function ChartToolbar({
  isFullscreen,
  onFullscreenToggle,
  onScreenshot,
}: ChartToolbarProps) {
  return (
    <div className="flex items-center gap-1">
      {/* Screenshot button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={onScreenshot}
        className="h-8 px-2"
        title="Download chart as PNG"
      >
        <Camera className="w-4 h-4" />
      </Button>

      {/* Fullscreen toggle */}
      <Button
        variant="ghost"
        size="sm"
        onClick={onFullscreenToggle}
        className="h-8 px-2"
        title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
      >
        {isFullscreen ? (
          <Minimize2 className="w-4 h-4" />
        ) : (
          <Maximize2 className="w-4 h-4" />
        )}
      </Button>
    </div>
  );
}
