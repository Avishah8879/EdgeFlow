import { useMemo } from 'react';
import Plot from '@/components/ft/PlotlyChart';
import type { ExposureData, TimeSeriesData } from '@/hooks/useOptionsVisualizerData';

interface GammaExposure2DProps {
  exposureData: ExposureData | undefined;
  timeSeriesData: TimeSeriesData | undefined;
  isLoading: boolean;
}

export function GammaExposure2D({ exposureData, timeSeriesData, isLoading }: GammaExposure2DProps) {
  // Filter strikes within ±10% of spot for cleaner visualization
  const filteredExposure = useMemo(() => {
    if (!exposureData?.by_strike || !exposureData.spot) return [];

    const spot = exposureData.spot;
    const lowerBound = spot * 0.9;
    const upperBound = spot * 1.1;

    return exposureData.by_strike.filter(
      (item) => item.strike >= lowerBound && item.strike <= upperBound
    );
  }, [exposureData]);

  // Format time series for chart - use Date objects for proper Plotly time axis
  const formattedTimeSeries = useMemo(() => {
    if (!timeSeriesData?.data) return { times: [] as Date[], values: [] as number[] };

    const times = timeSeriesData.data.map((point) => new Date(point.timestamp));
    const values = timeSeriesData.data.map((point) => point.atm_gxoi);

    return { times, values };
  }, [timeSeriesData]);

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-muted-foreground font-mono text-sm animate-pulse">
          LOADING GAMMA DATA...
        </div>
      </div>
    );
  }

  if (!exposureData || filteredExposure.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-muted-foreground font-mono text-sm">
          NO EXPOSURE DATA AVAILABLE
        </div>
      </div>
    );
  }

  const { spot, atm_strike, total_gex, gamma_regime } = exposureData;

  // Prepare data for Plotly
  const strikes = filteredExposure.map((item) => item.strike);
  const gxoiValues = filteredExposure.map((item) => item.net_gxoi);
  const gexValues = filteredExposure.map((item) => item.net_gex);
  const vxoiValues = filteredExposure.map((item) => item.net_vxoi);
  const vexValues = filteredExposure.map((item) => item.net_vex);

  return (
    <div className="h-full flex flex-col gap-2 p-2 overflow-hidden">
      {/* Header with key metrics */}
      <div className="flex items-center justify-between px-2 py-1 bg-sidebar rounded border border-border">
        <div className="flex gap-4 text-[10px] font-mono uppercase">
          <span className="text-muted-foreground">
            SPOT: <span className="text-foreground">{spot?.toFixed(2)}</span>
          </span>
          <span className="text-muted-foreground">
            ATM: <span className="text-foreground">{atm_strike}</span>
          </span>
          <span className="text-muted-foreground">
            TOTAL GEX:{' '}
            <span className={total_gex >= 0 ? 'text-primary' : 'text-destructive'}>
              {(total_gex / 1e9).toFixed(2)}B
            </span>
          </span>
        </div>
        <div
          className={`text-[10px] font-mono px-2 py-0.5 rounded ${
            gamma_regime === 'LONG GAMMA'
              ? 'bg-primary/20 text-primary'
              : 'bg-destructive/20 text-destructive'
          }`}
        >
          {gamma_regime}
        </div>
      </div>

      {/* Plotly Charts */}
      <div className="flex-1 min-h-[700px] rounded border border-border overflow-hidden">
        <Plot
          data={[
            // Trace 0: GxOI (Net CE - PE) - Row 1
            {
              type: 'scatter' as const,
              x: strikes,
              y: gxoiValues,
              fill: 'tozeroy',
              fillcolor: 'rgba(0, 255, 255, 0.4)',
              line: { color: 'cyan', width: 2 },
              name: 'GxOI',
              xaxis: 'x',
              yaxis: 'y',
            },
            // Trace 1: GEX (SqueezeMetrics) - Row 2
            {
              type: 'scatter' as const,
              x: strikes,
              y: gexValues,
              fill: 'tozeroy',
              fillcolor: 'rgba(255, 165, 0, 0.4)',
              line: { color: 'orange', width: 2 },
              name: 'GEX',
              xaxis: 'x2',
              yaxis: 'y2',
            },
            // Trace 2: VxOI (Vega Exposure) - Row 3
            {
              type: 'scatter' as const,
              x: strikes,
              y: vxoiValues,
              fill: 'tozeroy',
              fillcolor: 'rgba(147, 51, 234, 0.4)',
              line: { color: '#a855f7', width: 2 },
              name: 'VxOI',
              xaxis: 'x3',
              yaxis: 'y3',
            },
            // Trace 3: ATM GxOI Time Series - Row 4
            {
              type: 'scatter' as const,
              x: formattedTimeSeries.times,
              y: formattedTimeSeries.values,
              mode: 'lines+markers' as const,
              line: { color: 'white', width: 2 },
              marker: { color: 'white', size: 4 },
              name: 'ATM GxOI',
              xaxis: 'x4',
              yaxis: 'y4',
            },
          ]}
          layout={{
            autosize: true,
            margin: { l: 60, r: 20, b: 40, t: 30 },
            paper_bgcolor: 'transparent',
            plot_bgcolor: 'transparent',
            font: { color: '#38bdf8', family: 'monospace', size: 10 },
            showlegend: false,

            // Grid layout: 4 rows
            grid: {
              rows: 4,
              columns: 1,
              pattern: 'independent' as const,
              roworder: 'top to bottom' as const,
            },

            // Row 1: GxOI (top 25%)
            xaxis: {
              domain: [0, 1],
              anchor: 'y',
              title: { text: 'Strike Price', font: { color: '#38bdf8', size: 10 } },
              tickfont: { color: '#38bdf8', size: 9 },
              gridcolor: 'rgba(128, 128, 128, 0.3)',
              zerolinecolor: 'rgba(128, 128, 128, 0.5)',
            },
            yaxis: {
              domain: [0.78, 1],
              anchor: 'x',
              title: { text: 'GxOI (Net CE - PE)', font: { color: '#38bdf8', size: 10 } },
              tickfont: { color: '#38bdf8', size: 9 },
              gridcolor: 'rgba(128, 128, 128, 0.3)',
              zerolinecolor: 'rgba(128, 128, 128, 0.5)',
            },

            // Row 2: GEX
            xaxis2: {
              domain: [0, 1],
              anchor: 'y2',
              title: { text: 'Strike Price', font: { color: '#38bdf8', size: 10 } },
              tickfont: { color: '#38bdf8', size: 9 },
              gridcolor: 'rgba(128, 128, 128, 0.3)',
              zerolinecolor: 'rgba(128, 128, 128, 0.5)',
            },
            yaxis2: {
              domain: [0.53, 0.74],
              anchor: 'x2',
              title: { text: 'GEX (Rs)', font: { color: '#38bdf8', size: 10 } },
              tickfont: { color: '#38bdf8', size: 9 },
              gridcolor: 'rgba(128, 128, 128, 0.3)',
              zerolinecolor: 'rgba(128, 128, 128, 0.5)',
            },

            // Row 3: VxOI (Vega Exposure)
            xaxis3: {
              domain: [0, 1],
              anchor: 'y3',
              title: { text: 'Strike Price', font: { color: '#38bdf8', size: 10 } },
              tickfont: { color: '#38bdf8', size: 9 },
              gridcolor: 'rgba(128, 128, 128, 0.3)',
              zerolinecolor: 'rgba(128, 128, 128, 0.5)',
            },
            yaxis3: {
              domain: [0.28, 0.49],
              anchor: 'x3',
              title: { text: 'VxOI (Net CE - PE)', font: { color: '#a855f7', size: 10 } },
              tickfont: { color: '#a855f7', size: 9 },
              gridcolor: 'rgba(128, 128, 128, 0.3)',
              zerolinecolor: 'rgba(128, 128, 128, 0.5)',
            },

            // Row 4: Time Series
            xaxis4: {
              type: 'date',
              domain: [0, 1],
              anchor: 'y4',
              title: { text: 'Time', font: { color: '#38bdf8', size: 10 } },
              tickfont: { color: '#38bdf8', size: 9 },
              tickformat: '%H:%M\n%b %d',
              gridcolor: 'rgba(128, 128, 128, 0.3)',
            },
            yaxis4: {
              domain: [0, 0.22],
              anchor: 'x4',
              title: { text: 'ATM GxOI', font: { color: '#38bdf8', size: 10 } },
              tickfont: { color: '#38bdf8', size: 9 },
              gridcolor: 'rgba(128, 128, 128, 0.3)',
            },

            // Vertical spot price lines on charts 1, 2, and 3
            shapes: [
              {
                type: 'line',
                xref: 'x',
                yref: 'paper',
                x0: spot,
                x1: spot,
                y0: 0.78,
                y1: 1,
                line: { color: 'yellow', dash: 'dot', width: 1 },
              },
              {
                type: 'line',
                xref: 'x2',
                yref: 'paper',
                x0: spot,
                x1: spot,
                y0: 0.53,
                y1: 0.74,
                line: { color: 'yellow', dash: 'dot', width: 1 },
              },
              {
                type: 'line',
                xref: 'x3',
                yref: 'paper',
                x0: spot,
                x1: spot,
                y0: 0.28,
                y1: 0.49,
                line: { color: 'yellow', dash: 'dot', width: 1 },
              },
            ],

            // Annotations for subplot titles
            annotations: [
              {
                text: 'GxOI (Net CE - PE)',
                font: { color: '#38bdf8', size: 11 },
                showarrow: false,
                x: 0.5,
                xref: 'paper',
                y: 1.02,
                yref: 'paper',
                xanchor: 'center',
              },
              {
                text: 'SqueezeMetrics GEX',
                font: { color: '#38bdf8', size: 11 },
                showarrow: false,
                x: 0.5,
                xref: 'paper',
                y: 0.76,
                yref: 'paper',
                xanchor: 'center',
              },
              {
                text: 'Vega Exposure (VxOI)',
                font: { color: '#a855f7', size: 11 },
                showarrow: false,
                x: 0.5,
                xref: 'paper',
                y: 0.51,
                yref: 'paper',
                xanchor: 'center',
              },
              {
                text: `GxOI_ATM (Time Series)${timeSeriesData?.is_market_open ? ' ● LIVE' : ''}`,
                font: { color: timeSeriesData?.is_market_open ? '#22c55e' : '#38bdf8', size: 11 },
                showarrow: false,
                x: 0.5,
                xref: 'paper',
                y: 0.24,
                yref: 'paper',
                xanchor: 'center',
              },
            ],
          }}
          config={{
            displayModeBar: true,
            displaylogo: false,
            modeBarButtonsToRemove: ['toImage', 'sendDataToCloud'],
            responsive: true,
          }}
          style={{ width: '100%', height: '100%' }}
          useResizeHandler
        />
      </div>
    </div>
  );
}
