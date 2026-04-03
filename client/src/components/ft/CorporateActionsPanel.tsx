import { Calendar, RefreshCw, Loader2, AlertCircle } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';

interface CorporateAction {
  symbol: string;
  companyName: string;
  exDate: string;
  recordDate?: string;
  purpose: string;
  type: 'DIVIDEND' | 'SPLIT' | 'BONUS' | 'RIGHTS';
  details: string;
}

export function CorporateActionsPanel() {
  const [symbol, setSymbol] = useState('RELIANCE');

  const { data: actions, isLoading, isError, refetch } = useQuery<CorporateAction[]>({
    queryKey: ['/api/corporate-actions', { symbol }],
    enabled: symbol.length > 0,
    staleTime: 3600000, // 1 hour
  });

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'DIVIDEND': return 'bg-[#00FF00]/20 text-[#00FF00] border-[#00FF00]/50';
      case 'SPLIT': return 'bg-[#00BFFF]/20 text-[#00BFFF] border-[#00BFFF]/50';
      case 'BONUS': return 'bg-[#FFD700]/20 text-[#FFD700] border-[#FFD700]/50';
      case 'RIGHTS': return 'bg-[#FF6B35]/20 text-[#FF6B35] border-[#FF6B35]/50';
      default: return 'bg-[#888888]/20 text-[#888888] border-[#888888]/50';
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full bg-[#0A0A0A]">
        <Loader2 className="w-6 h-6 animate-spin text-primary" data-testid="loading-spinner-corporate-actions" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 bg-[#0A0A0A]">
        <AlertCircle className="w-8 h-8 text-destructive" data-testid="error-icon-corporate-actions" />
        <p className="text-sm text-muted-foreground" data-testid="text-error-message">Failed to load corporate actions</p>
        <Button 
          onClick={() => refetch()} 
          size="sm"
          data-testid="button-retry-corporate-actions"
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
          <span className="text-[10px] uppercase tracking-wider text-[#888888]">Corporate Actions</span>
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6"
            onClick={() => refetch()}
            data-testid="button-refresh-corporate-actions"
          >
            <RefreshCw className="h-3 w-3" />
          </Button>
        </div>
        <Input
          value={symbol}
          onChange={(e) => setSymbol(e.target.value.toUpperCase())}
          placeholder="Enter Symbol (e.g., RELIANCE)"
          className="h-8 bg-[#000000] border-[#1a1a1a] text-[#FFFFFF] font-mono text-sm"
          data-testid="input-symbol-corporate-actions"
        />
      </div>

      <div className="grid grid-cols-6 gap-1 px-3 py-2 text-[10px] uppercase tracking-wider text-[#888888] border-b border-[#1a1a1a] bg-[#000000]">
        <div>Type</div>
        <div className="col-span-2">Purpose</div>
        <div>Ex-Date</div>
        <div>Record Date</div>
        <div>Details</div>
      </div>

      <ScrollArea className="flex-1">
        <div className="px-3">
          {actions && actions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2">
              <Calendar className="w-8 h-8 text-[#888888]" />
              <p className="text-sm text-[#888888]" data-testid="text-no-actions">
                No corporate actions found for {symbol}
              </p>
            </div>
          ) : (
            actions?.map((action, index) => (
              <div
                key={`${action.symbol}-${action.exDate}-${index}`}
                className="grid grid-cols-6 gap-1 py-3 border-b border-[#1a1a1a] hover:bg-[#1a1a1a] transition-colors"
                data-testid={`row-action-${index}`}
              >
                <div className="flex items-start">
                  <Badge 
                    variant="outline" 
                    className={`text-[9px] px-1 py-0 h-5 ${getTypeColor(action.type)}`}
                    data-testid={`badge-type-${action.type}`}
                  >
                    {action.type}
                  </Badge>
                </div>
                <div className="col-span-2 text-[11px] text-[#FFFFFF]" data-testid={`text-purpose-${index}`}>
                  {action.purpose}
                </div>
                <div className="text-[11px] text-[#00BFFF] font-mono" data-testid={`text-ex-date-${index}`}>
                  {formatDate(action.exDate)}
                </div>
                <div className="text-[11px] text-[#888888] font-mono" data-testid={`text-record-date-${index}`}>
                  {action.recordDate ? formatDate(action.recordDate) : '-'}
                </div>
                <div className="text-[10px] text-[#888888] truncate" title={action.details} data-testid={`text-details-${index}`}>
                  {action.details}
                </div>
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
