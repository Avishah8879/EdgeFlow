import { useMemo, useState } from "react";
import Plot from "@/components/ft/PlotlyChart";
import type { SurfaceData } from "@/hooks/useOptionsVisualizerData";

interface VolatilitySurface3DProps {
  surfaceData: SurfaceData | undefined;
  isLoading: boolean;
  surfaceType: "iv" | "gxoi";
  onSurfaceTypeChange: (type: "iv" | "gxoi") => void;
}

export function VolatilitySurface3D({
  surfaceData,
  isLoading,
  surfaceType,
  onSurfaceTypeChange,
}: VolatilitySurface3DProps) {
  const [timeRange, setTimeRange] = useState<[number, number]>([0, 100]);

  // Build surface data for Plotly
  const plotData = useMemo(() => {
    if (!surfaceData) return null;

    const { strikes, spot, history } = surfaceData;

    // If we have history, build a 3D surface over time
    if (history && history.length >= 2) {
      // Filter by time range
      const startIdx = Math.floor((timeRange[0] / 100) * history.length);
      const endIdx = Math.ceil((timeRange[1] / 100) * history.length);
      let filteredHistory = history.slice(startIdx, endIdx);

      // Filter out invalid snapshots (empty strikes or values)
      filteredHistory = filteredHistory.filter((h) => {
        const hasStrikes = h.strikes && h.strikes.length > 0;
        const hasIV = h.iv_values && h.iv_values.length > 0;
        const hasGxOI = h.gxoi_values && h.gxoi_values.length > 0;
        // Must have strikes and at least one value array
        return hasStrikes && (hasIV || hasGxOI);
      });

      if (filteredHistory.length < 2) {
        return buildSingleSliceSurface(surfaceData, spot, surfaceType);
      }

      // Build Z matrix (time x strikes)
      const allStrikes = filteredHistory[0].strikes;
      const times = filteredHistory.map((h) =>
        new Date(h.timestamp).toLocaleTimeString("en-IN", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        })
      );

      // Use correct values based on surface type
      const zMatrix = filteredHistory.map((snapshot) =>
        surfaceType === "iv"
          ? snapshot.iv_values
          : snapshot.gxoi_values || snapshot.iv_values
      );

      // Build spot path - interpolate Z value at spot price position
      // Y-axis uses numeric indices internally (strings are just labels)
      const spotPath = filteredHistory.map((h, idx) => {
        const strikeList = h.strikes;
        const zValues =
          surfaceType === "iv" ? h.iv_values : h.gxoi_values || h.iv_values;

        // Find the Z value at spot price by linear interpolation
        const spotPrice = h.spot;
        let zAtSpot = 0;

        // Find the two strikes that bracket the spot price
        for (let i = 0; i < strikeList.length - 1; i++) {
          if (strikeList[i] <= spotPrice && spotPrice <= strikeList[i + 1]) {
            // Linear interpolation
            const t =
              (spotPrice - strikeList[i]) / (strikeList[i + 1] - strikeList[i]);
            zAtSpot = zValues[i] + t * (zValues[i + 1] - zValues[i]);
            break;
          }
        }

        // Use numeric index for Y (Plotly uses indices internally, strings are tick labels)
        // Lift Z slightly above surface for visibility (* 1.02)
        return {
          x: spotPrice,
          y: idx,
          z: zAtSpot * 1.02,
        };
      });

      // Use numeric indices for Y-axis (like notebook), with tick labels set separately
      const yIndices = filteredHistory.map((_, idx) => idx);

      // Build tick labels for Y-axis (show every ~10th label to avoid clutter)
      const tickStep = Math.max(1, Math.floor(filteredHistory.length / 10));
      const tickVals = yIndices.filter((_, i) => i % tickStep === 0);
      const tickText = tickVals.map((i) => times[i]);

      return {
        surfaceTrace: {
          type: "surface" as const,
          x: allStrikes,
          y: yIndices, // Numeric indices, not strings
          z: zMatrix,
          colorscale: "Turbo",
          opacity: 0.85,
          showscale: true,
          colorbar: {
            title: {
              text: surfaceType === "iv" ? "IV (%)" : "GxOI",
              side: "right" as const,
            },
            tickfont: { color: "#38bdf8", size: 10 },
          },
          lighting: {
            ambient: 0.5,
            diffuse: 0.7,
            specular: 0.3,
          },
        },
        spotPathTrace:
          spotPath.length > 1
            ? {
                type: "scatter3d" as const,
                x: spotPath.map((p) => p.x),
                y: spotPath.map((p) => p.y),
                z: spotPath.map((p) => p.z),
                mode: "lines" as const,
                line: { color: "white", width: 6 },
                marker: { color: "white" },
                name: "Spot Path",
              }
            : null,
        xTitle: "Strike",
        yTitle: "Time",
        zTitle: surfaceType === "iv" ? "IV (%)" : "GxOI",
        yTickVals: tickVals,
        yTickText: tickText,
      };
    }

    // Single time slice - create a pseudo-3D view
    return buildSingleSliceSurface(surfaceData, spot, surfaceType);
  }, [surfaceData, surfaceType, timeRange]);

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-muted-foreground font-mono text-sm animate-pulse">
          LOADING SURFACE DATA...
        </div>
      </div>
    );
  }

  if (!surfaceData || !plotData) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-muted-foreground font-mono text-sm">
          NO SURFACE DATA AVAILABLE
        </div>
      </div>
    );
  }

  const traces = [plotData.surfaceTrace];
  if (plotData.spotPathTrace) {
    traces.push(plotData.spotPathTrace as any);
  }

  return (
    <div className="h-full flex flex-col gap-2 p-2">
      {/* Controls */}
      <div className="flex items-center justify-between px-2 py-1 bg-sidebar rounded border border-border">
        <div className="flex gap-2">
          <button
            onClick={() => onSurfaceTypeChange("iv")}
            className={`px-3 py-1 text-[10px] font-mono uppercase rounded transition-colors ${
              surfaceType === "iv"
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            IV SURFACE
          </button>
          <button
            onClick={() => onSurfaceTypeChange("gxoi")}
            className={`px-3 py-1 text-[10px] font-mono uppercase rounded transition-colors ${
              surfaceType === "gxoi"
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            GxOI SURFACE
          </button>
        </div>

        <div className="flex items-center gap-2 text-[10px] font-mono">
          <span className="text-muted-foreground">
            SPOT:{" "}
            <span className="text-foreground">
              {surfaceData.spot?.toFixed(2)}
            </span>
          </span>
          <span className="text-muted-foreground">
            EXPIRY:{" "}
            <span className="text-foreground">
              {surfaceData.expiry || "N/A"}
            </span>
          </span>
        </div>
      </div>

      {/* Time range slider (only show if we have history) */}
      {surfaceData.history && surfaceData.history.length > 2 && (
        <div className="flex items-center gap-4 px-2 py-1 bg-sidebar rounded border border-border">
          <span className="text-[10px] font-mono text-muted-foreground uppercase">
            TIME RANGE:
          </span>
          <input
            type="range"
            min={0}
            max={100}
            value={timeRange[0]}
            onChange={(e) =>
              setTimeRange([parseInt(e.target.value), timeRange[1]])
            }
            className="w-24 h-1 accent-primary"
          />
          <span className="text-[10px] font-mono text-foreground">
            {Math.floor((timeRange[0] / 100) * surfaceData.history.length)} -{" "}
            {Math.ceil((timeRange[1] / 100) * surfaceData.history.length)}
          </span>
          <input
            type="range"
            min={0}
            max={100}
            value={timeRange[1]}
            onChange={(e) =>
              setTimeRange([timeRange[0], parseInt(e.target.value)])
            }
            className="w-24 h-1 accent-primary"
          />
        </div>
      )}

      {/* 3D Plot */}
      <div className="flex-1 min-h-[500px] rounded border border-border overflow-hidden">
        <Plot
          data={traces}
          layout={{
            autosize: true,
            margin: { l: 0, r: 0, b: 0, t: 30 },
            paper_bgcolor: "transparent",
            plot_bgcolor: "transparent",
            font: { color: "#38bdf8", family: "monospace", size: 10 },
            title: {
              text:
                surfaceType === "iv"
                  ? "3D Implied Volatility Surface"
                  : "3D GxOI Surface",
              font: { size: 12, color: "#38bdf8" },
            },
            scene: {
              bgcolor: "transparent",
              xaxis: {
                title: {
                  text: plotData.xTitle,
                  font: { color: "#38bdf8", size: 10 },
                },
                tickfont: { color: "#38bdf8", size: 9 },
                gridcolor: "rgba(34,31,32,0.1)",
                showbackground: false,
              },
              yaxis: {
                title: {
                  text: plotData.yTitle,
                  font: { color: "#38bdf8", size: 10 },
                },
                tickfont: { color: "#38bdf8", size: 9 },
                gridcolor: "rgba(34,31,32,0.1)",
                showbackground: false,
                tickvals: plotData.yTickVals,
                ticktext: plotData.yTickText,
              },
              zaxis: {
                title: {
                  text: plotData.zTitle,
                  font: { color: "#38bdf8", size: 10 },
                },
                tickfont: { color: "#38bdf8", size: 9 },
                gridcolor: "rgba(34,31,32,0.1)",
                showbackground: false,
              },
              camera: {
                eye: { x: 1.5, y: 1.5, z: 1.2 },
              },
            },
            showlegend: false,
          }}
          config={{
            displayModeBar: true,
            displaylogo: false,
            modeBarButtonsToRemove: ["toImage", "sendDataToCloud"],
            responsive: true,
          }}
          style={{ width: "100%", height: "100%" }}
          useResizeHandler
        />
      </div>
    </div>
  );
}

// Helper to build surface from single time slice
function buildSingleSliceSurface(
  data: SurfaceData,
  spot: number,
  surfaceType: "iv" | "gxoi"
) {
  const { strikes, iv_values, gxoi_values, moneyness } = data;

  // Use moneyness for X axis if available, otherwise strikes
  const xValues = moneyness && moneyness.length > 0 ? moneyness : strikes;
  const zValues = surfaceType === "iv" ? iv_values : gxoi_values;

  if (!zValues || zValues.length === 0) {
    return null;
  }

  // Create a pseudo-3D by duplicating the slice
  const yValues = ["Current"];
  const zMatrix = [zValues];

  return {
    surfaceTrace: {
      type: "surface" as const,
      x: xValues,
      y: yValues,
      z: zMatrix,
      colorscale: "Turbo",
      opacity: 0.85,
      showscale: true,
      colorbar: {
        title: {
          text: surfaceType === "iv" ? "IV (%)" : "GxOI",
          side: "right" as const,
        },
        tickfont: { color: "#38bdf8", size: 10 },
      },
    },
    spotPathTrace: null,
    xTitle: moneyness && moneyness.length > 0 ? "Moneyness (K/S)" : "Strike",
    yTitle: "Time",
    zTitle: surfaceType === "iv" ? "IV (%)" : "GxOI",
    yTickVals: undefined,
    yTickText: undefined,
  };
}
