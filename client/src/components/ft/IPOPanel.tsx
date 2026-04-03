import { useState, useMemo } from 'react';
import { Calendar, TrendingUp, Building2, DollarSign, Filter, ChevronRight, Loader2, AlertCircle } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useQuery } from '@tanstack/react-query';
import { DataUnavailable } from '@/components/ft/DataUnavailable';

interface IPO {
  id: string;
  companyName: string;
  ticker: string;
  ipoDate: string;
  priceRangeLow: number;
  priceRangeHigh: number;
  sharesOffered: number;
  exchange: string;
  sector: string;
  status: 'Filed' | 'Priced' | 'Trading' | 'Postponed' | 'Withdrawn';
  underwriters: string[];
  description: string;
  marketCap?: number;
}

interface IPOResponse {
  success: boolean;
  data: IPO[];
  message?: string;
  timestamp?: string;
}

export function IPOPanel() {
  const [sectorFilter, setSectorFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [activeTab, setActiveTab] = useState('upcoming');

  const { data: response, isLoading, isError, refetch } = useQuery<IPOResponse>({
    queryKey: ['/api/ipos'],
    staleTime: 300000, // 5 minutes
    refetchInterval: false, // Don't auto-refresh
  });

  const ipos = response?.data || [];
  const isDataUnavailable = !isLoading && response?.success === false;

  const { upcomingIPOs, recentIPOs, allIPOs } = useMemo(() => {
    if (!ipos || ipos.length === 0) return { upcomingIPOs: [], recentIPOs: [], allIPOs: [] };

    const now = new Date();
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyDaysFromNow = new Date(now);
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    let filtered = [...ipos];

    // Apply filters
    if (sectorFilter !== 'all') {
      filtered = filtered.filter(ipo => ipo.sector === sectorFilter);
    }
    if (statusFilter !== 'all') {
      filtered = filtered.filter(ipo => ipo.status === statusFilter);
    }

    // Sort by date
    filtered.sort((a, b) => new Date(a.ipoDate).getTime() - new Date(b.ipoDate).getTime());

    const upcoming = filtered.filter(ipo => {
      const ipoDate = new Date(ipo.ipoDate);
      return ipoDate > now && ipoDate <= thirtyDaysFromNow;
    });
    
    const recent = filtered.filter(ipo => {
      const ipoDate = new Date(ipo.ipoDate);
      return ipoDate <= now && ipoDate >= thirtyDaysAgo;
    }).reverse(); // Most recent first

    return {
      upcomingIPOs: upcoming,
      recentIPOs: recent,
      allIPOs: filtered,
    };
  }, [ipos, sectorFilter, statusFilter]);

  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      year: 'numeric' 
    });
  };

  const formatShares = (shares: number): string => {
    if (shares >= 1000000000) return `${(shares / 1000000000).toFixed(1)}B`;
    if (shares >= 1000000) return `${(shares / 1000000).toFixed(1)}M`;
    return shares.toLocaleString();
  };

  const getStatusColor = (status: IPO['status']): string => {
    switch (status) {
      case 'Trading': return 'text-[#00FF00]';
      case 'Priced': return 'text-[#00BFFF]';
      case 'Filed': return 'text-[#FFFFFF]';
      case 'Postponed': return 'text-[#FFA500]';
      case 'Withdrawn': return 'text-[#FF6B35]';
      default: return 'text-[#888888]';
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full bg-[#0A0A0A]">
        <Loader2 className="w-6 h-6 animate-spin text-primary" data-testid="loading-spinner-ipo" />
      </div>
    );
  }

  if (isDataUnavailable) {
    return (
      <DataUnavailable 
        title="IPO CALENDAR UNAVAILABLE"
        message={response?.message || "IPO data unavailable - API integration pending"}
        onRetry={refetch}
        showRetryButton={true}
      />
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 bg-[#0A0A0A]">
        <AlertCircle className="w-8 h-8 text-destructive" data-testid="error-icon-ipo" />
        <p className="text-sm text-muted-foreground" data-testid="text-error-message">Failed to load IPO calendar</p>
        <Button 
          onClick={() => refetch()} 
          size="sm"
          data-testid="button-retry-ipo"
        >
          Retry
        </Button>
      </div>
    );
  }

  const renderIPOList = (ipoList: IPO[]) => (
    <ScrollArea className="flex-1">
      {ipoList.length === 0 ? (
        <div className="p-8 text-center text-[#888888]" data-testid="text-no-ipos">
          No IPOs found matching the current filters
        </div>
      ) : (
        <div className="p-3">
          {ipoList.map((ipo) => {
            const estimatedMarketCap = ipo.sharesOffered * ((ipo.priceRangeLow + ipo.priceRangeHigh) / 2);
            
            return (
              <div 
                key={ipo.id} 
                className="mb-3 p-3 border border-[#1a1a1a] rounded bg-[#0f0f0f] hover:bg-[#1a1a1a] transition-colors"
                data-testid={`row-ipo-${ipo.ticker}`}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[#00BFFF] font-mono text-sm font-semibold" data-testid={`text-ticker-${ipo.ticker}`}>
                        {ipo.ticker}
                      </span>
                      <Badge 
                        variant="outline" 
                        className={`h-5 text-[10px] ${getStatusColor(ipo.status)}`}
                        data-testid={`badge-status-${ipo.ticker}`}
                      >
                        {ipo.status}
                      </Badge>
                      <Badge 
                        variant="outline" 
                        className="h-5 text-[10px]"
                        data-testid={`badge-exchange-${ipo.ticker}`}
                      >
                        {ipo.exchange}
                      </Badge>
                    </div>
                    <div className="text-[#FFFFFF] text-sm font-medium" data-testid={`text-company-${ipo.ticker}`}>
                      {ipo.companyName}
                    </div>
                    <div className="text-[#888888] text-xs mt-1" data-testid={`text-sector-${ipo.ticker}`}>
                      <Building2 className="inline w-3 h-3 mr-1" />
                      {ipo.sector}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[#00FF00] text-sm font-mono" data-testid={`text-date-${ipo.ticker}`}>
                      {formatDate(ipo.ipoDate)}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-3 text-[#CCCCCC]">
                    <span data-testid={`text-pricerange-${ipo.ticker}`}>
                      <DollarSign className="inline w-3 h-3 mr-1" />
                      ₹{ipo.priceRangeLow} - ₹{ipo.priceRangeHigh}
                    </span>
                    <span data-testid={`text-shares-${ipo.ticker}`}>
                      {formatShares(ipo.sharesOffered)} shares
                    </span>
                    <span data-testid={`text-marketcap-${ipo.ticker}`}>
                      ~₹{formatShares(estimatedMarketCap)} mkt cap
                    </span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-[#666666]" />
                </div>

                {ipo.underwriters && ipo.underwriters.length > 0 && (
                  <div className="mt-2 text-[10px] text-[#888888]" data-testid={`text-underwriters-${ipo.ticker}`}>
                    Lead: {ipo.underwriters.join(', ')}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </ScrollArea>
  );

  // Get unique sectors and statuses for filters
  const uniqueSectors = Array.from(new Set(ipos.map(ipo => ipo.sector))).sort();
  const uniqueStatuses = Array.from(new Set(ipos.map(ipo => ipo.status)));

  return (
    <div className="flex flex-col h-full bg-[#0A0A0A]">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[#1a1a1a]">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-[#00FF00]" />
            <h2 className="text-lg font-bold text-[#FFFFFF]">IPO Calendar</h2>
          </div>
          <Badge variant="secondary" className="text-[10px]" data-testid="badge-total-ipos">
            {ipos.length} Total
          </Badge>
        </div>

        {/* Filters */}
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-[10px] text-[#888888]">Sector</Label>
            <Select value={sectorFilter} onValueChange={setSectorFilter}>
              <SelectTrigger className="h-7 text-xs bg-[#1a1a1a] border-[#333333]" data-testid="select-sector">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[#0A0A0A] border-[#333333]">
                <SelectItem value="all">All Sectors</SelectItem>
                {uniqueSectors.map(sector => (
                  <SelectItem key={sector} value={sector}>
                    {sector}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-[10px] text-[#888888]">Status</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-7 text-xs bg-[#1a1a1a] border-[#333333]" data-testid="select-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[#0A0A0A] border-[#333333]">
                <SelectItem value="all">All Status</SelectItem>
                {uniqueStatuses.map(status => (
                  <SelectItem key={status} value={status}>
                    {status}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
        <TabsList className="grid w-full grid-cols-3 bg-[#1a1a1a]">
          <TabsTrigger value="upcoming" data-testid="tab-upcoming">
            <TrendingUp className="w-3 h-3 mr-1" />
            Upcoming ({upcomingIPOs.length})
          </TabsTrigger>
          <TabsTrigger value="recent" data-testid="tab-recent">
            Recent ({recentIPOs.length})
          </TabsTrigger>
          <TabsTrigger value="all" data-testid="tab-all">
            All ({allIPOs.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="upcoming" className="flex-1 mt-0">
          {renderIPOList(upcomingIPOs)}
        </TabsContent>

        <TabsContent value="recent" className="flex-1 mt-0">
          {renderIPOList(recentIPOs)}
        </TabsContent>

        <TabsContent value="all" className="flex-1 mt-0">
          {renderIPOList(allIPOs)}
        </TabsContent>
      </Tabs>
    </div>
  );
}