import { useEffect, useMemo, useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import {
  Loader2,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Search,
  Plus,
  Minus,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ReferenceLine,
  Bar,
} from 'recharts';

interface OptionContract {
  contract: string;
  strike: number;
  lastPrice: number;
  bid: number;
  ask: number;
  change: number;
  changePercent: number;
  volume: number;
  openInterest: number;
  impliedVolatility: number;
  inTheMoney: boolean;
  delta?: number;
}

interface OptionChainResponse {
  symbol: string;
  expiry: string | null;
  availableExpiries: string[];
  calls: OptionContract[];
  puts: OptionContract[];
  underlying?: number;
}

interface SelectedLeg {
  id: string;
  strike: number;
  optionType: 'call' | 'put';
  side: 'buy' | 'sell';
  quantity: number;
  premium: number;
}

function safeNumber(value: unknown, fallback = 0) {
  const num = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function formatNumber(value: unknown, decimals: number = 2) {
  const num = safeNumber(value, 0);
  return num.toFixed(decimals);
}

function formatCompactNumber(value: unknown) {
  const num = safeNumber(value, 0);
  if (Math.abs(num) >= 1_000_000) {
    return `${(num / 1_000_000).toFixed(1)}M`;
  }
  if (Math.abs(num) >= 1_000) {
    return `${(num / 1_000).toFixed(1)}K`;
  }
  return num.toString();
}

export function OptionChainPanel() {
  const [symbolInput, setSymbolInput] = useState('NIFTY');
  const [symbol, setSymbol] = useState('NIFTY');
  const [selectedExpiry, setSelectedExpiry] = useState<string | undefined>(undefined);
  const [selectedLegs, setSelectedLegs] = useState<SelectedLeg[]>([]);

  const { data, isLoading, isFetching, refetch, isPlaceholderData } = useQuery<OptionChainResponse>({
    queryKey: ['/api/options', symbol.toUpperCase(), selectedExpiry || 'default'],
    enabled: symbol.trim().length > 0,
    refetchInterval: 30000,
    staleTime: 20000,
    // Keep previous data visible during refetch and when switching expiries
    placeholderData: keepPreviousData,
    retry: 1,
    retryDelay: 2000,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedExpiry) {
        params.set('expiry', selectedExpiry);
      }
      const query = params.toString();
      const res = await fetch(`/api/options/${symbol.toUpperCase()}${query ? `?${query}` : ''}`, {
        credentials: 'include',
      });
      if (!res.ok) {
        const text = (await res.text()) || res.statusText;
        throw new Error(text);
      }
      const json = await res.json();
      return json?.data || json;
    },
  });

  // Auto-select expiry from response (only once when first loaded)
  useEffect(() => {
    if (!selectedExpiry && data?.expiry) {
      setSelectedExpiry(data.expiry);
    }
  }, [data?.expiry, selectedExpiry]);

  const calls = data?.calls || [];
  const puts = data?.puts || [];

  const callMap = useMemo(
    () => new Map(calls.map((contract) => [safeNumber(contract.strike), contract])),
    [calls]
  );
  const putMap = useMemo(
    () => new Map(puts.map((contract) => [safeNumber(contract.strike), contract])),
    [puts]
  );
  const maxCallOI = useMemo(
    () => Math.max(...calls.map((c) => c.openInterest || 0), 1),
    [calls]
  );
  const maxPutOI = useMemo(
    () => Math.max(...puts.map((p) => p.openInterest || 0), 1),
    [puts]
  );

  const strikeValues = useMemo(() => {
    const strikes = new Set<number>();
    calls.forEach((contract) => strikes.add(safeNumber(contract.strike)));
    puts.forEach((contract) => strikes.add(safeNumber(contract.strike)));
    return Array.from(strikes).sort((a, b) => a - b);
  }, [calls, puts]);

  const atmStrike = useMemo(() => {
    if (!strikeValues.length || !data?.underlying) return undefined;
    return strikeValues.reduce((prev, curr) =>
      Math.abs(curr - (data?.underlying || 0)) < Math.abs(prev - (data?.underlying || 0)) ? curr : prev
    );
  }, [strikeValues, data?.underlying]);

  const toggleLeg = (option: OptionContract, optionType: 'call' | 'put') => {
    const id = `${optionType}-${option.strike}`;
    const exists = selectedLegs.find((leg) => leg.id === id);
    if (exists) {
      setSelectedLegs((prev) => prev.filter((leg) => leg.id !== id));
      return;
    }
    const premium = Number.isFinite(option.lastPrice) ? option.lastPrice : 0;
    setSelectedLegs((prev) => [
      ...prev,
      {
        id,
        optionType,
        strike: option.strike,
        side: 'buy',
        quantity: 1,
        premium,
      },
    ]);
  };

  const updateLeg = (id: string, updates: Partial<SelectedLeg>) => {
    setSelectedLegs((prev) =>
      prev.map((leg) => (leg.id === id ? { ...leg, ...updates } : leg))
    );
  };

  const payoffData = useMemo(() => {
    if (!selectedLegs.length) return [];
    if (!strikeValues.length) return [];

    const strikes = selectedLegs
      .map((leg) => safeNumber(leg.strike))
      .filter((s) => Number.isFinite(s))
      .sort((a, b) => a - b);
    const allStrikes = [...new Set([...strikes, ...strikeValues].map((s) => safeNumber(s)).filter(Number.isFinite))].sort((a, b) => a - b);
    if (!allStrikes.length) return [];

    const atm = atmStrike ?? allStrikes[Math.floor(allStrikes.length / 2)];
    const base = safeNumber(data?.underlying, atm);

    const minGap = allStrikes.reduce((gap, strike, idx) => {
      if (idx === 0) return gap;
      const prev = allStrikes[idx - 1];
      return Math.min(gap, Math.abs(strike - prev));
    }, Number.POSITIVE_INFINITY);

    const step = Math.max(
      10,
      Number.isFinite(minGap) && minGap > 0 ? minGap : Math.max(10, Math.abs(base || atm || 100) * 0.05)
    );

    const center = base || atm;
    const start = Math.max(0.01, center - step * 8);
    const end = center + step * 8;

    const priceArray: number[] = [];
    for (let p = start; p <= end; p += step) {
      priceArray.push(Number(p.toFixed(2)));
    }
    // ensure key strikes and spot included
    strikes.forEach((s) => priceArray.push(Number(s.toFixed(2))));
    priceArray.push(Number(center.toFixed(2)));

    // de-dup and sort
    const sortedPrices = Array.from(new Set(priceArray.filter(Number.isFinite))).sort((a, b) => a - b);

    const maxOi = Math.max(maxCallOI, maxPutOI, 1);

    const sanitized = sortedPrices.map((price) => {
      const profit = selectedLegs.reduce((acc, leg) => {
        const intrinsic =
          leg.optionType === 'call'
            ? Math.max(0, price - leg.strike)
            : Math.max(0, leg.strike - price);
        const side = leg.side === 'buy' ? 1 : -1;
        const premium = Number.isFinite(leg.premium) ? leg.premium : 0;
        const qty = Number.isFinite(leg.quantity) ? leg.quantity : 0;
        return acc + side * qty * (intrinsic - premium);
      }, 0);

      // Use nearest strike OI so the bars are meaningful even when price doesn't match strike exactly
      const nearestStrike = strikeValues.reduce(
        (closest, s) => (Math.abs(s - price) < Math.abs(closest - price) ? s : closest),
        strikeValues[0] || price
      );
      const callOi = callMap.get(nearestStrike)?.openInterest || 0;
      const putOi = putMap.get(nearestStrike)?.openInterest || 0;

      return {
        price: Number.isFinite(price) ? Number(price.toFixed(2)) : 0,
        profit: Number.isFinite(profit) ? Number(profit.toFixed(2)) : 0,
        callOi: callOi && Number.isFinite(callOi) ? Math.max(0, callOi / maxOi) : 0,
        putOi: putOi && Number.isFinite(putOi) ? Math.max(0, putOi / maxOi) : 0,
      };
    });

    return sanitized
      .filter((p) => Number.isFinite(p.price) && Number.isFinite(p.profit))
      .sort((a, b) => a.price - b.price);
  }, [selectedLegs, data?.underlying, callMap, maxCallOI, maxPutOI, putMap, strikeValues, atmStrike]);

  const payoffRange = useMemo(() => {
    if (!payoffData.length) return null;
    const prices = payoffData.map((p) => p.price);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    return { min, max };
  }, [payoffData]);

  const hasPayoff = selectedLegs.length > 0 && payoffData.length > 0;

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!symbolInput.trim()) return;
    const nextSymbol = symbolInput.trim().toUpperCase();
    setSymbol(nextSymbol);
    setSelectedExpiry(undefined);
    refetch();
  };

  const handleExpiryChange = (value: string) => {
    setSelectedExpiry(value);
  };

  return (
    <div className="h-full flex flex-col bg-card">
      <div className="px-3 py-1.5 border-b border-border bg-gradient-to-r from-background to-muted/30 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-[11px] uppercase tracking-wide font-semibold text-foreground">
              Nifty Option Chain
            </span>
            {data?.underlying && (
              <Badge variant="outline" className="text-[10px]">
                Spot {formatNumber(data.underlying, 2)}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6 hover-elevate"
              onClick={() => refetch()}
              disabled={isFetching}
              title="Refresh"
            >
              <RefreshCw className={cn('w-4 h-4', isFetching && 'animate-spin')} />
            </Button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-wrap gap-3 items-center">
          <div className="flex items-center gap-2 rounded-lg border border-border px-2 py-1 bg-card">
            <Input
              value={symbolInput}
              onChange={(event) => setSymbolInput(event.target.value)}
              placeholder="Symbol or Index"
              className="h-8 w-40 text-xs uppercase"
            />
            <Button type="submit" size="sm" className="h-8 text-xs flex items-center gap-1">
              <Search className="w-3 h-3" />
              Load
            </Button>
          </div>

          <div className="flex items-center gap-2 rounded-lg border border-border px-2 py-1 bg-card">
            <span className="text-[10px] text-muted-foreground uppercase">Expiry</span>
            <Select
              value={selectedExpiry || data?.expiry || undefined}
              onValueChange={handleExpiryChange}
              disabled={!data?.availableExpiries?.length}
            >
              <SelectTrigger className="h-8 w-40 text-xs">
                <SelectValue placeholder={data?.expiry || 'Select expiry'} />
              </SelectTrigger>
              <SelectContent>
                {data?.availableExpiries?.map((expiryValue) => (
                  <SelectItem key={expiryValue} value={expiryValue}>
                    {expiryValue}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </form>
      </div>

      <div
        className={cn(
          'flex-1 grid gap-3 p-3 overflow-hidden',
          hasPayoff ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1'
        )}
      >
        <div className="overflow-hidden border border-border rounded-xl bg-card/80 backdrop-blur shadow">
          {isLoading ? (
            <div className="h-full flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : strikeValues.length === 0 ? (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
              No option chain data available for {symbol.toUpperCase()}
            </div>
          ) : (
            <div className="h-full overflow-auto scrollbar-hide">
              <table className="w-full text-left text-[11px]">
                <thead className="bg-muted/70 sticky top-0 z-10 backdrop-blur-sm">
                  <tr>
                    <th className="px-3 py-2 text-muted-foreground text-[10px] uppercase">Δ</th>
                    <th className="px-3 py-2 text-muted-foreground text-[10px] uppercase">Call LTP</th>
                    <th className="px-3 py-2 text-muted-foreground text-[10px] uppercase">Call OI</th>
                    <th className="px-3 py-2 text-muted-foreground text-[10px] uppercase text-center">Strike</th>
                    <th className="px-3 py-2 text-muted-foreground text-[10px] uppercase text-center">IV</th>
                    <th className="px-3 py-2 text-muted-foreground text-[10px] uppercase">Put OI</th>
                    <th className="px-3 py-2 text-muted-foreground text-[10px] uppercase">Put LTP</th>
                    <th className="px-3 py-2 text-muted-foreground text-[10px] uppercase text-right">Δ</th>
                  </tr>
                </thead>
                <tbody>
                  {strikeValues.map((strike) => {
                    const call = callMap.get(strike);
                    const put = putMap.get(strike);
                    const callLeg = selectedLegs.find(
                      (leg) => leg.optionType === 'call' && leg.strike === strike
                    );
                    const putLeg = selectedLegs.find(
                      (leg) => leg.optionType === 'put' && leg.strike === strike
                    );
                    const isAtm = atmStrike !== undefined && strike === atmStrike;
                    return (
                      <tr
                        key={strike}
                        className={cn(
                          'border-t border-border hover:bg-muted/40',
                          isAtm && 'bg-lime-100/80'
                        )}
                      >
                        <td className="px-2 py-1.5 align-middle text-right text-muted-foreground w-14">
                          {call?.delta !== undefined ? formatNumber(call.delta, 2) : '-'}
                        </td>
                        <td
                          className={cn(
                            'px-2 py-1.5 align-middle w-28 text-right font-mono',
                            callLeg ? 'bg-primary/10' : 'bg-amber-50/50'
                          )}
                          onClick={() => call && toggleLeg(call, 'call')}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span>{call ? formatNumber(call.lastPrice) : '-'}</span>
                            {callLeg && (
                              <div className="inline-flex rounded border border-border overflow-hidden">
                                <Button
                                  size="icon"
                                  variant={callLeg.side === 'buy' ? 'default' : 'ghost'}
                                  className="h-5 w-6 text-[9px]"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    updateLeg(`call-${strike}`, { side: 'buy' });
                                  }}
                                >
                                  B
                                </Button>
                                <Button
                                  size="icon"
                                  variant={callLeg.side === 'sell' ? 'destructive' : 'ghost'}
                                  className="h-5 w-6 text-[9px]"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    updateLeg(`call-${strike}`, { side: 'sell' });
                                  }}
                                >
                                  S
                                </Button>
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-2 py-1.5 align-middle w-28">
                          <div className="h-2 rounded-full bg-muted overflow-hidden">
                            <div
                              className="h-full bg-red-200"
                              style={{
                                width: `${Math.min(100, (call?.openInterest || 0) / maxCallOI * 100)}%`,
                              }}
                            />
                          </div>
                        </td>
                        <td className="px-2 py-1.5 align-middle text-center w-16">
                          <span className="text-[12px] font-mono font-semibold text-primary">{strike.toFixed(0)}</span>
                        </td>
                        <td className="px-2 py-1.5 align-middle text-center w-16">
                          {call?.impliedVolatility
                            ? formatNumber(call.impliedVolatility, 1)
                            : put?.impliedVolatility
                            ? formatNumber(put.impliedVolatility, 1)
                            : '-'}
                        </td>
                        <td className="px-2 py-1.5 align-middle w-28">
                          <div className="h-2 rounded-full bg-muted overflow-hidden">
                            <div
                              className="h-full bg-emerald-200"
                              style={{
                                width: `${Math.min(100, (put?.openInterest || 0) / maxPutOI * 100)}%`,
                              }}
                            />
                          </div>
                        </td>
                        <td
                          className={cn(
                            'px-2 py-1.5 align-middle w-28 text-left font-mono',
                            putLeg ? 'bg-primary/10' : 'bg-emerald-50/50'
                          )}
                          onClick={() => put && toggleLeg(put, 'put')}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span>{put ? formatNumber(put.lastPrice) : '-'}</span>
                            {putLeg && (
                              <div className="inline-flex rounded border border-border overflow-hidden">
                                <Button
                                  size="icon"
                                  variant={putLeg.side === 'buy' ? 'default' : 'ghost'}
                                  className="h-5 w-6 text-[9px]"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    updateLeg(`put-${strike}`, { side: 'buy' });
                                  }}
                                >
                                  B
                                </Button>
                                <Button
                                  size="icon"
                                  variant={putLeg.side === 'sell' ? 'destructive' : 'ghost'}
                                  className="h-5 w-6 text-[9px]"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    updateLeg(`put-${strike}`, { side: 'sell' });
                                  }}
                                >
                                  S
                                </Button>
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-2 py-1.5 align-middle text-right text-muted-foreground w-14">
                          {put?.delta !== undefined ? formatNumber(put.delta, 2) : '-'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {hasPayoff && (
        <div className="flex flex-col gap-3">
          {selectedLegs.length > 0 && (
            <>
              <div className="border border-border rounded-xl p-3 bg-card/80 backdrop-blur flex flex-col gap-2 shadow">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs uppercase text-muted-foreground">Payoff</div>
                    <div className="text-sm font-semibold">
                      {symbol.toUpperCase()} {selectedExpiry || ''}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-[10px]"
                      onClick={() => setSelectedLegs([])}
                    >
                      <X className="w-3 h-3 mr-1" />
                      Clear legs
                    </Button>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {selectedLegs.map((leg) => (
                    <Badge key={leg.id} variant="secondary" className="text-[10px] flex items-center gap-2">
                      {leg.side === 'buy' ? 'B' : 'S'} {leg.optionType.toUpperCase()} {leg.strike} @ {formatNumber(leg.premium, 2)} x{leg.quantity}
                      <button
                        className="text-muted-foreground hover:text-foreground"
                        onClick={() => setSelectedLegs((prev) => prev.filter((l) => l.id !== leg.id))}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              </div>

              <div className="border border-border rounded-xl p-3 bg-card shadow" style={{ height: 400 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={payoffData} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--muted))" />
                    <XAxis
                      dataKey="price"
                      type="number"
                      allowDecimals={false}
                      domain={
                        payoffRange ? [Math.max(0, payoffRange.min), payoffRange.max] : ['auto', 'auto']
                      }
                      tickFormatter={(v) => `${v}`}
                    />
                    <YAxis
                      yAxisId="profit"
                      tickFormatter={(v) => `${Number(v) > 0 ? '+' : ''}${Number(v).toFixed(0)}`}
                      allowDecimals={false}
                    />
                    <YAxis yAxisId="oi" orientation="right" hide domain={[0, 1]} />
                    <RechartsTooltip
                      contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))' }}
                      labelFormatter={(label) => `Price: ${label}`}
                      formatter={(value, name) => {
                        if (name === 'profit') return [`${Number(value).toFixed(0)}`, 'P/L'];
                        if (name === 'callOi') return [`${(Number(value) * maxCallOI).toFixed(0)}`, 'Call OI'];
                        if (name === 'putOi') return [`${(Number(value) * maxPutOI).toFixed(0)}`, 'Put OI'];
                        return [value, name];
                      }}
                    />
                    <Bar dataKey="callOi" yAxisId="oi" fill="rgba(239,68,68,0.3)" />
                    <Bar dataKey="putOi" yAxisId="oi" fill="rgba(16,185,129,0.35)" />
                    <Line
                      type="monotone"
                      dataKey="profit"
                      yAxisId="profit"
                      stroke="hsl(var(--primary))"
                      strokeWidth={2}
                      dot={false}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
        </div>
        )}
      </div>
    </div>
  );
}
