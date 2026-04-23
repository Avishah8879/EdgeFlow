import { useEffect, useRef, useState, useMemo } from 'react';
import {
  createChart,
  CandlestickSeries,
  CrosshairMode,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
  type Time,
} from 'lightweight-charts';
import { usePriceChart } from '@/hooks/use-price-chart';
import { Badge } from '@/components/ui/badge';
import { PatternShape } from './PatternShape';

export interface PatternKeyPoint {
  ts: string; // YYYY-MM-DD
  price: number;
  label: string;
}

export interface PatternChartInput {
  symbol: string;
  companyName: string;
  patternType: string;
  confidence: number;
  startDate: string;
  endDate: string;
  breakoutDirection: 'bullish' | 'bearish' | 'neutral';
  description: string;
  keyPoints?: PatternKeyPoint[];
}

interface Props {
  pattern: PatternChartInput;
  height?: number;
}

function dateStringToUtc(d: string): UTCTimestamp {
  return (new Date(`${d}T00:00:00Z`).getTime() / 1000) as UTCTimestamp;
}

function breakoutColor(dir: PatternChartInput['breakoutDirection']): string {
  switch (dir) {
    case 'bullish':
      return '#22c55e';
    case 'bearish':
      return '#ef4444';
    default:
      return '#eab308';
  }
}

