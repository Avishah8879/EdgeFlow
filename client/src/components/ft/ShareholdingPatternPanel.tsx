import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip, LineChart, Line, XAxis, YAxis, CartesianGrid } from 'recharts';
import { RefreshCw, Loader2, AlertCircle } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

interface ShareholdingPattern {
  date: string;
  promoter: number;
  fii: number;
  dii: number;
  public: number;
  others?: number;
}

const COLORS = {
  promoter: '#00FF00',
  fii: '#00BFFF',
  dii: '#FFD700',
  public: '#FF6B35',
  others: '#888888',
};

export function ShareholdingPatternPanel() {
  const [symbol, setSymbol] = useState('RELIANCE');

  const { data, isLoading, isError, refetch } = useQuery<ShareholdingPattern[]>({
    queryKey: ['/api/shareholding', { symbol }],
    enabled: symbol.length > 0,
    staleTime: 3600000, // 1 hour
  });

  const formatDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' });
    } catch {
      return dateStr;
    }
  };

  const latestPattern = data && data.length > 0 ? data[0] : null;

  const pieData = latestPattern ? [
    { name: 'Promoter', value: latestPattern.promoter, color: COLORS.promoter },
    { name: 'FII', value: latestPattern.fii, color: COLORS.fii },
    { name: 'DII', value: latestPattern.dii, color: COLORS.dii },
    { name: 'Public', value: latestPattern.public, color: COLORS.public },
  ] : [];

  const trendData = data?.slice().reverse().map(d => ({
    date: formatDate(d.date),
    Promoter: d.promoter,
    FII: d.fii,
    DII: d.dii,
    Public: d.public,
  }));

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full bg-[#0A0A0A]">
        <Loader2 className="w-6 h-6 animate-spin text-primary" data-testid="loading-spinner-shareholding" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 bg-[#0A0A0A]">
        <AlertCircle className="w-8 h-8 text-destructive" data-testid="error-icon-shareholding" />
        <p className="text-sm text-muted-foreground" data-testid="text-error-message">Failed to load shareholding data</p>
        <Button 
          onClick={() => refetch()} 
          size="sm"
          data-testid="button-retry-shareholding"
        >
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[#0A0A0A]">
      <div className="p-3 border-b border-[#1a1a1a] space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-wider text-[#888888]">Shareholding Pattern</span>
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6"
            onClick={() => refetch()}
            data-testid="button-refresh-shareholding"
          >
            <RefreshCw className="h-3 w-3" />
          </Button>
        </div>
        <Input
          value={symbol}
          onChange={(e) => setSymbol(e.target.value.toUpperCase())}
          placeholder="Enter Symbol (e.g., RELIANCE)"
          className="h-8 bg-[#000000] border-[#1a1a1a] text-[#FFFFFF] font-mono text-sm"
          data-testid="input-symbol-shareholding"
        />
      </div>

      {latestPattern && (
        <div className="p-3 border-b border-[#1a1a1a]">
          <div className="text-[10px] uppercase tracking-wider text-[#888888] mb-2">
            As of {formatDate(latestPattern.date)}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={2}
                    dataKey="value"
                    label={({ name, value }) => `${name}: ${value.toFixed(1)}%`}
                    labelLine={false}
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#0A0A0A', 
                      border: '1px solid #1a1a1a',
                      borderRadius: '4px',
                      fontSize: '11px',
                      fontFamily: 'monospace'
                    }}
                    formatter={(value: number) => `${value.toFixed(2)}%`}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-2">
              {[
                { label: 'Promoter', value: latestPattern.promoter, color: COLORS.promoter },
                { label: 'FII', value: latestPattern.fii, color: COLORS.fii },
                { label: 'DII', value: latestPattern.dii, color: COLORS.dii },
                { label: 'Public', value: latestPattern.public, color: COLORS.public },
              ].map((item) => (
                <div key={item.label} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: item.color }} />
                    <span className="text-[11px] text-[#FFFFFF]">{item.label}</span>
                  </div>
                  <span className="font-mono text-sm" style={{ color: item.color }} data-testid={`text-${item.label.toLowerCase()}-percent`}>
                    {item.value.toFixed(2)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 p-3 min-h-[200px]">
        <div className="text-[10px] uppercase tracking-wider text-[#888888] mb-2">Historical Trend</div>
        <ResponsiveContainer width="100%" height="90%">
          <LineChart data={trendData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" />
            <XAxis 
              dataKey="date" 
              stroke="#888888" 
              style={{ fontSize: '10px', fontFamily: 'monospace' }}
              tick={{ fill: '#888888' }}
            />
            <YAxis 
              stroke="#888888" 
              style={{ fontSize: '10px', fontFamily: 'monospace' }}
              tick={{ fill: '#888888' }}
              domain={[0, 100]}
              tickFormatter={(value) => `${value}%`}
            />
            <Tooltip 
              contentStyle={{ 
                backgroundColor: '#0A0A0A', 
                border: '1px solid #1a1a1a',
                borderRadius: '4px',
                fontSize: '11px',
                fontFamily: 'monospace'
              }}
              labelStyle={{ color: '#888888' }}
              itemStyle={{ color: '#FFFFFF' }}
              formatter={(value: number) => `${value.toFixed(2)}%`}
            />
            <Legend 
              wrapperStyle={{ fontSize: '10px', fontFamily: 'monospace' }}
              iconType="line"
            />
            <Line type="monotone" dataKey="Promoter" stroke={COLORS.promoter} strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="FII" stroke={COLORS.fii} strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="DII" stroke={COLORS.dii} strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="Public" stroke={COLORS.public} strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <ScrollArea className="max-h-48 border-t border-[#1a1a1a]">
        <div className="px-3">
          <div className="grid grid-cols-5 gap-1 py-2 text-[10px] uppercase tracking-wider text-[#888888] border-b border-[#1a1a1a] bg-[#000000] sticky top-0">
            <div>Date</div>
            <div className="text-right">Promoter</div>
            <div className="text-right">FII</div>
            <div className="text-right">DII</div>
            <div className="text-right">Public</div>
          </div>
          {data?.map((pattern, index) => (
            <div
              key={`${pattern.date}-${index}`}
              className="grid grid-cols-5 gap-1 py-2 border-b border-[#1a1a1a] hover:bg-[#1a1a1a] transition-colors"
              data-testid={`row-pattern-${index}`}
            >
              <div className="text-[11px] text-[#FFFFFF] font-mono" data-testid={`text-date-${index}`}>
                {formatDate(pattern.date)}
              </div>
              <div className="text-right font-mono text-sm" style={{ color: COLORS.promoter }} data-testid={`text-promoter-${index}`}>
                {pattern.promoter.toFixed(2)}%
              </div>
              <div className="text-right font-mono text-sm" style={{ color: COLORS.fii }} data-testid={`text-fii-${index}`}>
                {pattern.fii.toFixed(2)}%
              </div>
              <div className="text-right font-mono text-sm" style={{ color: COLORS.dii }} data-testid={`text-dii-${index}`}>
                {pattern.dii.toFixed(2)}%
              </div>
              <div className="text-right font-mono text-sm" style={{ color: COLORS.public }} data-testid={`text-public-${index}`}>
                {pattern.public.toFixed(2)}%
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
