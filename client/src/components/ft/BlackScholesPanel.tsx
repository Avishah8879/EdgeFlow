import { useState, useEffect, useMemo, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ScrollArea } from '@/components/ui/scroll-area';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as ChartTooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { Info, Save, Upload, TrendingUp, TrendingDown } from 'lucide-react';

type InstrumentType = 
  | 'long-call'
  | 'long-put'
  | 'straddle'
  | 'strangle'
  | 'call-spread'
  | 'put-spread'
  | 'iron-condor'
  | 'strip';

interface OptionInputs {
  stockPrice: number;
  strikePrice: number;
  lowerStrike: number;
  upperStrike: number;
  wingWidth: number;
  timeToExpiration: number; // in days
  riskFreeRate: number; // as percentage
  volatility: number; // as percentage
  instrumentType: InstrumentType;
}

interface Greeks {
  optionPrice: number;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  rho: number;
}

interface SavedScenario {
  id: string;
  name: string;
  inputs: OptionInputs;
  greeks: Greeks;
  timestamp: number;
}

interface OptionLeg {
  type: 'call' | 'put';
  strike: number;
  quantity: number;
  label: string;
}

const greekDescriptions = {
  delta: "Rate of change of option price with respect to stock price. Ranges from 0 to 1 for calls, -1 to 0 for puts.",
  gamma: "Rate of change of delta with respect to stock price. Measures the acceleration of option price changes.",
  theta: "Rate of time decay. Represents daily loss in option value due to passage of time.",
  vega: "Sensitivity to volatility changes. Shows price change for 1% change in implied volatility.",
  rho: "Sensitivity to interest rate changes. Shows price change for 1% change in risk-free rate.",
};

const defaultInputs: OptionInputs = {
  stockPrice: 100,
  strikePrice: 100,
  lowerStrike: 95,
  upperStrike: 105,
  wingWidth: 10,
  timeToExpiration: 30,
  riskFreeRate: 5,
  volatility: 20,
  instrumentType: 'long-call',
};

const withDefaults = (input: Partial<OptionInputs>): OptionInputs => ({
  ...defaultInputs,
  ...input,
  instrumentType: (input.instrumentType as InstrumentType) || defaultInputs.instrumentType,
  lowerStrike: input.lowerStrike ?? (input.strikePrice ?? defaultInputs.strikePrice) * 0.95,
  upperStrike: input.upperStrike ?? (input.strikePrice ?? defaultInputs.strikePrice) * 1.05,
  wingWidth: input.wingWidth ?? defaultInputs.wingWidth,
});

const getInstrumentLegs = (inputs: OptionInputs): OptionLeg[] => {
  const { instrumentType, strikePrice, lowerStrike, upperStrike, wingWidth } = inputs;
  switch (instrumentType) {
    case 'long-put':
      return [{ type: 'put', strike: strikePrice, quantity: 1, label: 'Long Put' }];
    case 'straddle':
      return [
        { type: 'call', strike: strikePrice, quantity: 1, label: 'Long Call' },
        { type: 'put', strike: strikePrice, quantity: 1, label: 'Long Put' },
      ];
    case 'strangle':
      return [
        { type: 'call', strike: upperStrike, quantity: 1, label: 'Long Call (upper strike)' },
        { type: 'put', strike: lowerStrike, quantity: 1, label: 'Long Put (lower strike)' },
      ];
    case 'call-spread':
      return [
        { type: 'call', strike: lowerStrike, quantity: 1, label: 'Long Call (lower strike)' },
        { type: 'call', strike: upperStrike, quantity: -1, label: 'Short Call (upper strike)' },
      ];
    case 'put-spread':
      return [
        { type: 'put', strike: upperStrike, quantity: 1, label: 'Long Put (upper strike)' },
        { type: 'put', strike: lowerStrike, quantity: -1, label: 'Short Put (lower strike)' },
      ];
    case 'iron-condor': {
      const wing = Math.max(wingWidth, 0.01);
      return [
        { type: 'put', strike: lowerStrike - wing, quantity: 1, label: 'Long Put Wing' },
        { type: 'put', strike: lowerStrike, quantity: -1, label: 'Short Put' },
        { type: 'call', strike: upperStrike, quantity: -1, label: 'Short Call' },
        { type: 'call', strike: upperStrike + wing, quantity: 1, label: 'Long Call Wing' },
      ];
    }
    case 'strip':
      return [
        { type: 'call', strike: strikePrice, quantity: 1, label: 'Long Call' },
        { type: 'put', strike: strikePrice, quantity: 2, label: 'Long Put x2' },
      ];
    case 'long-call':
    default:
      return [{ type: 'call', strike: strikePrice, quantity: 1, label: 'Long Call' }];
  }
};

