import { DollarSign, RefreshCw, Loader2, AlertCircle, TrendingUp, TrendingDown } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface FinancialResult {
  period: string;
  revenue: number;
  expenses: number;
  netProfit: number;
  eps: number;
  quarter?: string;
  year?: string;
}

export function FinancialResultsPanel() {
  const [symbol, setSymbol] = useState('RELIANCE');

  const { data: results, isLoading, isError, refetch } = useQuery<FinancialResult[]>({
    queryKey: ['/api/financial-results', { symbol }],
    enabled: symbol.length > 0,
    staleTime: 3600000, // 1 hour
  });

  const formatCurrency = (value: number): string => {
    if (value >= 1000) return `₹${(value / 1000).toFixed(1)}K Cr`;
    return `₹${value.toFixed(0)} Cr`;
  };

  const latestResult = results && results.length > 0 ? results[0] : null;
  const chartData = results?.slice(0, 8).reverse().map(r => ({
    period: r.period,
    Revenue: r.revenue,
    Profit: r.netProfit,
  }));

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full bg-[#0A0A0A]">
        <Loader2 className="w-6 h-6 animate-spin text-primary" data-testid="loading-spinner-financial-results" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 bg-[#0A0A0A]">
        <AlertCircle className="w-8 h-8 text-destructive" data-testid="error-icon-financial-results" />
        <p className="text-sm text-muted-foreground" data-testid="text-error-message">Failed to load financial results</p>
        <Button 
          onClick={() => refetch()} 
          size="sm"
          data-testid="button-retry-financial-results"
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
          <span className="text-[10px] uppercase tracking-wider text-[#888888]">Financial Results</span>
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6"
            onClick={() => refetch()}
            data-testid="button-refresh-financial-results"
          >
            <RefreshCw className="h-3 w-3" />
          </Button>
        </div>
        <Input
          value={symbol}
          onChange={(e) => setSymbol(e.target.value.toUpperCase())}
          placeholder="Enter Symbol (e.g., RELIANCE)"
          className="h-8 bg-[#000000] border-[#1a1a1a] text-[#FFFFFF] font-mono text-sm"
          data-testid="input-symbol-financial-results"
        />
      </div>

      {latestResult && (
        <div className="grid grid-cols-4 gap-3 p-3 border-b border-[#1a1a1a]">
          <div className="space-y-1">
            <div className="text-[10px] uppercase tracking-wider text-[#888888]">Period</div>
            <div className="font-mono text-sm text-[#FF6B47]" data-testid="text-latest-period">
              {latestResult.period}
            </div>
          </div>
          <div className="space-y-1">
            <div className="text-[10px] uppercase tracking-wider text-[#888888]">Revenue</div>
            <div className="font-mono text-sm text-[#FFFFFF]" data-testid="text-latest-revenue">
              {formatCurrency(latestResult.revenue)}
            </div>
          </div>
          <div className="space-y-1">
            <div className="text-[10px] uppercase tracking-wider text-[#888888]">Net Profit</div>
            <div className={`font-mono text-sm ${latestResult.netProfit >= 0 ? 'text-[#00FF00]' : 'text-[#FF6B35]'}`} data-testid="text-latest-profit">
              {formatCurrency(latestResult.netProfit)}
            </div>
          </div>
          <div className="space-y-1">
            <div className="text-[10px] uppercase tracking-wider text-[#888888]">EPS</div>
            <div className="font-mono text-sm text-[#FFFFFF]" data-testid="text-latest-eps">
              ₹{latestResult.eps.toFixed(2)}
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 p-3 min-h-[200px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" />
            <XAxis 
              dataKey="period" 
              stroke="#888888" 
              style={{ fontSize: '10px', fontFamily: 'monospace' }}
              tick={{ fill: '#888888' }}
            />
            <YAxis 
              stroke="#888888" 
              style={{ fontSize: '10px', fontFamily: 'monospace' }}
              tick={{ fill: '#888888' }}
              tickFormatter={(value) => `${(value / 1000).toFixed(0)}K`}
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
              formatter={(value: number) => formatCurrency(value)}
            />
            <Legend 
              wrapperStyle={{ fontSize: '10px', fontFamily: 'monospace' }}
              iconType="rect"
            />
            <Bar dataKey="Revenue" fill="#FF6B47" radius={[4, 4, 0, 0]} />
            <Bar dataKey="Profit" fill="#00FF00" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <ScrollArea className="max-h-64 border-t border-[#1a1a1a]">
        <div className="px-3">
          <div className="grid grid-cols-5 gap-1 py-2 text-[10px] uppercase tracking-wider text-[#888888] border-b border-[#1a1a1a] bg-[#000000] sticky top-0">
            <div>Period</div>
            <div className="text-right">Revenue</div>
            <div className="text-right">Expenses</div>
            <div className="text-right">Net Profit</div>
            <div className="text-right">EPS</div>
          </div>
          {results?.map((result, index) => (
            <div
              key={`${result.period}-${index}`}
              className="grid grid-cols-5 gap-1 py-2 border-b border-[#1a1a1a] hover:bg-[#1a1a1a] transition-colors"
              data-testid={`row-result-${index}`}
            >
              <div className="text-[11px] text-[#FF6B47] font-mono" data-testid={`text-period-${index}`}>
                {result.period}
              </div>
              <div className="text-right font-mono text-sm text-[#FFFFFF]" data-testid={`text-revenue-${index}`}>
                {formatCurrency(result.revenue)}
              </div>
              <div className="text-right font-mono text-sm text-[#FF6B35]" data-testid={`text-expenses-${index}`}>
                {formatCurrency(result.expenses)}
              </div>
              <div className={`text-right font-mono text-sm ${result.netProfit >= 0 ? 'text-[#00FF00]' : 'text-[#FF6B35]'}`} data-testid={`text-profit-${index}`}>
                {formatCurrency(result.netProfit)}
              </div>
              <div className="text-right font-mono text-sm text-[#FFFFFF]" data-testid={`text-eps-${index}`}>
                ₹{result.eps.toFixed(2)}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
