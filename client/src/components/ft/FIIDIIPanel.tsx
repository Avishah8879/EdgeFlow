import { useMemo } from 'react';
import { useTheme } from 'next-themes';
import { TrendingUp, TrendingDown, RefreshCw, Loader2, AlertCircle } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { useQuery } from '@tanstack/react-query';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { getCSSColor } from '@/lib/theme-utils';

interface FIIDIIData {
  date: string;
  fiiNetBuySell: number;
  diiNetBuySell: number;
  fiiGrossBuy: number;
  fiiGrossSell: number;
  diiGrossBuy: number;
  diiGrossSell: number;
}

export function FIIDIIPanel() {
  const { data, isLoading, isError, refetch } = useQuery<FIIDIIData[]>({
    queryKey: ['/api/fii-dii'],
    staleTime: 3600000, // 1 hour
  });
  const rows = useMemo(() => (Array.isArray(data) ? data : []), [data]);
  const hasInvalidPayload = !!data && !Array.isArray(data);

  // Theme-aware chart chrome — re-resolves on light/dark switch
  const { resolvedTheme } = useTheme();
  const chartColors = useMemo(
    () => ({
      grid:          getCSSColor('--border'),
      axis:          getCSSColor('--muted-foreground'),
      tooltipBg:     getCSSColor('--card'),
      tooltipBorder: getCSSColor('--border'),
      tooltipText:   getCSSColor('--foreground'),
      fii:           getCSSColor('--primary'),
      dii:           getCSSColor('--positive'),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [resolvedTheme],
  );

  const formatCurrency = (value: number): string => {
    const absValue = Math.abs(value);
    if (absValue >= 1000) return `₹${(value / 1000).toFixed(1)}K Cr`;
    return `₹${value.toFixed(0)} Cr`;
  };

  const formatDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
    } catch {
      return dateStr;
    }
  };

  const latestData = rows.length > 0 ? rows[rows.length - 1] : null;
  const chartData = rows.slice(-30).map(d => ({
    date: formatDate(d.date),
    FII: d.fiiNetBuySell,
    DII: d.diiNetBuySell,
  }));

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full bg-background">
        <Loader2 className="w-6 h-6 animate-spin text-primary" data-testid="loading-spinner-fii-dii" />
      </div>
    );
  }

  if (isError || hasInvalidPayload) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 bg-background">
        <AlertCircle className="w-8 h-8 text-destructive" data-testid="error-icon-fii-dii" />
        <p className="text-sm text-muted-foreground" data-testid="text-error-message">Failed to load FII/DII data</p>
        <Button 
          onClick={() => refetch()} 
          size="sm"
          data-testid="button-retry-fii-dii"
        >
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="flex items-center justify-between p-3 border-b border-border">
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">FII/DII Activity</span>
          <span className="text-[10px] text-muted-foreground" data-testid="text-last-update">
            Last 30 Days
          </span>
        </div>
        <Button
          size="icon"
          variant="ghost"
          className="h-6 w-6"
          onClick={() => refetch()}
          data-testid="button-refresh-fii-dii"
        >
          <RefreshCw className="h-3 w-3" />
        </Button>
      </div>

      {latestData && (
        <div className="grid grid-cols-2 gap-3 p-3 border-b border-border">
          <div className="space-y-1">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">FII Net</div>
            <div className={`flex items-center gap-1 ${latestData.fiiNetBuySell >= 0 ? 'text-positive' : 'text-negative'}`}>
              {latestData.fiiNetBuySell >= 0 ? (
                <TrendingUp className="h-4 w-4" />
              ) : (
                <TrendingDown className="h-4 w-4" />
              )}
              <span className="font-mono text-lg" data-testid="text-fii-net">
                {formatCurrency(latestData.fiiNetBuySell)}
              </span>
            </div>
            <div className="text-[9px] text-muted-foreground">
              Buy: {formatCurrency(latestData.fiiGrossBuy)} | Sell: {formatCurrency(latestData.fiiGrossSell)}
            </div>
          </div>
          <div className="space-y-1">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">DII Net</div>
            <div className={`flex items-center gap-1 ${latestData.diiNetBuySell >= 0 ? 'text-positive' : 'text-negative'}`}>
              {latestData.diiNetBuySell >= 0 ? (
                <TrendingUp className="h-4 w-4" />
              ) : (
                <TrendingDown className="h-4 w-4" />
              )}
              <span className="font-mono text-lg" data-testid="text-dii-net">
                {formatCurrency(latestData.diiNetBuySell)}
              </span>
            </div>
            <div className="text-[9px] text-muted-foreground">
              Buy: {formatCurrency(latestData.diiGrossBuy)} | Sell: {formatCurrency(latestData.diiGrossSell)}
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 p-3">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
            <XAxis
              dataKey="date"
              stroke={chartColors.axis}
              style={{ fontSize: '10px', fontFamily: 'monospace' }}
              tick={{ fill: chartColors.axis }}
            />
            <YAxis
              stroke={chartColors.axis}
              style={{ fontSize: '10px', fontFamily: 'monospace' }}
              tick={{ fill: chartColors.axis }}
              tickFormatter={(value) => `${(value / 1000).toFixed(0)}K`}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: chartColors.tooltipBg,
                border: `1px solid ${chartColors.tooltipBorder}`,
                borderRadius: '4px',
                fontSize: '11px',
                fontFamily: 'monospace',
              }}
              labelStyle={{ color: chartColors.axis }}
              itemStyle={{ color: chartColors.tooltipText }}
              formatter={(value: number) => formatCurrency(value)}
            />
            <Legend
              wrapperStyle={{ fontSize: '10px', fontFamily: 'monospace' }}
              iconType="line"
            />
            <Line
              type="monotone"
              dataKey="FII"
              stroke={chartColors.fii}
              strokeWidth={2}
              dot={{ fill: chartColors.fii, r: 3 }}
              activeDot={{ r: 5 }}
            />
            <Line
              type="monotone"
              dataKey="DII"
              stroke={chartColors.dii}
              strokeWidth={2}
              dot={{ fill: chartColors.dii, r: 3 }}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <ScrollArea className="max-h-48 border-t border-border">
        <div className="px-3">
          <div className="grid grid-cols-3 gap-1 py-2 text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border bg-muted/40 sticky top-0">
            <div>Date</div>
            <div className="text-right">FII Net</div>
            <div className="text-right">DII Net</div>
          </div>
          {rows.slice().reverse().map((item, index) => (
            <div
              key={item.date}
              className="grid grid-cols-3 gap-1 py-2 border-b border-border hover:bg-accent transition-colors"
              data-testid={`row-fii-dii-${index}`}
            >
              <div className="text-[11px] text-foreground font-mono" data-testid={`text-date-${index}`}>
                {formatDate(item.date)}
              </div>
              <div className={`text-right font-mono text-sm ${item.fiiNetBuySell >= 0 ? 'text-positive' : 'text-negative'}`} data-testid={`text-fii-${index}`}>
                {formatCurrency(item.fiiNetBuySell)}
              </div>
              <div className={`text-right font-mono text-sm ${item.diiNetBuySell >= 0 ? 'text-positive' : 'text-negative'}`} data-testid={`text-dii-${index}`}>
                {formatCurrency(item.diiNetBuySell)}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
