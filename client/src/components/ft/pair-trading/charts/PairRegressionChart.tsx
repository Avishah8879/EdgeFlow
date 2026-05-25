import {
  ComposedChart,
  Scatter,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import type { PairScatterPoint } from '@/lib/stats';

interface Props {
  scatter: PairScatterPoint[];
  regressionLine: PairScatterPoint[];
  xSymbol: string;
  ySymbol: string;
  height?: number;
}

export function PairRegressionChart({
  scatter,
  regressionLine,
  xSymbol,
  ySymbol,
  height = 260,
}: Props) {
  if (scatter.length < 2) {
    return (
      <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
        Not enough overlapping data to compute regression.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={scatter}>
        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
        <XAxis
          type="number"
          dataKey="xValue"
          name={xSymbol}
          unit="%"
          stroke="#9ca3af"
          tick={{ fontSize: 10 }}
        />
        <YAxis
          type="number"
          dataKey="yValue"
          name={ySymbol}
          unit="%"
          stroke="#9ca3af"
          tick={{ fontSize: 10 }}
        />
        <Tooltip
          cursor={{ strokeDasharray: '3 3' }}
          contentStyle={{
            backgroundColor: '#1f2937',
            border: '1px solid #374151',
            borderRadius: '4px',
          }}
          formatter={(value: any, name) => [`${value}%`, name]}
        />
        <Legend />
        <Scatter name={`${ySymbol} vs ${xSymbol}`} data={scatter} fill="#3b82f6" />
        {regressionLine.length === 2 && (
          <Line
            name="α + β · X"
            data={regressionLine}
            dataKey="yValue"
            stroke="#f97316"
            dot={false}
            strokeWidth={2}
          />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  );
}
