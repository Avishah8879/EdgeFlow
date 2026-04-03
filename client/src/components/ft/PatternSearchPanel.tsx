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
import { Search, TrendingUp, TrendingDown, Activity } from 'lucide-react';

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
}

const patternTypes = [
  'all',
  'Head and Shoulders',
  'Double Top',
  'Double Bottom',
  'Ascending Triangle',
  'Descending Triangle',
  'Symmetric Triangle',
  'Flag',
  'Pennant',
  'Cup and Handle',
  'Wedge',
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
  const [selectedPattern, setSelectedPattern] = useState<Pattern | null>(null);

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

  const renderPatternPreview = (pattern: Pattern) => {
    // Simple ASCII art representations of patterns
    const patternArt: Record<string, string[]> = {
      'Head and Shoulders': [
        '      ∧',
        '     / \\',
        '    /   \\    ∧',
        '   /     \\  / \\',
        '  /       \\/   \\___',
      ],
      'Double Top': [
        '    ∧     ∧',
        '   / \\   / \\',
        '  /   \\ /   \\',
        ' /     V     \\___',
      ],
      'Double Bottom': [
        ' ___     ___',
        '    \\   /   /',
        '     \\ /   /',
        '      V   /',
        '         /',
      ],
      'Ascending Triangle': [
        '    _____',
        '   /|',
        '  / |',
        ' /  |',
        '/___|',
      ],
      'Cup and Handle': [
        '\\             /‾\\',
        ' \\           /  |',
        '  \\         /   |',
        '   \\_______/    |',
      ],
      'Flag': [
        '      /',
        '     /═══',
        '    /════',
        '   /═════',
        '  /',
      ],
    };

    const art = patternArt[pattern.patternType] || [
      '  ?',
      ' /?\\',
      '  |',
      '  Pattern',
    ];

    return (
      <div className="font-mono text-xs text-primary/60 leading-tight">
        {art.map((line, i) => (
          <div key={i}>{line}</div>
        ))}
      </div>
    );
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
        <div className="h-full flex gap-4">
          {/* Pattern List */}
          <div className="flex-1">
            <div className="mb-2 text-sm text-muted-foreground">
              Found {filteredPatterns.length} patterns
            </div>
            <ScrollArea className="h-[calc(100%-2rem)]">
              {isLoading ? (
                <div className="text-center py-4 text-muted-foreground">Searching for patterns...</div>
              ) : filteredPatterns.length === 0 ? (
                <div className="text-center py-4 text-muted-foreground">No patterns found</div>
              ) : (
                <div className="space-y-2">
                  {filteredPatterns.map((pattern) => (
                    <Card
                      key={pattern.id}
                      data-testid={`pattern-${pattern.id}`}
                      className={`p-3 cursor-pointer transition-colors ${
                        selectedPattern?.id === pattern.id ? 'bg-primary/10 border-primary' : 'hover:bg-primary/5'
                      }`}
                      onClick={() => setSelectedPattern(pattern)}
                    >
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold">{pattern.symbol}</span>
                            <Badge variant="outline" className="text-[10px]">
                              {pattern.patternType}
                            </Badge>
                          </div>
                          {getDirectionIcon(pattern.breakoutDirection)}
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
                          </div>
                        </div>
                        <Progress value={pattern.confidence} className="h-1" />
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>

          {/* Pattern Details */}
          {selectedPattern && (
            <Card className="w-80 p-4 bg-black/50 border-primary/30">
              <div className="space-y-4">
                <div>
                  <h3 className="font-bold text-lg text-primary">
                    {selectedPattern.symbol} - {selectedPattern.patternType}
                  </h3>
                  <p className="text-sm text-muted-foreground">{selectedPattern.companyName}</p>
                </div>

                {/* Pattern Visualization */}
                <div className="p-4 bg-background rounded border border-primary/20">
                  {renderPatternPreview(selectedPattern)}
                </div>

                {/* Pattern Info */}
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Confidence:</span>
                    <span className={`font-mono ${getConfidenceColor(selectedPattern.confidence)}`}>
                      {selectedPattern.confidence}%
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Period:</span>
                    <span className="font-mono">
                      {selectedPattern.startDate} to {selectedPattern.endDate}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Direction:</span>
                    <div className="flex items-center gap-1">
                      {getDirectionIcon(selectedPattern.breakoutDirection)}
                      <span className="capitalize">{selectedPattern.breakoutDirection}</span>
                    </div>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Historical Success:</span>
                    <span className="font-mono">{selectedPattern.successRate}%</span>
                  </div>
                </div>

                {/* Description */}
                <div className="pt-2 border-t border-primary/30">
                  <p className="text-sm text-muted-foreground">
                    {selectedPattern.description}
                  </p>
                </div>
              </div>
            </Card>
          )}
        </div>
      </Card>
    </div>
  );
}