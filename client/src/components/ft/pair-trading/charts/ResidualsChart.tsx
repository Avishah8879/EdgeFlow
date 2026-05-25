import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts';
import type { ResidualPoint } from '@/lib/stats';

interface Props {
  residuals: ResidualPoint[];
  stdDev: number;
  height?: number;
}

const SIGMA_BANDS: Array<{
  k: number;
  posColor: string;
  negColor: string;
  strokeWidth: number;
  dash: string;
  opacity: number;
}> = [
  { k: 1, posColor: '#22c55e', negColor: '#ef4444', strokeWidth: 1, dash: '3 6', opacity: 0.55 },
  { k: 2, posColor: '#22c55e', negColor: '#ef4444', strokeWidth: 1.25, dash: '6 4', opacity: 0.85 },
  { k: 3, posColor: '#22c55e', negColor: '#ef4444', strokeWidth: 1.5, dash: '10 4', opacity: 1.0 },
];

export function ResidualsChart({ residuals, stdDev, height = 260 }: Props) {
  if (residuals.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
        Residuals unavailable for the selected pair.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={residuals} margin={{ top: 5, right: 60, left: 5, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
        <XAxis dataKey="date" stroke="#9ca3af" tick={{ fontSize: 10 }} />
        <YAxis
          stroke="#9ca3af"
          tick={{ fontSize: 10 }}
          tickFormatter={(v) => `${v}%`}
          domain={
            stdDev > 0
              ? [
                  (dataMin: number) => Math.min(dataMin, -3.5 * stdDev),
                  (dataMax: number) => Math.max(dataMax, 3.5 * stdDev),
                ]
              : ['auto', 'auto']
          }
        />
        <Tooltip
          contentStyle={{
            backgroundColor: '#1f2937',
            border: '1px solid #374151',
            borderRadius: '4px',
          }}
          formatter={(value: any) => `${value}%`}
        />
        <ReferenceLine y={0} stroke="#4b5563" strokeDasharray="4 2" />
        {stdDev > 0 &&
          SIGMA_BANDS.flatMap(({ k, posColor, negColor, strokeWidth, dash, opacity }) => [
            <ReferenceLine
              key={`pos-${k}`}
              y={parseFloat((k * stdDev).toFixed(4))}
              stroke={posColor}
              strokeDasharray={dash}
              strokeWidth={strokeWidth}
              strokeOpacity={opacity}
              ifOverflow="extendDomain"
              label={{
                value: `+${k}σ`,
                position: 'right',
                fill: posColor,
                fontSize: 10,
                fontWeight: k === 3 ? 'bold' : 'normal',
              }}
            />,
            <ReferenceLine
              key={`neg-${k}`}
              y={parseFloat((-k * stdDev).toFixed(4))}
              stroke={negColor}
              strokeDasharray={dash}
              strokeWidth={strokeWidth}
              strokeOpacity={opacity}
              ifOverflow="extendDomain"
              label={{
                value: `-${k}σ`,
                position: 'right',
                fill: negColor,
                fontSize: 10,
                fontWeight: k === 3 ? 'bold' : 'normal',
              }}
            />,
          ])}
        <Line type="monotone" dataKey="residual" stroke="#f97316" dot={false} strokeWidth={2} />
      </LineChart>
    </ResponsiveContainer>
  );
}