export function BlackScholesPanel() {
  const [inputs, setInputs] = useState<OptionInputs>(defaultInputs);

  const [savedScenarios, setSavedScenarios] = useState<SavedScenario[]>([]);
  const [scenarioName, setScenarioName] = useState('');
  const [compareStrikes, setCompareStrikes] = useState<number[]>([90, 95, 100, 105, 110]);

  // Keep compare strikes centered around current strike for the compare tab
  useEffect(() => {
    const base = inputs.strikePrice || defaultInputs.strikePrice;
    const spacing = Math.max(1, Math.round(base * 0.05));
    const next = [-2, -1, 0, 1, 2].map((k) => {
      const val = Math.max(0.01, base + k * spacing);
      return Math.round(val * 100) / 100;
    });
    // Only update if changed to avoid render churn
    if (JSON.stringify(next) !== JSON.stringify(compareStrikes)) {
      setCompareStrikes(next);
    }
  }, [inputs.strikePrice, compareStrikes]);

  // Normal distribution functions
  const normalCDF = (x: number): number => {
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;

    const sign = x < 0 ? -1 : 1;
    x = Math.abs(x) / Math.sqrt(2.0);

    const t = 1.0 / (1.0 + p * x);
    const t2 = t * t;
    const t3 = t2 * t;
    const t4 = t3 * t;
    const t5 = t4 * t;
    const y = 1.0 - ((((a5 * t5 + a4 * t4) + a3 * t3) + a2 * t2) + a1 * t) * Math.exp(-x * x);

    return 0.5 * (1.0 + sign * y);
  };

  const normalPDF = (x: number): number => {
    return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
  };

  // Calculate Black-Scholes Greeks for a single leg
  const calculateLegGreeks = (optionInputs: OptionInputs, leg: OptionLeg): Greeks => {
    const { stockPrice, timeToExpiration, riskFreeRate, volatility } = optionInputs;
    const { strike, type } = leg;
    
    const S = Math.max(stockPrice, 0.0001);
    const K = Math.max(strike, 0.0001);
    const T = Math.max(timeToExpiration, 0.0001) / 365; // Convert days to years, avoid divide-by-zero
    const r = riskFreeRate / 100; // Convert percentage to decimal
    const sigma = Math.max(volatility, 0.0001) / 100; // Convert percentage to decimal

    const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
    const d2 = d1 - sigma * Math.sqrt(T);

    let optionPrice: number;
    let delta: number;
    let gamma: number;
    let theta: number;
    let vega: number;
    let rho: number;

    if (type === 'call') {
      optionPrice = S * normalCDF(d1) - K * Math.exp(-r * T) * normalCDF(d2);
      delta = normalCDF(d1);
      gamma = normalPDF(d1) / (S * sigma * Math.sqrt(T));
      theta = (-S * normalPDF(d1) * sigma / (2 * Math.sqrt(T)) - r * K * Math.exp(-r * T) * normalCDF(d2)) / 365;
      vega = S * normalPDF(d1) * Math.sqrt(T) / 100; // Divide by 100 for 1% volatility change
      rho = K * T * Math.exp(-r * T) * normalCDF(d2) / 100; // Divide by 100 for 1% rate change
    } else {
      optionPrice = K * Math.exp(-r * T) * normalCDF(-d2) - S * normalCDF(-d1);
      delta = normalCDF(d1) - 1;
      gamma = normalPDF(d1) / (S * sigma * Math.sqrt(T));
      theta = (-S * normalPDF(d1) * sigma / (2 * Math.sqrt(T)) + r * K * Math.exp(-r * T) * normalCDF(-d2)) / 365;
      vega = S * normalPDF(d1) * Math.sqrt(T) / 100;
      rho = -K * T * Math.exp(-r * T) * normalCDF(-d2) / 100;
    }

    return {
      optionPrice: Math.max(0, optionPrice),
      delta,
      gamma,
      theta,
      vega,
      rho,
    };
  };

  const aggregateGreeks = useCallback((optionInputs: OptionInputs): Greeks => {
    const instrumentLegs = getInstrumentLegs(optionInputs);
    const legsWithMetrics = instrumentLegs.map((leg) => ({
      ...leg,
      greeks: calculateLegGreeks(optionInputs, leg),
    }));

    return legsWithMetrics.reduce<Greeks>(
      (acc, leg) => ({
        optionPrice: acc.optionPrice + leg.greeks.optionPrice * leg.quantity,
        delta: acc.delta + leg.greeks.delta * leg.quantity,
        gamma: acc.gamma + leg.greeks.gamma * leg.quantity,
        theta: acc.theta + leg.greeks.theta * leg.quantity,
        vega: acc.vega + leg.greeks.vega * leg.quantity,
        rho: acc.rho + leg.greeks.rho * leg.quantity,
      }),
      { optionPrice: 0, delta: 0, gamma: 0, theta: 0, vega: 0, rho: 0 }
    );
  }, []);

  const legs = useMemo(() => getInstrumentLegs(inputs), [inputs]);

  const legsWithGreeks = useMemo(() => {
    return legs.map((leg) => ({
      ...leg,
      greeks: calculateLegGreeks(inputs, leg),
    }));
  }, [inputs, legs]);

  const liveIntrinsic = useMemo(() => {
    return legsWithGreeks.reduce((acc, leg) => {
      const intrinsic = leg.type === 'call'
        ? Math.max(0, inputs.stockPrice - leg.strike)
        : Math.max(0, leg.strike - inputs.stockPrice);
      return acc + leg.quantity * intrinsic;
    }, 0);
  }, [inputs.stockPrice, legsWithGreeks]);

  const greeks = useMemo(() => aggregateGreeks(inputs), [aggregateGreeks, inputs]);

  // Generate payoff diagram data
  const payoffData = useMemo(() => {
    const strikes = legsWithGreeks.map((leg) => leg.strike);
    const allStrikes = [inputs.strikePrice, inputs.lowerStrike, inputs.upperStrike, ...strikes]
      .filter((s) => Number.isFinite(s));
    const sorted = [...new Set(allStrikes)].sort((a, b) => a - b);
    const minGap = sorted.reduce((gap, strike, idx) => {
      if (idx === 0) return gap;
      return Math.min(gap, strike - sorted[idx - 1]);
    }, Number.POSITIVE_INFINITY);
    const spacing = Math.max(0.5, Number.isFinite(minGap) && minGap > 0 ? minGap : inputs.strikePrice * 0.05);
    const atm = inputs.strikePrice || 1;

    const prices: number[] = [];
    for (let i = -8; i <= 8; i++) {
      const priceLevel = Math.max(0.01, atm + i * spacing);
      prices.push(priceLevel);
    }
    // Always include current underlying price to keep reference line in view
    if (Number.isFinite(inputs.stockPrice)) {
      prices.push(Math.max(0.01, inputs.stockPrice));
    }

    const uniquePrices = Array.from(new Set(prices)).sort((a, b) => a - b);

    return uniquePrices.map((price) => {
      const { profit, intrinsic } = legsWithGreeks.reduce(
        (acc, leg) => {
          const intrinsicValue = leg.type === 'call'
            ? Math.max(0, price - leg.strike)
            : Math.max(0, leg.strike - price);
          acc.intrinsic += intrinsicValue * leg.quantity;
          acc.profit += leg.quantity * (intrinsicValue - leg.greeks.optionPrice);
          return acc;
        },
        { profit: 0, intrinsic: 0 }
      );

      return {
        price: parseFloat(price.toFixed(2)),
        intrinsicValue: parseFloat(intrinsic.toFixed(2)),
        profit: parseFloat(profit.toFixed(2)),
      };
    });
  }, [inputs, legsWithGreeks]);

  // Generate sensitivity analysis
  const sensitivityData = useMemo(() => {
    const data = [];
    
    // Vary stock price from -20% to +20%
    for (let i = -20; i <= 20; i += 2) {
      const modifiedInputs = {
        ...inputs,
        stockPrice: inputs.stockPrice * (1 + i / 100),
      };
      const modifiedGreeks = aggregateGreeks(modifiedInputs);
      
      data.push({
        priceChange: i,
        optionPrice: modifiedGreeks.optionPrice,
        delta: modifiedGreeks.delta,
      });
    }
    
    return data;
  }, [aggregateGreeks, inputs]);

  // Compare multiple strikes
  const strikeComparison = useMemo(() => {
    const lowerOffset = inputs.lowerStrike - inputs.strikePrice;
    const upperOffset = inputs.upperStrike - inputs.strikePrice;
    return compareStrikes.map((strike) => {
      const modifiedInputs: OptionInputs = { 
        ...inputs, 
        strikePrice: strike,
        lowerStrike: strike + lowerOffset,
        upperStrike: strike + upperOffset,
      };
      const greeks = aggregateGreeks(modifiedInputs);
      return {
        strike,
        ...greeks,
      };
    });
  }, [inputs, compareStrikes, aggregateGreeks]);

  const handleInputChange = (field: keyof OptionInputs, value: string | number) => {
    setInputs((prev) => {
      if (field === 'instrumentType') {
        return { ...prev, instrumentType: value as InstrumentType };
      }
      return {
        ...prev,
        [field]: typeof value === 'string' ? parseFloat(value) || 0 : value,
      };
    });
  };

  const handleSaveScenario = () => {
    if (!scenarioName) return;
    
    const newScenario: SavedScenario = {
      id: Date.now().toString(),
      name: scenarioName,
      inputs: { ...inputs },
      greeks: { ...greeks },
      timestamp: Date.now(),
    };
    
    const next = [...savedScenarios, newScenario];
    setSavedScenarios(next);
    setScenarioName('');
    
    // Save to localStorage
    localStorage.setItem('blackscholes-scenarios', JSON.stringify(next));
  };

  const handleLoadScenario = (scenario: SavedScenario) => {
    setInputs(withDefaults(scenario.inputs));
  };

  // Load saved scenarios on mount
  useEffect(() => {
    const saved = localStorage.getItem('blackscholes-scenarios');
    if (saved) {
      const parsed: SavedScenario[] = JSON.parse(saved);
      setSavedScenarios(parsed.map((scenario) => ({
        ...scenario,
        inputs: withDefaults(scenario.inputs),
      })));
    }
  }, []);

  return (
    <TooltipProvider>
      <div className="h-full bg-card p-2">
        <Tabs defaultValue="calculator" className="h-full">
          <TabsList className="grid w-full grid-cols-4 mb-2">
            <TabsTrigger value="calculator" data-testid="tab-calculator">Calculator</TabsTrigger>
            <TabsTrigger value="payoff" data-testid="tab-payoff">Payoff Diagram</TabsTrigger>
            <TabsTrigger value="sensitivity" data-testid="tab-sensitivity">Sensitivity</TabsTrigger>
            <TabsTrigger value="compare" data-testid="tab-compare">Compare Strikes</TabsTrigger>
          </TabsList>

          <TabsContent value="calculator" className="h-[calc(100%-48px)]">
            <div className="grid grid-cols-2 gap-2 h-full">
              {/* Inputs */}
              <Card className="p-2 bg-card/50 border-primary/20">
                <h3 className="text-sm font-semibold mb-2 text-primary">Input Parameters</h3>
                <div className="space-y-2">
                  <div>
                    <Label className="text-xs">Instrument Type</Label>
                    <Select
                      value={inputs.instrumentType}
                      onValueChange={(value: InstrumentType) => handleInputChange('instrumentType', value)}
                    >
                      <SelectTrigger data-testid="select-instrument-type">
                        <SelectValue placeholder="Select strategy" />
                      </SelectTrigger>
                      <SelectContent position="popper" className="z-50">
                        <SelectItem value="long-call">Long Call</SelectItem>
                        <SelectItem value="long-put">Long Put</SelectItem>
                        <SelectItem value="straddle">Long Straddle</SelectItem>
                        <SelectItem value="strangle">Long Strangle</SelectItem>
                        <SelectItem value="call-spread">Call Spread</SelectItem>
                        <SelectItem value="put-spread">Put Spread</SelectItem>
                        <SelectItem value="iron-condor">Iron Condor</SelectItem>
                        <SelectItem value="strip">Strip (1C/2P)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-xs">Underlying Price</Label>
                      <Input
                        type="number"
                        value={inputs.stockPrice}
                        onChange={(e) => handleInputChange('stockPrice', e.target.value)}
                        data-testid="input-stock-price"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Strike Price</Label>
                      <Input
                        type="number"
                        value={inputs.strikePrice}
                        onChange={(e) => handleInputChange('strikePrice', e.target.value)}
                        data-testid="input-strike-price"
                      />
                    </div>
                  </div>

                  <div>
                    <Label className="text-xs">Time to Expiration (days)</Label>
                    <Input
                      type="number"
                      value={inputs.timeToExpiration}
                      onChange={(e) => handleInputChange('timeToExpiration', e.target.value)}
                      data-testid="input-time-to-expiration"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-xs">Risk-Free Rate (%)</Label>
                      <Input
                        type="number"
                        value={inputs.riskFreeRate}
                        onChange={(e) => handleInputChange('riskFreeRate', e.target.value)}
                        data-testid="input-risk-free-rate"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Volatility (%)</Label>
                      <Input
                        type="number"
                        value={inputs.volatility}
                        onChange={(e) => handleInputChange('volatility', e.target.value)}
                        data-testid="input-volatility"
                      />
                    </div>
                  </div>

                  {(inputs.instrumentType === 'strangle' || inputs.instrumentType === 'call-spread' || inputs.instrumentType === 'put-spread' || inputs.instrumentType === 'iron-condor') && (
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label className="text-xs">Lower Strike</Label>
                        <Input
                          type="number"
                          value={inputs.lowerStrike}
                          onChange={(e) => handleInputChange('lowerStrike', e.target.value)}
                          data-testid="input-lower-strike"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Upper Strike</Label>
                        <Input
                          type="number"
                          value={inputs.upperStrike}
                          onChange={(e) => handleInputChange('upperStrike', e.target.value)}
                          data-testid="input-upper-strike"
                        />
                      </div>
                    </div>
                  )}

                  {inputs.instrumentType === 'iron-condor' && (
                    <div>
                      <Label className="text-xs">Wing Width (distance from short strikes)</Label>
                      <Input
                        type="number"
                        value={inputs.wingWidth}
                        onChange={(e) => handleInputChange('wingWidth', e.target.value)}
                        data-testid="input-wing-width"
                      />
                    </div>
                  )}

                  {/* Save/Load Scenarios */}
                  <div className="pt-4 border-t border-primary/30">
                    <div className="flex gap-2 mb-2">
                      <Input
                        placeholder="Scenario name..."
                        value={scenarioName}
                        onChange={(e) => setScenarioName(e.target.value)}
                        className="flex-1"
                        data-testid="input-scenario-name"
                      />
                      <Button size="sm" onClick={handleSaveScenario} data-testid="button-save-scenario">
                        <Save className="w-4 h-4" />
                      </Button>
                    </div>
                    {savedScenarios.length > 0 && (
                      <div className="space-y-1">
                        <Label className="text-xs">Saved Scenarios</Label>
                        <ScrollArea className="h-20">
                          {savedScenarios.map((scenario) => (
                            <Button
                              key={scenario.id}
                              size="sm"
                              variant="ghost"
                              className="w-full justify-start text-xs"
                              onClick={() => handleLoadScenario(scenario)}
                              data-testid={`button-load-${scenario.id}`}
                            >
                              <Upload className="w-3 h-3 mr-1" />
                              {scenario.name}
                            </Button>
                          ))}
                        </ScrollArea>
                      </div>
                    )}
                  </div>
                </div>
              </Card>

              {/* Outputs */}
              <Card className="p-4 bg-card/50 border-primary/20">
                <h3 className="text-sm font-semibold mb-4 text-primary">Instrument Price & Greeks</h3>
                <div className="space-y-4">
                  {/* Option Price */}
                  <Card className="p-3 bg-black/50 border-primary/30">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Net Premium</span>
                      <span className="text-2xl font-mono font-bold text-primary" data-testid="output-premium">
                        {greeks.optionPrice.toFixed(2)}
                      </span>
                    </div>
                  </Card>

                  {/* Greeks */}
                  <div className="space-y-3">
                    {Object.entries(greeks).filter(([key]) => key !== 'optionPrice').map(([key, value]) => (
                      <div key={key} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-sm capitalize">{key}</span>
                          <Tooltip>
                            <TooltipTrigger>
                              <Info className="w-3 h-3 text-muted-foreground" />
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs">
                              <p className="text-xs">{greekDescriptions[key as keyof typeof greekDescriptions]}</p>
                            </TooltipContent>
                          </Tooltip>
                        </div>
                        <span
                          className={`font-mono text-sm ${
                            value > 0 ? 'text-green-500' : value < 0 ? 'text-red-500' : 'text-muted-foreground'
                          }`}
                          data-testid={`output-${key}`}
                        >
                          {value.toFixed(4)}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Moneyness Indicator */}
                  <Card className="p-3 bg-background border-primary/30">
                    <div className="text-xs text-muted-foreground mb-1">Moneyness</div>
                    <div className="flex items-center gap-2">
                      {inputs.stockPrice > inputs.strikePrice ? (
                        <>
                          <TrendingUp className="w-4 h-4 text-green-500" />
                          <span className="text-sm text-green-500">Underlying above ATM strike</span>
                        </>
                      ) : inputs.stockPrice < inputs.strikePrice ? (
                        <>
                          <TrendingDown className="w-4 h-4 text-red-500" />
                          <span className="text-sm text-red-500">Underlying below ATM strike</span>
                        </>
                      ) : (
                        <>
                          <div className="w-4 h-4 bg-yellow-500 rounded-full" />
                          <span className="text-sm text-yellow-500">At the Money (ATM)</span>
                        </>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Net intrinsic (all legs): {liveIntrinsic.toFixed(2)}
                    </div>
                  </Card>

                  <Card className="p-3 bg-background border-primary/30">
                    <div className="text-xs text-muted-foreground mb-2">Leg Breakdown</div>
                    <div className="space-y-1">
                      {legsWithGreeks.map((leg, idx) => (
                        <div key={`${leg.label}-${idx}`} className="flex justify-between text-xs">
                          <span className="text-muted-foreground">
                            {leg.quantity > 0 ? 'Long' : 'Short'} {leg.type.toUpperCase()} @ {leg.strike}
                          </span>
                          <span className="font-mono text-foreground">
                            Premium { (leg.greeks.optionPrice * leg.quantity).toFixed(2) }
                          </span>
                        </div>
                      ))}
                    </div>
                  </Card>
                </div>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="payoff" className="h-[calc(100%-60px)]">
            <Card className="h-full p-4 bg-card/50 border-primary/20">
              <h3 className="text-sm font-semibold mb-4 text-primary">Payoff Diagram at Expiration</h3>
              <ResponsiveContainer width="100%" height="90%">
                <LineChart data={payoffData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis
                    dataKey="price"
                    stroke="#9ca3af"
                    tick={{ fontSize: 10 }}
                    label={{ value: 'Stock Price', position: 'insideBottom', offset: -5 }}
                  />
                  <YAxis
                    stroke="#9ca3af"
                    tick={{ fontSize: 10 }}
                    label={{ value: 'Profit/Loss', angle: -90, position: 'insideLeft' }}
                  />
                  <ReferenceLine
                    x={inputs.stockPrice}
                    stroke="#f97316"
                    strokeDasharray="4 4"
                    label={{ value: 'Underlying Price', position: 'insideTop', fill: '#f97316', fontSize: 10 }}
                  />
                  <ChartTooltip
                    contentStyle={{
                      backgroundColor: '#1f2937',
                      border: '1px solid #374151',
                      borderRadius: '4px'
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="profit"
                    stroke="#10b981"
                    strokeWidth={2}
                    dot={false}
                    name="P&L"
                  />
                  <Line
                    type="monotone"
                    dataKey="intrinsicValue"
                    stroke="#3b82f6"
                    strokeWidth={1}
                    strokeDasharray="5 5"
                    dot={false}
                    name="Intrinsic Value"
                  />
                </LineChart>
              </ResponsiveContainer>
            </Card>
          </TabsContent>

          <TabsContent value="sensitivity" className="h-[calc(100%-60px)]">
            <Card className="h-full p-4 bg-card/50 border-primary/20">
              <h3 className="text-sm font-semibold mb-4 text-primary">Price Sensitivity Analysis</h3>
              <ResponsiveContainer width="100%" height="90%">
                <LineChart data={sensitivityData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis
                    dataKey="priceChange"
                    stroke="#9ca3af"
                    tick={{ fontSize: 10 }}
                    tickFormatter={(value) => `${value}%`}
                    label={{ value: 'Stock Price Change (%)', position: 'insideBottom', offset: -5 }}
                  />
                  <YAxis
                    yAxisId="price"
                    stroke="#9ca3af"
                    tick={{ fontSize: 10 }}
                    label={{ value: 'Option Price', angle: -90, position: 'insideLeft' }}
                  />
                  <YAxis
                    yAxisId="delta"
                    orientation="right"
                    stroke="#9ca3af"
                    tick={{ fontSize: 10 }}
                    label={{ value: 'Delta', angle: 90, position: 'insideRight' }}
                  />
                  <ChartTooltip
                    contentStyle={{
                      backgroundColor: '#1f2937',
                      border: '1px solid #374151',
                      borderRadius: '4px'
                    }}
                  />
                  <Line
                    yAxisId="price"
                    type="monotone"
                    dataKey="optionPrice"
                    stroke="#10b981"
                    strokeWidth={2}
                    dot={false}
                    name="Option Price"
                  />
                  <Line
                    yAxisId="delta"
                    type="monotone"
                    dataKey="delta"
                    stroke="#f59e0b"
                    strokeWidth={2}
                    dot={false}
                    name="Delta"
                  />
                </LineChart>
              </ResponsiveContainer>
            </Card>
          </TabsContent>

          <TabsContent value="compare" className="h-[calc(100%-60px)]">
            <Card className="h-full p-4 bg-card/50 border-primary/20">
              <h3 className="text-sm font-semibold mb-4 text-primary">Strike Price Comparison</h3>
              <ScrollArea className="h-[calc(100%-2rem)]">
                <table className="w-full text-sm">
                  <thead className="border-b border-primary/30">
                    <tr>
                      <th className="text-left p-2">Strike</th>
                      <th className="text-right p-2">Premium</th>
                      <th className="text-right p-2">Delta</th>
                      <th className="text-right p-2">Gamma</th>
                      <th className="text-right p-2">Theta</th>
                      <th className="text-right p-2">Vega</th>
                      <th className="text-right p-2">Rho</th>
                    </tr>
                  </thead>
                  <tbody>
                    {strikeComparison.map((row, index) => (
                      <tr
                        key={row.strike}
                        className={`border-b border-primary/10 ${
                          row.strike === inputs.strikePrice ? 'bg-primary/10' : ''
                        }`}
                      >
                        <td className="p-2 font-mono">{row.strike}</td>
                        <td className="p-2 text-right font-mono text-primary">
                          {row.optionPrice.toFixed(2)}
                        </td>
                        <td className={`p-2 text-right font-mono ${
                          row.delta > 0 ? 'text-green-500' : 'text-red-500'
                        }`}>
                          {row.delta.toFixed(4)}
                        </td>
                        <td className="p-2 text-right font-mono text-yellow-500">
                          {row.gamma.toFixed(4)}
                        </td>
                        <td className={`p-2 text-right font-mono ${
                          row.theta < 0 ? 'text-red-500' : 'text-green-500'
                        }`}>
                          {row.theta.toFixed(4)}
                        </td>
                        <td className="p-2 text-right font-mono text-blue-500">
                          {row.vega.toFixed(4)}
                        </td>
                        <td className={`p-2 text-right font-mono ${
                          row.rho > 0 ? 'text-green-500' : 'text-red-500'
                        }`}>
                          {row.rho.toFixed(4)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ScrollArea>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </TooltipProvider>
  );
}
