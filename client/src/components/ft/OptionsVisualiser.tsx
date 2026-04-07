import { useState, useCallback } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RefreshCw, Pause, Play } from 'lucide-react';
import { useOptionsVisualizerData } from '@/hooks/useOptionsVisualizerData';
import { GammaExposure2D } from '@/components/ft/options-visualiser/GammaExposure2D';
import { VolatilitySurface3D } from '@/components/ft/options-visualiser/VolatilitySurface3D';

type SupportedSymbol = 'NIFTY' | 'BANKNIFTY';

interface OptionsVisualiserProps {
  defaultSymbol?: SupportedSymbol;
}

export function OptionsVisualiser({ defaultSymbol = 'NIFTY' }: OptionsVisualiserProps) {
  const [symbol, setSymbol] = useState<SupportedSymbol>(defaultSymbol);
  const [activeTab, setActiveTab] = useState<'2d' | '3d'>('2d');
  const [surfaceType, setSurfaceType] = useState<'iv' | 'gxoi'>('iv');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState(30000);

  // Fetch data with the hook
  const {
    exposure,
    timeSeries,
    surface,
    isLoading,
    isExposureLoading,
    isSurfaceLoading,
    refetch,
  } = useOptionsVisualizerData({
    symbol,
    surfaceType,
    includeHistory: activeTab === '3d',
    enabled: true,
    refreshInterval: autoRefresh ? refreshInterval : 0,
  });

  const handleSymbolChange = useCallback((newSymbol: SupportedSymbol) => {
    setSymbol(newSymbol);
  }, []);

  const handleRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  const toggleAutoRefresh = useCallback(() => {
    setAutoRefresh((prev) => !prev);
  }, []);

  return (
    <div className="flex flex-col bg-background" style={{ height: 'calc(100vh - 6rem)' }}>
      {/* Header Controls */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-sidebar">
        {/* Symbol Selector */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono uppercase text-muted-foreground">SYMBOL:</span>
          <div className="flex gap-1">
            {(['NIFTY', 'BANKNIFTY'] as const).map((sym) => (
              <button
                key={sym}
                onClick={() => handleSymbolChange(sym)}
                className={`px-3 py-1 text-[10px] font-mono uppercase rounded transition-colors ${
                  symbol === sym
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
              >
                {sym}
              </button>
            ))}
          </div>
        </div>

        {/* Refresh Controls */}
        <div className="flex items-center gap-3">
          {/* Refresh Interval Selector */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono uppercase text-muted-foreground">INTERVAL:</span>
            <select
              value={refreshInterval}
              onChange={(e) => setRefreshInterval(Number(e.target.value))}
              className="bg-muted text-foreground text-[10px] font-mono px-2 py-1 rounded border border-border"
            >
              <option value={15000}>15s</option>
              <option value={30000}>30s</option>
              <option value={60000}>60s</option>
              <option value={120000}>2m</option>
            </select>
          </div>

          {/* Auto-refresh Toggle */}
          <button
            onClick={toggleAutoRefresh}
            className={`flex items-center gap-1 px-2 py-1 text-[10px] font-mono uppercase rounded transition-colors ${
              autoRefresh
                ? 'bg-primary/20 text-primary'
                : 'bg-muted text-muted-foreground'
            }`}
            title={autoRefresh ? 'Pause auto-refresh' : 'Enable auto-refresh'}
          >
            {autoRefresh ? (
              <>
                <Pause className="w-3 h-3" />
                AUTO
              </>
            ) : (
              <>
                <Play className="w-3 h-3" />
                PAUSED
              </>
            )}
          </button>

          {/* Manual Refresh */}
          <button
            onClick={handleRefresh}
            disabled={isLoading}
            className="flex items-center gap-1 px-2 py-1 text-[10px] font-mono uppercase rounded bg-muted text-muted-foreground hover:bg-muted/80 disabled:opacity-50 transition-colors"
            title="Refresh now"
          >
            <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} />
            REFRESH
          </button>
        </div>
      </div>

      {/* Tab Content */}
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as '2d' | '3d')}
        className="flex-1 flex flex-col min-h-0"
      >
        <TabsList className="w-full grid grid-cols-2 rounded-none border-b border-border bg-sidebar h-8">
          <TabsTrigger
            value="2d"
            className="text-[10px] font-mono uppercase data-[state=active]:bg-background data-[state=active]:text-primary rounded-none h-full"
          >
            2D ANALYSIS
          </TabsTrigger>
          <TabsTrigger
            value="3d"
            className="text-[10px] font-mono uppercase data-[state=active]:bg-background data-[state=active]:text-primary rounded-none h-full"
          >
            3D SURFACE
          </TabsTrigger>
        </TabsList>

        <TabsContent value="2d" className="flex-1 m-0 min-h-0">
          <GammaExposure2D
            exposureData={exposure}
            timeSeriesData={timeSeries}
            isLoading={isExposureLoading}
          />
        </TabsContent>

        <TabsContent value="3d" className="flex-1 m-0 min-h-0">
          <VolatilitySurface3D
            surfaceData={surface}
            isLoading={isSurfaceLoading}
            surfaceType={surfaceType}
            onSurfaceTypeChange={setSurfaceType}
          />
        </TabsContent>
      </Tabs>

      {/* Status Bar */}
      <div className="flex items-center justify-between px-3 py-1 border-t border-border bg-sidebar text-[9px] font-mono text-muted-foreground">
        <div className="flex items-center gap-4">
          <span>
            LAST UPDATE:{' '}
            {exposure?.timestamp
              ? new Date(exposure.timestamp).toLocaleTimeString('en-IN', {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                  hour12: false,
                })
              : '--:--:--'}
          </span>
          {timeSeries?.is_market_open && (
            <span className="text-primary">● MARKET OPEN</span>
          )}
          {!timeSeries?.is_market_open && timeSeries && (
            <span className="text-muted-foreground">○ MARKET CLOSED</span>
          )}
        </div>
        <span>
          DATA POINTS: {timeSeries?.data?.length || 0} | STRIKES: {exposure?.by_strike?.length || 0}
        </span>
      </div>
    </div>
  );
}
