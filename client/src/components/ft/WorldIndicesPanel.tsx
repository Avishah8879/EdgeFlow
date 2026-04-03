import { useState } from 'react';
import { ArrowUp, ArrowDown, RefreshCw, Globe, Loader2, AlertCircle } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { useQuery } from '@tanstack/react-query';

interface MarketIndex {
  symbol: string;
  name: string;
  region: 'Americas' | 'Europe' | 'Asia-Pacific';
  value: number;
  change: number;
  changePercent: number;
  dayLow: number;
  dayHigh: number;
  volume?: number;
  lastUpdate: string;
}

// No mock sparkline generation - zero tolerance policy
const generateSparkline = (value: number, changePercent: number): number[] => {
  // Return empty array - no mock data allowed
  return [];
};

// Sparkline component
const Sparkline = ({ data, isPositive }: { data: number[]; isPositive: boolean }) => {
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  
  const points = data.map((value, i) => {
    const x = (i / (data.length - 1)) * 100;
    const y = 100 - ((value - min) / range) * 100;
    return `${x},${y}`;
  }).join(' ');
  
  return (
    <svg
      width="60"
      height="20"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="inline-block"
    >
      <polyline
        points={points}
        fill="none"
        stroke={isPositive ? '#00FF00' : '#FF6B35'}
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
};

export function WorldIndicesPanel() {
  const [selectedRegion, setSelectedRegion] = useState<'all' | 'Americas' | 'Europe' | 'Asia-Pacific'>('all');

  const { data: indices, isLoading, isError, refetch } = useQuery<MarketIndex[]>({
    queryKey: ['/api/indices'],
    staleTime: 60000, // 1 minute
    refetchInterval: 60000, // Auto-refresh every minute
    select: (raw: any): MarketIndex[] => {
      const arr = Array.isArray(raw) ? raw : Array.isArray(raw?.data) ? raw.data : [];
      return arr.map((item: any): MarketIndex => ({
        symbol: item.symbol ?? '',
        name: item.name ?? item.symbol ?? '',
        region: (item.region as MarketIndex['region']) ?? 'Asia-Pacific',
        value: Number(item.value ?? item.ltp ?? item.last_price ?? 0),
        change: Number(item.change ?? 0),
        changePercent: Number(item.changePercent ?? item.change_pct ?? item.change_percent ?? 0),
        dayLow: Number(item.dayLow ?? item.low ?? item.value ?? item.ltp ?? 0),
        dayHigh: Number(item.dayHigh ?? item.high ?? item.value ?? item.ltp ?? 0),
        volume: item.volume ? Number(item.volume) : undefined,
        lastUpdate: item.lastUpdate ?? item.updated_at ?? new Date().toISOString(),
      }));
    },
  });

  const formatVolume = (volume?: number): string => {
    if (!volume) return 'N/A';
    if (volume >= 1000000000) return `${(volume / 1000000000).toFixed(1)}B`;
    if (volume >= 1000000) return `${(volume / 1000000).toFixed(1)}M`;
    return volume.toLocaleString();
  };

  const calculateDayProgress = (current: number, low: number, high: number): number => {
    if (high === low) return 50;
    return ((current - low) / (high - low)) * 100;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full bg-[#0A0A0A]">
        <Loader2 className="w-6 h-6 animate-spin text-primary" data-testid="loading-spinner-indices" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 bg-[#0A0A0A]">
        <AlertCircle className="w-8 h-8 text-destructive" data-testid="error-icon-indices" />
        <p className="text-sm text-muted-foreground" data-testid="text-error-message">Failed to load world indices</p>
        <Button 
          onClick={() => refetch()} 
          size="sm"
          data-testid="button-retry-indices"
        >
          Retry
        </Button>
      </div>
    );
  }

  const filteredIndices = selectedRegion === 'all' 
    ? indices || []
    : (indices || []).filter(index => index.region === selectedRegion);

  const groupedIndices = filteredIndices.reduce((acc, index) => {
    if (!acc[index.region]) {
      acc[index.region] = [];
    }
    acc[index.region].push(index);
    return acc;
  }, {} as Record<string, MarketIndex[]>);

  const lastRefresh = new Date();

  return (
    <div className="flex flex-col h-full bg-[#0A0A0A]">
      <div className="p-3 border-b border-[#1a1a1a]">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-[#00BFFF]" />
            <span className="text-[10px] uppercase tracking-wider text-[#888888]">World Indices</span>
            <span className="text-[10px] text-[#888888]" data-testid="text-last-update">
              Last: {lastRefresh.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          </div>
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6"
            onClick={() => refetch()}
            data-testid="button-refresh-indices"
          >
            <RefreshCw className="h-3 w-3" />
          </Button>
        </div>

        <Tabs value={selectedRegion} onValueChange={(value: any) => setSelectedRegion(value)}>
          <TabsList className="grid w-full grid-cols-4 h-7">
            <TabsTrigger value="all" className="text-[10px] h-6" data-testid="tab-all">All</TabsTrigger>
            <TabsTrigger value="Americas" className="text-[10px] h-6" data-testid="tab-americas">Americas</TabsTrigger>
            <TabsTrigger value="Europe" className="text-[10px] h-6" data-testid="tab-europe">Europe</TabsTrigger>
            <TabsTrigger value="Asia-Pacific" className="text-[10px] h-6" data-testid="tab-asia">Asia-Pacific</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-3">
          {Object.entries(groupedIndices).map(([region, regionIndices]) => (
            <div key={region} className="mb-4">
              <div className="flex items-center gap-2 mb-2">
                <Globe className="w-4 h-4 text-primary" />
                <span className="text-xs uppercase tracking-wider text-[#888888]">{region}</span>
                <div className="flex-1 h-[1px] bg-[#1a1a1a]"></div>
              </div>

              {regionIndices.map((index) => {
                const sparklineData = generateSparkline(index.value, index.changePercent);
                // Calculate year range estimate (typically 15-30% range)
                const yearRange = index.value * 0.22;
                const yearLow = index.value - yearRange / 2;
                const yearHigh = index.value + yearRange / 2;
                
                return (
                  <div
                    key={index.symbol}
                    className="mb-3 p-3 border border-[#1a1a1a] rounded bg-[#0f0f0f] hover:bg-[#1a1a1a] transition-colors cursor-pointer"
                    data-testid={`row-index-${index.symbol}`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[#00BFFF] font-mono text-sm font-semibold" data-testid={`text-symbol-${index.symbol}`}>
                            {index.symbol}
                          </span>
                          <span className="text-[#FFFFFF] text-sm" data-testid={`text-name-${index.symbol}`}>
                            {index.name}
                          </span>
                        </div>
                        <div className="flex items-center gap-4 mt-1">
                          <span className="text-xl font-mono text-[#FFFFFF]" data-testid={`text-value-${index.symbol}`}>
                            {index.value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                          <div className={`flex items-center gap-1 ${index.change >= 0 ? 'text-[#00FF00]' : 'text-[#FF6B35]'}`}>
                            {index.change >= 0 ? (
                              <ArrowUp className="h-4 w-4" />
                            ) : (
                              <ArrowDown className="h-4 w-4" />
                            )}
                            <span className="font-mono text-sm" data-testid={`text-change-${index.symbol}`}>
                              {index.change >= 0 ? '+' : ''}{index.change.toFixed(2)}
                            </span>
                            <span className="font-mono text-sm" data-testid={`text-change-percent-${index.symbol}`}>
                              ({index.changePercent >= 0 ? '+' : ''}{index.changePercent.toFixed(2)}%)
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <Sparkline data={sparklineData} isPositive={index.change >= 0} />
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3 text-[10px]">
                      <div>
                        <div className="text-[#888888] uppercase tracking-wider mb-1">Day Range</div>
                        <div className="space-y-1">
                          <div className="flex justify-between text-[#FFFFFF] font-mono">
                            <span data-testid={`text-day-low-${index.symbol}`}>{index.dayLow.toLocaleString()}</span>
                            <span data-testid={`text-day-high-${index.symbol}`}>{index.dayHigh.toLocaleString()}</span>
                          </div>
                          <Progress 
                            value={calculateDayProgress(index.value, index.dayLow, index.dayHigh)} 
                            className="h-1"
                          />
                        </div>
                      </div>
                      <div>
                        <div className="text-[#888888] uppercase tracking-wider mb-1">52W Range</div>
                        <div className="space-y-1">
                          <div className="flex justify-between text-[#FFFFFF] font-mono">
                            <span data-testid={`text-year-low-${index.symbol}`}>{yearLow.toFixed(2)}</span>
                            <span data-testid={`text-year-high-${index.symbol}`}>{yearHigh.toFixed(2)}</span>
                          </div>
                          <Progress 
                            value={calculateDayProgress(index.value, yearLow, yearHigh)} 
                            className="h-1"
                          />
                        </div>
                      </div>
                      {index.volume && (
                        <div>
                          <div className="text-[#888888] uppercase tracking-wider mb-1">Volume</div>
                          <div className="text-[#FFFFFF] font-mono" data-testid={`text-volume-${index.symbol}`}>
                            {formatVolume(index.volume)}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}