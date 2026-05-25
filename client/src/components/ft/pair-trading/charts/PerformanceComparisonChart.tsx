import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import type { NormalizedSeriesRow } from '@/lib/stats';

interface Props {
  data: NormalizedSeriesRow[];
  symbols: string[];
  colors: string[];
  isLoading?: boolean;
  emptyMessage?: string;
  heightPct?: string;
}

export function PerformanceComparisonChart({
  data,
  symbols,
  colors,
  isLoading = false,
  emptyMessage = 'No data available',
  heightPct = '90%',
}: Props) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[calc(100%-2rem)]">
        <div className="text-muted-foreground">Loading chart data...</div>
      </div>
    );
  }

  if (data.length === 0 || symbols.length === 0) {
    return (
      <div className="flex items-center justify-center h-[calc(100%-2rem)]">
        <div className="text-muted-foreground">{emptyMessage}</div>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={heightPct}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
        <XAxis dataKey="date" stroke="#9ca3af" tick={{ fontSize: 10 }} />
        <YAxis stroke="#9ca3af" tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}%`} />
        <Tooltip
          contentStyle={{
            backgroundColor: '#1f2937',
            border: '1px solid #374151',
            borderRadius: '4px',
          }}
          formatter={(value: any) => `${value}%`}
        />
        <Legend />
        {symbols.map((symbol, index) => (
          <Line
            key={symbol}
            type="monotone"
            dataKey={symbol}
            stroke={colors[index % colors.length]}
            strokeWidth={2}
            dot={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