export function PatternChartExpansion({ pattern, height = 380 }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const [overlay, setOverlay] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [shapePoints, setShapePoints] = useState<Array<{ x: number; y: number; label: string }> | null>(null);
  const [containerSize, setContainerSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });

  const { data, isLoading, error } = usePriceChart({
    ticker: pattern.symbol,
    timeframe: '1day',
    months: 6,
  });

  const startTs = dateStringToUtc(pattern.startDate);
  const endTs = dateStringToUtc(pattern.endDate);

  const patternRange = useMemo(() => {
    if (!data?.price_data) return null;
    let hi = -Infinity;
    let lo = Infinity;
    for (const p of data.price_data) {
      if (p.time >= startTs && p.time <= endTs) {
        if (p.high > hi) hi = p.high;
        if (p.low < lo) lo = p.low;
      }
    }
    if (!isFinite(hi) || !isFinite(lo)) return null;
    const pad = (hi - lo) * 0.08;
    return { hi: hi + pad, lo: lo - pad };
  }, [data, startTs, endTs]);

  const hasKeyPoints = (pattern.keyPoints?.length ?? 0) > 0;

  const color = breakoutColor(pattern.breakoutDirection);

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { color: 'transparent' },
        textColor: '#9ca3af',
      },
      grid: {
        vertLines: { color: '#374151' },
        horzLines: { color: '#374151' },
      },
      rightPriceScale: { borderColor: '#4b5563' },
      timeScale: { borderColor: '#4b5563', timeVisible: false, secondsVisible: false },
      crosshair: { mode: CrosshairMode.Normal },
      height,
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderVisible: false,
      wickUpColor: '#22c55e',
      wickDownColor: '#ef4444',
    });

    chartRef.current = chart;
    seriesRef.current = series;

    const resizeObserver = new ResizeObserver(() => {
      if (containerRef.current) {
        chart.applyOptions({ width: containerRef.current.clientWidth });
      }
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [height]);

  useEffect(() => {
    const series = seriesRef.current;
    const chart = chartRef.current;
    if (!data?.price_data || !series || !chart) return;
    series.setData(
      data.price_data.map((p) => ({
        time: p.time as UTCTimestamp,
        open: p.open,
        high: p.high,
        low: p.low,
        close: p.close,
      })),
    );
    chart.timeScale().fitContent();
  }, [data]);

  useEffect(() => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!chart || !series) return;

    const update = () => {
      if (containerRef.current) {
        setContainerSize({
          w: containerRef.current.clientWidth,
          h: containerRef.current.clientHeight,
        });
      }

      const ts = chart.timeScale();

      // Rectangle overlay (fallback / backdrop) — only when we have a valid range
      if (patternRange) {
        const x1 = ts.timeToCoordinate(startTs as Time);
        const x2 = ts.timeToCoordinate(endTs as Time);
        const y1 = series.priceToCoordinate(patternRange.hi);
        const y2 = series.priceToCoordinate(patternRange.lo);
        if (x1 != null && x2 != null && y1 != null && y2 != null) {
          setOverlay({
            x: Math.min(x1, x2),
            y: Math.min(y1, y2),
            w: Math.max(2, Math.abs(x2 - x1)),
            h: Math.max(2, Math.abs(y2 - y1)),
          });
        } else {
          setOverlay(null);
        }
      } else {
        setOverlay(null);
      }

      // Shape key-points → pixel coords
      if (pattern.keyPoints && pattern.keyPoints.length > 0) {
        const mapped: Array<{ x: number; y: number; label: string }> = [];
        for (const kp of pattern.keyPoints) {
          const tsec = dateStringToUtc(kp.ts);
          const x = ts.timeToCoordinate(tsec as Time);
          const y = series.priceToCoordinate(kp.price);
          if (x == null || y == null) {
            setShapePoints(null);
            return;
          }
          mapped.push({ x, y, label: kp.label });
        }
        setShapePoints(mapped);
      } else {
        setShapePoints(null);
      }
    };

    update();

    const ts = chart.timeScale();
    ts.subscribeVisibleTimeRangeChange(update);
    const crosshairHandler = () => update();
    chart.subscribeCrosshairMove(crosshairHandler);

    const resizeObserver = new ResizeObserver(update);
    if (containerRef.current) resizeObserver.observe(containerRef.current);

    return () => {
      ts.unsubscribeVisibleTimeRangeChange(update);
      chart.unsubscribeCrosshairMove(crosshairHandler);
      resizeObserver.disconnect();
    };
  }, [patternRange, startTs, endTs, data, pattern.keyPoints]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span className="font-mono font-bold text-sm">{pattern.symbol}</span>
          <span className="text-xs text-muted-foreground">{pattern.companyName}</span>
        </div>
        <div className="flex gap-1.5">
          <Badge
            variant="outline"
            className="text-[10px] font-medium"
            style={{ color, borderColor: color }}
          >
            {pattern.patternType}
          </Badge>
          <Badge variant="outline" className="text-[10px] font-mono">
            {pattern.startDate} → {pattern.endDate}
          </Badge>
          <Badge variant="outline" className="text-[10px] font-mono">
            {pattern.confidence}% confidence
          </Badge>
        </div>
      </div>

      <div className="relative w-full rounded border border-border bg-background" style={{ height }}>
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-sm">
            Loading chart…
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center text-destructive text-sm">
            Failed to load chart data for {pattern.symbol}
          </div>
        )}
        <div ref={containerRef} className="w-full h-full" />
        {!isLoading && !error && overlay && !hasKeyPoints && (
          <>
            <div
              className="absolute pointer-events-none rounded-sm"
              style={{
                left: overlay.x,
                top: overlay.y,
                width: overlay.w,
                height: overlay.h,
                backgroundColor: `${color}22`,
                border: `1px dashed ${color}`,
              }}
            />
            <div
              className="absolute pointer-events-none rounded px-2 py-0.5 text-[10px] font-medium whitespace-nowrap"
              style={{
                left: overlay.x,
                top: Math.max(4, overlay.y - 20),
                backgroundColor: '#1f2937',
                color,
                border: `1px solid ${color}`,
              }}
            >
              {pattern.patternType} · {pattern.confidence}%
            </div>
          </>
        )}
        {!isLoading && !error && shapePoints && hasKeyPoints && containerSize.w > 0 && (
          <PatternShape
            patternType={pattern.patternType}
            points={shapePoints}
            color={color}
            containerWidth={containerSize.w}
            containerHeight={containerSize.h}
            confidence={pattern.confidence}
          />
        )}
      </div>

      <p className="text-xs text-muted-foreground">{pattern.description}</p>
    </div>
  );
}
