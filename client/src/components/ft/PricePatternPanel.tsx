import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Search, TrendingUp, TrendingDown, Activity, ChevronDown } from 'lucide-react';

interface PricePattern {
  id: string;
  symbol: string;
  companyName: string;
  patternType: string;
  confidence: number;
  detectedAt: string;
  direction: 'bullish' | 'bearish' | 'neutral';
  signalStrength: number;
  description: string;
}

const pricePatternTypes = [
  'all',
  'Gap Up',
  'Gap Down',
  'Strong Bullish Candle',
  'Strong Bearish Candle',
  'Consecutive Green Candles',
  'Consecutive Red Candles',
  'Near Day High',
  'Near Day Low',
  'Breakout above Previous Day High',
  'Breakdown below Previous Day Low',
];

const timeframes = [
  { value: '1D', label: '1 Day' },
  { value: '5D', label: '5 Days' },
  { value: '1M', label: '1 Month' },
  { value: '3M', label: '3 Months' },
];

function getDirectionIcon(direction: PricePattern['direction']) {
  switch (direction) {
    case 'bullish':
      return <TrendingUp className="w-4 h-4 text-green-500" />;
    case 'bearish':
      return <TrendingDown className="w-4 h-4 text-red-500" />;
    default:
      return <Activity className="w-4 h-4 text-yellow-500" />;
  }
}

function getConfidenceColor(confidence: number) {
  if (confidence >= 85) return 'text-green-500';
  if (confidence >= 70) return 'text-yellow-500';
  return 'text-red-500';
}

export function PricePatternPanel() {
  const [patternType, setPatternType] = useState('all');
  const [timeframe, setTimeframe] = useState('1D');
  const [minConfidence, setMinConfidence] = useState([70]);
  const [symbolFilter, setSymbolFilter] = useState('');
  const [submittedSymbolFilter, setSubmittedSymbolFilter] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const params = new URLSearchParams({
    pattern: patternType,
    timeframe,
    confidence: String(minConfidence[0]),
  });
  if (submittedSymbolFilter.trim()) {
    params.set('symbol', submittedSymbolFilter.trim());
  }

  const { data: patterns = [], isLoading, refetch } = useQuery<PricePattern[]>({
    queryKey: [`/api/price-pattern-search?${params.toString()}`],
  });

  return (
    <div className="h-full flex flex-col bg-card p-2">
      <Card className="p-2 mb-2 bg-card/50 border-primary/20">
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Pattern Type</Label>
              <Select value={patternType} onValueChange={setPatternType}>
                <SelectTrigger data-testid="select-price-pattern-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {pricePatternTypes.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type === 'all' ? 'All Patterns' : type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs">Timeframe</Label>
              <Select value={timeframe} onValueChange={setTimeframe}>
                <SelectTrigger data-testid="select-price-pattern-timeframe">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {timeframes.map((tf) => (
                    <SelectItem key={tf.value} value={tf.value}>
                      {tf.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <Label className="text-xs">Minimum Confidence</Label>
              <span className="text-sm font-mono text-primary">{minConfidence[0]}%</span>
            </div>
            <Slider
              value={minConfidence}
              onValueChange={setMinConfidence}
              min={50}
              max={100}
              step={5}
              className="w-full"
              data-testid="slider-price-pattern-confidence"
            />
          </div>

          <div className="flex gap-2">
            <Input
              placeholder="Filter by symbol or company..."
              value={symbolFilter}
              onChange={(event) => setSymbolFilter(event.target.value)}
              className="flex-1"
              data-testid="input-price-pattern-symbol-filter"
            />
            <Button
              data-testid="button-price-pattern-search"
              onClick={() => {
                setSubmittedSymbolFilter(symbolFilter);
                refetch();
              }}
            >
              <Search className="w-4 h-4 mr-1" />
              Search
            </Button>
          </div>
        </div>
      </Card>

      <Card className="flex-1 p-4 bg-card/50 border-primary/20 overflow-hidden">
        <div className="mb-2 text-sm text-muted-foreground">
          Found {patterns.length} patterns
        </div>
        <ScrollArea className="h-[calc(100%-2rem)]">
          {isLoading ? (
            <div className="text-center py-4 text-muted-foreground">Searching for price patterns...</div>
          ) : patterns.length === 0 ? (
            <div className="text-center py-4 text-muted-foreground">No patterns found</div>
          ) : (
            <div className="space-y-2 pr-2">
              {patterns.map((pattern) => {
                const isExpanded = expandedId === pattern.id;
                return (
                  <Card
                    key={pattern.id}
                    data-testid={`price-pattern-${pattern.id}`}
                    className={`transition-colors ${
                      isExpanded ? 'bg-primary/5 border-primary' : 'hover:bg-primary/5'
                    }`}
                  >
                    <button
                      type="button"
                      className="w-full text-left p-3 cursor-pointer"
                      onClick={() => setExpandedId(isExpanded ? null : pattern.id)}
                    >
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold">{pattern.symbol}</span>
                            <Badge variant="outline" className="text-[10px]">
                              {pattern.patternType}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-2">
                            {getDirectionIcon(pattern.direction)}
                            <ChevronDown
                              className={`w-4 h-4 text-muted-foreground transition-transform ${
                                isExpanded ? 'rotate-180' : ''
                              }`}
                            />
                          </div>
                        </div>
                        <div className="text-xs text-muted-foreground">{pattern.companyName}</div>
                        <div className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-4">
                            <span className={getConfidenceColor(pattern.confidence)}>
                              {pattern.confidence}% confidence
                            </span>
                            <span className="text-muted-foreground">
                              Signal strength: {pattern.signalStrength}%
                            </span>
                            <span className="text-muted-foreground font-mono">
                              {pattern.detectedAt}
                            </span>
                          </div>
                        </div>
                        <Progress value={pattern.confidence} className="h-1" />
                      </div>
                    </button>
                    {isExpanded && (
                      <div className="px-3 pb-3 border-t border-primary/20">
                        <div className="pt-3 space-y-2">
                          <div className="rounded border border-border bg-background p-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div>
                                <div className="text-sm font-semibold">{pattern.patternType}</div>
                                <div className="text-xs text-muted-foreground">{pattern.description}</div>
                              </div>
                              <Badge variant="outline" className="text-[10px]">
                                Live scan
                              </Badge>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </Card>
    </div>
  );
}
