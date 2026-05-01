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
import { PatternChartExpansion } from '@/components/ft/pattern-search/PatternChartExpansion';

interface KeyPoint {
  ts: string;
  price: number;
  label: string;
}

interface Pattern {
  id: string;
  symbol: string;
  companyName: string;
  patternType: string;
  confidence: number;
  startDate: string;
  endDate: string;
  breakoutDirection: 'bullish' | 'bearish' | 'neutral';
  successRate: number;
  description: string;
  keyPoints?: KeyPoint[];
}

const patternTypes = [
  'all',
  'Head and Shoulders',
  'Inverse Head and Shoulders',
  'Double Top',
  'Double Bottom',
  'Triple Top',
  'Triple Bottom',
  'Ascending Triangle',
  'Descending Triangle',
  'Symmetric Triangle',
  'Bullish Flag',
  'Bearish Flag',
  'Pennant',
  'Cup and Handle',
  'Rising Wedge',
  'Falling Wedge',
  'Ascending Channel',
  'Descending Channel',
  'Rounding Top',
  'Rounding Bottom',
];

const timeframes = [
  { value: '1D', label: '1 Day' },
  { value: '5D', label: '5 Days' },
  { value: '1M', label: '1 Month' },
  { value: '3M', label: '3 Months' },
];

export function PatternSearchPanel() {
  const [patternType, setPatternType] = useState('all');
  const [timeframe, setTimeframe] = useState('1M');
  const [minConfidence, setMinConfidence] = useState([70]);
  const [symbolFilter, setSymbolFilter] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Fetch pattern search results
  const { data: patterns = [], isLoading, refetch } = useQuery<Pattern[]>({
    queryKey: [`/api/pattern-search?pattern=${patternType}&timeframe=${timeframe}&confidence=${minConfidence[0]}`],
  });

  // Filter patterns by symbol
  const filteredPatterns = patterns.filter((pattern) => {
    if (!symbolFilter) return true;
    return pattern.symbol.toLowerCase().includes(symbolFilter.toLowerCase()) ||
           pattern.companyName.toLowerCase().includes(symbolFilter.toLowerCase());
  });

  const handleSearch = () => {
    refetch();
  };

  const getDirectionIcon = (direction: string) => {
    switch (direction) {
      case 'bullish':
        return <TrendingUp className="w-4 h-4 text-green-500" />;
      case 'bearish':
        return <TrendingDown className="w-4 h-4 text-red-500" />;
      default:
        return <Activity className="w-4 h-4 text-yellow-500" />;
    }
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 85) return 'text-green-500';
    if (confidence >= 70) return 'text-yellow-500';
    return 'text-red-500';
  };

  return (
    <div className="h-full flex flex-col bg-card p-2">
      {/* Search Controls */}
      <Card className="p-2 mb-2 bg-card/50 border-primary/20">
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            {/* Pattern Type */}
            <div>
              <Label className="text-xs">Pattern Type</Label>
              <Select value={patternType} onValueChange={setPatternType}>
                <SelectTrigger data-testid="select-pattern-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {patternTypes.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type === 'all' ? 'All Patterns' : type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Timeframe */}
            <div>
              <Label className="text-xs">Timeframe</Label>
              <Select value={timeframe} onValueChange={setTimeframe}>
                <SelectTrigger data-testid="select-timeframe">
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

          {/* Confidence Slider */}
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
              data-testid="slider-confidence"
            />
          </div>

          {/* Symbol Filter */}
          <div className="flex gap-2">
            <Input
              placeholder="Filter by symbol or company..."
              value={symbolFilter}
              onChange={(e) => setSymbolFilter(e.target.value)}
              className="flex-1"
              data-testid="input-symbol-filter"
            />
            <Button onClick={handleSearch} data-testid="button-search">
              <Search className="w-4 h-4 mr-1" />
              Search
            </Button>
          </div>
        </div>
      </Card>

      {/* Results */}
      <Card className="flex-1 p-4 bg-card/50 border-primary/20 overflow-hidden">
        <div className="mb-2 text-sm text-muted-foreground">
          Found {filteredPatterns.length} patterns
        </div>
        <ScrollArea className="h-[calc(100%-2rem)]">
          {isLoading ? (
            <div className="text-center py-4 text-muted-foreground">Searching for patterns...</div>
          ) : filteredPatterns.length === 0 ? (
            <div className="text-center py-4 text-muted-foreground">No patterns found</div>
          ) : (
            <div className="space-y-2 pr-2">
              {filteredPatterns.map((pattern) => {
                const isExpanded = expandedId === pattern.id;
                return (
                  <Card
                    key={pattern.id}
                    data-testid={`pattern-${pattern.id}`}
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
                            {getDirectionIcon(pattern.breakoutDirection)}
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
                              Success rate: {pattern.successRate}%
                            </span>
                            <span className="text-muted-foreground font-mono">
                              {pattern.startDate} → {pattern.endDate}
                            </span>
                          </div>
                        </div>
                        <Progress value={pattern.confidence} className="h-1" />
                      </div>
                    </button>
                    {isExpanded && (
                      <div className="px-3 pb-3 border-t border-primary/20">
                        <div className="pt-3">
                          <PatternChartExpansion pattern={pattern} />
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