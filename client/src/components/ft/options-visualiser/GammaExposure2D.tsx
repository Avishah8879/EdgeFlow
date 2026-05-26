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

  // Format time series for chart - use Date objects for proper Plotly time axis.
  // Straddle values may be null on bars where neither leg has printed yet
  // (typical of 09:15 IST). Pass null through so Plotly skips those points
  // — the line picks up at the first minute with real prints.
  const formattedTimeSeries = useMemo(() => {
    if (!timeSeriesData?.data) {
      return {
        times: [] as Date[],
        gxoiValues: [] as number[],
        straddleValues: [] as (number | null)[],
      };
    }

    const times = timeSeriesData.data.map((point) => new Date(point.timestamp));
    const gxoiValues = timeSeriesData.data.map((point) => point.atm_gxoi);
    const straddleValues = timeSeriesData.data.map((point) => point.atm_straddle);

    return { times, gxoiValues, straddleValues };
  }, [timeSeriesData]);

  // Anchor intraday axes to the full NSE session regardless of when data starts.
  // IST = UTC+5:30; adding 5h30m to UTC now gives the current IST date reliably
  // in any browser locale.
  const todayIst = new Date(Date.now() + (5 * 60 + 30) * 60 * 1000);
  const todayDate = todayIst.toISOString().slice(0, 10); // "YYYY-MM-DD"
  const sessionStart = new Date(`${todayDate}T09:16:00+05:30`);
  const sessionEnd = new Date(`${todayDate}T15:30:00+05:30`);

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
  const vegaValues = filteredExposure.map((item) => item.net_vega);

  // Force Plotly to redraw on every new fetch. react-plotly.js's diff
  // sometimes skips redraws on appended-only time series, leaving the chart
  // stale until the page is reloaded. Bumping `revision` makes Plotly.react()
  // commit the new traces regardless.
  const revision =
    (exposureData.timestamp ? Date.parse(exposureData.timestamp) : 0) +
    (timeSeriesData?.data?.length ?? 0);

  return (
    <div className="flex flex-col gap-2 p-2 overflow-auto">
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
      <div className="h-[1100px] rounded border border-border overflow-hidden">
        <Plot
          revision={revision}
          data={[
            // Trace 0: GxOI (Net CE - PE) - Row 1
            {
              type: 'scatter' as const,
              x: strikes,
              y: gxoiValues,
              fill: 'tozeroy',
              fillcolor: 'rgba(0, 229, 255, 0.15)',
              line: { color: '#00E5FF', width: 2 },
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
            // Trace 2: Raw Vega (CE - PE) - Row 3
            {
              type: 'scatter' as const,
              x: strikes,
              y: vegaValues,
              fill: 'tozeroy',
              fillcolor: 'rgba(147, 51, 234, 0.4)',
              line: { color: '#a855f7', width: 2 },
              name: 'Vega',
              xaxis: 'x3',
              yaxis: 'y3',
            },
            // Trace 3: ATM GxOI Time Series - Row 4
            {
              type: 'scatter' as const,
              x: formattedTimeSeries.times,
              y: formattedTimeSeries.gxoiValues,
              mode: 'lines+markers' as const,
              line: { color: '#00E5FF', width: 2 },
              marker: { color: '#00E5FF', size: 4 },
              hovertemplate: '%{x|%H:%M}  GxOI: %{y:.2f}<extra></extra>',
              name: 'ATM GxOI',
              xaxis: 'x4',
              yaxis: 'y4',
            },
            // Trace 4: ATM Straddle Time Series - Row 5
            {
              type: 'scatter' as const,
              x: formattedTimeSeries.times,
              y: formattedTimeSeries.straddleValues,
              mode: 'lines+markers' as const,
              line: { color: '#f59e0b', width: 2 },
              marker: { color: '#f59e0b', size: 4 },
              name: 'ATM Straddle',
              xaxis: 'x5',
              yaxis: 'y5',
            },
          ]}
          layout={{
            autosize: true,
            margin: { l: 60, r: 20, b: 40, t: 30 },
            paper_bgcolor: 'transparent',
            plot_bgcolor: 'transparent',
            font: { color: '#38bdf8', family: 'monospace', size: 10 },
            showlegend: false,

            // Grid layout: 5 rows
            grid: {
              rows: 5,
              columns: 1,
              pattern: 'independent' as const,
              roworder: 'top to bottom' as const,
            },

            // Row 1: GxOI
            xaxis: {
              domain: [0, 1],
              anchor: 'y',
              title: { text: 'Strike Price', font: { color: '#38bdf8', size: 10 } },
              tickfont: { color: '#38bdf8', size: 9 },
              gridcolor: 'rgba(128, 128, 128, 0.3)',
              zerolinecolor: 'rgba(128, 128, 128, 0.5)',
            },
            yaxis: {
              domain: [0.83, 1],
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
              domain: [0.63, 0.79],
              anchor: 'x2',
              title: { text: 'GEX (Rs)', font: { color: '#38bdf8', size: 10 } },
              tickfont: { color: '#38bdf8', size: 9 },
              gridcolor: 'rgba(128, 128, 128, 0.3)',
              zerolinecolor: 'rgba(128, 128, 128, 0.5)',
            },

            // Row 3: Vega
            xaxis3: {
              domain: [0, 1],
              anchor: 'y3',
              title: { text: 'Strike Price', font: { color: '#38bdf8', size: 10 } },
              tickfont: { color: '#38bdf8', size: 9 },
              gridcolor: 'rgba(128, 128, 128, 0.3)',
              zerolinecolor: 'rgba(128, 128, 128, 0.5)',
            },
            yaxis3: {
              domain: [0.43, 0.59],
              anchor: 'x3',
              title: { text: 'Vega (CE - PE)', font: { color: '#a855f7', size: 10 } },
              tickfont: { color: '#a855f7', size: 9 },
              gridcolor: 'rgba(128, 128, 128, 0.3)',
              zerolinecolor: 'rgba(128, 128, 128, 0.5)',
            },

            // Row 4: ATM GxOI Time Series
            xaxis4: {
              type: 'date',
              domain: [0, 1],
              anchor: 'y4',
              tickfont: { color: '#38bdf8', size: 9 },
              tickformat: '%H:%M',
              gridcolor: 'rgba(128, 128, 128, 0.3)',
              range: [sessionStart, sessionEnd],
            },
            yaxis4: {
              domain: [0.23, 0.39],
              anchor: 'x4',
              title: { text: 'ATM GxOI', font: { color: '#38bdf8', size: 10 } },
              tickfont: { color: '#38bdf8', size: 9 },
              gridcolor: 'rgba(128, 128, 128, 0.3)',
            },

            // Row 5: ATM Straddle Time Series
            xaxis5: {
              type: 'date',
              domain: [0, 1],
              anchor: 'y5',
              title: { text: 'Time (IST)', font: { color: '#38bdf8', size: 10 } },
              tickfont: { color: '#38bdf8', size: 9 },
              tickformat: '%H:%M',
              gridcolor: 'rgba(128, 128, 128, 0.3)',
              range: [sessionStart, sessionEnd],
            },
            yaxis5: {
              domain: [0, 0.19],
              anchor: 'x5',
              title: { text: 'ATM Straddle (Rs)', font: { color: '#f59e0b', size: 10 } },
              tickfont: { color: '#f59e0b', size: 9 },
              gridcolor: 'rgba(128, 128, 128, 0.3)',
            },

            // Vertical spot price lines on the three strike-axis rows
            shapes: [
              {
                type: 'line',
                xref: 'x',
                yref: 'paper',
                x0: spot,
                x1: spot,
                y0: 0.83,
                y1: 1,
                line: { color: 'yellow', dash: 'dot', width: 1 },
              },
              {
                type: 'line',
                xref: 'x2',
                yref: 'paper',
                x0: spot,
                x1: spot,
                y0: 0.63,
                y1: 0.79,
                line: { color: 'yellow', dash: 'dot', width: 1 },
              },
              {
                type: 'line',
                xref: 'x3',
                yref: 'paper',
                x0: spot,
                x1: spot,
                y0: 0.43,
                y1: 0.59,
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
                y: 0.81,
                yref: 'paper',
                xanchor: 'center',
              },
              {
                text: 'Vega',
                font: { color: '#a855f7', size: 11 },
                showarrow: false,
                x: 0.5,
                xref: 'paper',
                y: 0.61,
                yref: 'paper',
                xanchor: 'center',
              },
              {
                text: `GxOI_ATM (1-min, intraday)${timeSeriesData?.is_market_open ? ' ● LIVE' : ''}`,
                font: { color: timeSeriesData?.is_market_open ? '#22c55e' : '#38bdf8', size: 11 },
                showarrow: false,
                x: 0.5,
                xref: 'paper',
                y: 0.41,
                yref: 'paper',
                xanchor: 'center',
              },
              {
                text: `ATM Straddle (1-min, intraday)${timeSeriesData?.is_market_open ? ' ● LIVE' : ''}`,
                font: { color: timeSeriesData?.is_market_open ? '#22c55e' : '#f59e0b', size: 11 },
                showarrow: false,
                x: 0.5,
                xref: 'paper',
                y: 0.21,
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
