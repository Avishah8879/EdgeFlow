import { useState, useEffect, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as ChartTooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { Info, Save, Upload } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getCSSColor } from '@/lib/theme-utils';

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
  dividendYield: number; // as percentage
  lotSize: number;
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

interface LegMath extends Greeks {
  d1: number;
  d2: number;
  Nd1: number;
  Nd2: number;
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
  delta:
    'Rate of change of option price with respect to stock price. Ranges from 0 to 1 for calls, -1 to 0 for puts.',
  gamma:
    'Rate of change of delta with respect to stock price. Measures the acceleration of option price changes.',
  theta:
    'Rate of time decay. Represents daily loss in option value due to passage of time.',
  vega:
    'Sensitivity to volatility changes. Shows price change for 1% change in implied volatility.',
  rho: 'Sensitivity to interest rate changes. Shows price change for 1% change in risk-free rate.',
};

const defaultInputs: OptionInputs = {
  stockPrice: 22418,
  strikePrice: 22500,
  lowerStrike: 22000,
  upperStrike: 23000,
  wingWidth: 200,
  timeToExpiration: 11,
  riskFreeRate: 6.84,
  volatility: 14.2,
  dividendYield: 0.32,
  lotSize: 50,
  instrumentType: 'long-call',
};

const withDefaults = (input: Partial<OptionInputs>): OptionInputs => ({
  ...defaultInputs,
  ...input,
  instrumentType:
    (input.instrumentType as InstrumentType) || defaultInputs.instrumentType,
  lowerStrike:
    input.lowerStrike ??
    (input.strikePrice ?? defaultInputs.strikePrice) * 0.95,
  upperStrike:
    input.upperStrike ??
    (input.strikePrice ?? defaultInputs.strikePrice) * 1.05,
  wingWidth: input.wingWidth ?? defaultInputs.wingWidth,
  dividendYield: input.dividendYield ?? defaultInputs.dividendYield,
  lotSize: input.lotSize ?? defaultInputs.lotSize,
});

const getInstrumentLegs = (inputs: OptionInputs): OptionLeg[] => {
  const { instrumentType, strikePrice, lowerStrike, upperStrike, wingWidth } =
    inputs;
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

// ─── Math helpers ────────────────────────────────────────────────────────────

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
  const y =
    1.0 -
    ((((a5 * t5 + a4 * t4) + a3 * t3) + a2 * t2) + a1 * t) * Math.exp(-x * x);

  return 0.5 * (1.0 + sign * y);
};

const normalPDF = (x: number): number =>
  Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);

// Calculate Black-Scholes-Merton math (with dividend yield q) for a single leg.
function calculateLegMath(
  optionInputs: OptionInputs,
  leg: OptionLeg,
): LegMath {
  const { stockPrice, timeToExpiration, riskFreeRate, volatility, dividendYield } =
    optionInputs;
  const { strike, type } = leg;

  const S = Math.max(stockPrice, 0.0001);
  const K = Math.max(strike, 0.0001);
  const T = Math.max(timeToExpiration, 0.0001) / 365;
  const r = riskFreeRate / 100;
  const q = (dividendYield ?? 0) / 100;
  const sigma = Math.max(volatility, 0.0001) / 100;

  const d1 =
    (Math.log(S / K) + (r - q + 0.5 * sigma * sigma) * T) /
    (sigma * Math.sqrt(T));
  const d2 = d1 - sigma * Math.sqrt(T);

  const eqT = Math.exp(-q * T);
  const erT = Math.exp(-r * T);

  let optionPrice: number;
  let delta: number;
  const gamma = (eqT * normalPDF(d1)) / (S * sigma * Math.sqrt(T));
  let theta: number;
  const vega = (S * eqT * normalPDF(d1) * Math.sqrt(T)) / 100;
  let rho: number;

  if (type === 'call') {
    optionPrice = S * eqT * normalCDF(d1) - K * erT * normalCDF(d2);
    delta = eqT * normalCDF(d1);
    theta =
      ((-S * eqT * normalPDF(d1) * sigma) / (2 * Math.sqrt(T)) -
        r * K * erT * normalCDF(d2) +
        q * S * eqT * normalCDF(d1)) /
      365;
    rho = (K * T * erT * normalCDF(d2)) / 100;
  } else {
    optionPrice = K * erT * normalCDF(-d2) - S * eqT * normalCDF(-d1);
    delta = eqT * (normalCDF(d1) - 1);
    theta =
      ((-S * eqT * normalPDF(d1) * sigma) / (2 * Math.sqrt(T)) +
        r * K * erT * normalCDF(-d2) -
        q * S * eqT * normalCDF(-d1)) /
      365;
    rho = (-K * T * erT * normalCDF(-d2)) / 100;
  }

  return {
    optionPrice: Math.max(0, optionPrice),
    delta,
    gamma,
    theta,
    vega,
    rho,
    d1,
    d2,
    Nd1: normalCDF(d1),
    Nd2: normalCDF(d2),
  };
}

// Newton-Raphson IV solver — invert Black-Scholes price for sigma given a
// target market price. Returns sigma in % units, or null if no convergence.
function solveImpliedVol(
  inputs: OptionInputs,
  marketPrice: number,
): number | null {
  const legs = getInstrumentLegs(inputs);
  let sigma = inputs.volatility / 100;
  for (let i = 0; i < 50; i++) {
    const trial: OptionInputs = { ...inputs, volatility: sigma * 100 };
    const totalPrice = legs.reduce(
      (sum, leg) => sum + calculateLegMath(trial, leg).optionPrice * leg.quantity,
      0,
    );
    const totalVega = legs.reduce(
      (sum, leg) => sum + calculateLegMath(trial, leg).vega * leg.quantity * 100,
      0,
    );
    const diff = totalPrice - marketPrice;
    if (Math.abs(diff) < 0.0001) return sigma * 100;
    if (Math.abs(totalVega) < 1e-8) return null;
    sigma = sigma - diff / totalVega;
    if (sigma <= 0 || sigma > 5 || !isFinite(sigma)) return null;
  }
  return null;
}

// ─── UI primitives ───────────────────────────────────────────────────────────

function SliderField({
  label,
  value,
  display,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  display: string;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[10.5px] font-bold uppercase tracking-uppercase text-muted-foreground">
          {label}
        </span>
        <span className="font-mono text-[13px] font-bold tabular-nums text-foreground">
          {display}
        </span>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(v) => onChange(v[0])}
      />
    </div>
  );
}

// ─── Panel ───────────────────────────────────────────────────────────────────

export function BlackScholesPanel() {
  const [inputs, setInputs] = useState<OptionInputs>(defaultInputs);
  const [marketPrice, setMarketPrice] = useState<string>('');

  const [savedScenarios, setSavedScenarios] = useState<SavedScenario[]>([]);
  const [scenarioName, setScenarioName] = useState('');
  const [compareStrikes, setCompareStrikes] = useState<number[]>([
    22000, 22250, 22500, 22750, 23000,
  ]);

  // Theme-aware chart colors
  const chartColors = useMemo(
    () => ({
      grid: getCSSColor('--border'),
      axis: getCSSColor('--muted-foreground'),
      tooltipBg: getCSSColor('--card'),
      tooltipBorder: getCSSColor('--border'),
      tooltipText: getCSSColor('--foreground'),
      gold: getCSSColor('--brand-gold'),
      navy: getCSSColor('--brand-navy'),
      negative: getCSSColor('--negative'),
      positive: getCSSColor('--positive'),
      sky: getCSSColor('--brand-sky'),
    }),
    [],
  );

  // Keep compare strikes centered around current strike
  useEffect(() => {
    const base = inputs.strikePrice || defaultInputs.strikePrice;
    const spacing = Math.max(1, Math.round(base * 0.025));
    const next = [-2, -1, 0, 1, 2].map((k) => {
      const val = Math.max(0.01, base + k * spacing);
      return Math.round(val * 100) / 100;
    });
    if (JSON.stringify(next) !== JSON.stringify(compareStrikes)) {
      setCompareStrikes(next);
    }
  }, [inputs.strikePrice, compareStrikes]);

  const aggregateGreeks = useCallback((optionInputs: OptionInputs): Greeks => {
    const instrumentLegs = getInstrumentLegs(optionInputs);
    return instrumentLegs.reduce<Greeks>(
      (acc, leg) => {
        const m = calculateLegMath(optionInputs, leg);
        return {
          optionPrice: acc.optionPrice + m.optionPrice * leg.quantity,
          delta: acc.delta + m.delta * leg.quantity,
          gamma: acc.gamma + m.gamma * leg.quantity,
          theta: acc.theta + m.theta * leg.quantity,
          vega: acc.vega + m.vega * leg.quantity,
          rho: acc.rho + m.rho * leg.quantity,
        };
      },
      { optionPrice: 0, delta: 0, gamma: 0, theta: 0, vega: 0, rho: 0 },
    );
  }, []);

  const legs = useMemo(() => getInstrumentLegs(inputs), [inputs]);

  const legsWithMath = useMemo(
    () =>
      legs.map((leg) => ({
        ...leg,
        math: calculateLegMath(inputs, leg),
      })),
    [inputs, legs],
  );

  const greeks = useMemo(
    () => aggregateGreeks(inputs),
    [aggregateGreeks, inputs],
  );

  const isSingleLeg = legsWithMath.length === 1;
  const primaryLeg = legsWithMath[0];

  const liveIntrinsic = useMemo(
    () =>
      legsWithMath.reduce((acc, leg) => {
        const intrinsic =
          leg.type === 'call'
            ? Math.max(0, inputs.stockPrice - leg.strike)
            : Math.max(0, leg.strike - inputs.stockPrice);
        return acc + leg.quantity * intrinsic;
      }, 0),
    [inputs.stockPrice, legsWithMath],
  );

  const timeValue = greeks.optionPrice - liveIntrinsic;

  // Mispricing vs market
  const marketPriceNum = parseFloat(marketPrice);
  const mispricing =
    Number.isFinite(marketPriceNum) && marketPriceNum > 0
      ? greeks.optionPrice - marketPriceNum
      : null;

  // ── Price-vs-underlying chart data ──────────────────────────────────────
  const priceVsUnderlyingData = useMemo(() => {
    const atm = inputs.strikePrice || 1;
    const span = atm * 0.15;
    const points: Array<{ price: number; theoretical: number; intrinsic: number }> =
      [];
    for (let i = -20; i <= 20; i++) {
      const price = atm + (i / 20) * span;
      const trial: OptionInputs = { ...inputs, stockPrice: price };
      const trialLegs = getInstrumentLegs(trial);
      const theoretical = trialLegs.reduce(
        (sum, leg) =>
          sum + calculateLegMath(trial, leg).optionPrice * leg.quantity,
        0,
      );
      const intrinsic = trialLegs.reduce((sum, leg) => {
        const v =
          leg.type === 'call'
            ? Math.max(0, price - leg.strike)
            : Math.max(0, leg.strike - price);
        return sum + v * leg.quantity;
      }, 0);
      points.push({
        price: parseFloat(price.toFixed(2)),
        theoretical: parseFloat(theoretical.toFixed(2)),
        intrinsic: parseFloat(intrinsic.toFixed(2)),
      });
    }
    return points;
  }, [inputs]);

  // ── Theta decay vs DTE chart data ───────────────────────────────────────
  const thetaDecayData = useMemo(() => {
    const points: Array<{ dte: number; price: number }> = [];
    const maxDte = Math.max(90, inputs.timeToExpiration);
    const stepCount = 30;
    for (let i = 1; i <= stepCount; i++) {
      const dte = (maxDte / stepCount) * i;
      const trial: OptionInputs = { ...inputs, timeToExpiration: dte };
      const trialLegs = getInstrumentLegs(trial);
      const price = trialLegs.reduce(
        (sum, leg) =>
          sum + calculateLegMath(trial, leg).optionPrice * leg.quantity,
        0,
      );
      points.push({ dte: parseFloat(dte.toFixed(1)), price: parseFloat(price.toFixed(2)) });
    }
    return points;
  }, [inputs]);

  // ── Payoff data (kept from existing) ────────────────────────────────────
  const payoffData = useMemo(() => {
    const strikes = legsWithMath.map((leg) => leg.strike);
    const allStrikes = [
      inputs.strikePrice,
      inputs.lowerStrike,
      inputs.upperStrike,
      ...strikes,
    ].filter((s) => Number.isFinite(s));
    const sorted = [...new Set(allStrikes)].sort((a, b) => a - b);
    const minGap = sorted.reduce((gap, strike, idx) => {
      if (idx === 0) return gap;
      return Math.min(gap, strike - sorted[idx - 1]);
    }, Number.POSITIVE_INFINITY);
    const spacing = Math.max(
      0.5,
      Number.isFinite(minGap) && minGap > 0 ? minGap : inputs.strikePrice * 0.05,
    );
    const atm = inputs.strikePrice || 1;

    const prices: number[] = [];
    for (let i = -8; i <= 8; i++) {
      prices.push(Math.max(0.01, atm + i * spacing));
    }
    if (Number.isFinite(inputs.stockPrice)) {
      prices.push(Math.max(0.01, inputs.stockPrice));
    }
    const uniquePrices = Array.from(new Set(prices)).sort((a, b) => a - b);

    return uniquePrices.map((price) => {
      const { profit, intrinsic } = legsWithMath.reduce(
        (acc, leg) => {
          const intrinsicValue =
            leg.type === 'call'
              ? Math.max(0, price - leg.strike)
              : Math.max(0, leg.strike - price);
          acc.intrinsic += intrinsicValue * leg.quantity;
          acc.profit += leg.quantity * (intrinsicValue - leg.math.optionPrice);
          return acc;
        },
        { profit: 0, intrinsic: 0 },
      );

      return {
        price: parseFloat(price.toFixed(2)),
        intrinsicValue: parseFloat(intrinsic.toFixed(2)),
        profit: parseFloat(profit.toFixed(2)),
      };
    });
  }, [inputs, legsWithMath]);

  // ── Sensitivity (kept) ──────────────────────────────────────────────────
  const sensitivityData = useMemo(() => {
    const data = [];
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

  // ── Compare strikes (kept) ──────────────────────────────────────────────
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
      return { strike, ...greeks };
    });
  }, [inputs, compareStrikes, aggregateGreeks]);

  // ── Handlers ────────────────────────────────────────────────────────────
  const updateInput = <K extends keyof OptionInputs>(key: K, value: OptionInputs[K]) =>
    setInputs((prev) => ({ ...prev, [key]: value }));

  const handleSolveIv = () => {
    if (!Number.isFinite(marketPriceNum) || marketPriceNum <= 0) return;
    const solved = solveImpliedVol(inputs, marketPriceNum);
    if (solved && solved > 0 && solved < 500) {
      updateInput('volatility', parseFloat(solved.toFixed(2)));
    }
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
    localStorage.setItem('blackscholes-scenarios', JSON.stringify(next));
  };

  const handleLoadScenario = (scenario: SavedScenario) =>
    setInputs(withDefaults(scenario.inputs));

  // Load saved scenarios on mount
  useEffect(() => {
    const saved = localStorage.getItem('blackscholes-scenarios');
    if (saved) {
      const parsed: SavedScenario[] = JSON.parse(saved);
      setSavedScenarios(
        parsed.map((scenario) => ({
          ...scenario,
          inputs: withDefaults(scenario.inputs),
        })),
      );
    }
  }, []);

  // Conditional UI flags
  const showStrikeRange =
    inputs.instrumentType === 'strangle' ||
    inputs.instrumentType === 'call-spread' ||
    inputs.instrumentType === 'put-spread' ||
    inputs.instrumentType === 'iron-condor';
  const showWingWidth = inputs.instrumentType === 'iron-condor';

  // Derived display values
  const fmt = (n: number, d = 2) =>
    n.toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d });
  const lotPremium = greeks.optionPrice * inputs.lotSize;

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <TooltipProvider>
      <div className="h-full bg-background">
        <Tabs defaultValue="calculator" className="h-full flex flex-col">
          <div className="border-b border-border bg-card px-4 md:px-8">
            <TabsList className="bg-transparent p-0 h-auto">
              <TabsTrigger
                value="calculator"
                data-testid="tab-calculator"
                className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-[hsl(var(--brand-gold))] data-[state=active]:text-[hsl(var(--brand-navy))] dark:data-[state=active]:text-[hsl(var(--brand-gold))] rounded-none h-10 px-4"
              >
                Calculator
              </TabsTrigger>
              <TabsTrigger
                value="payoff"
                data-testid="tab-payoff"
                className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-[hsl(var(--brand-gold))] data-[state=active]:text-[hsl(var(--brand-navy))] dark:data-[state=active]:text-[hsl(var(--brand-gold))] rounded-none h-10 px-4"
              >
                Payoff diagram
              </TabsTrigger>
              <TabsTrigger
                value="sensitivity"
                data-testid="tab-sensitivity"
                className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-[hsl(var(--brand-gold))] data-[state=active]:text-[hsl(var(--brand-navy))] dark:data-[state=active]:text-[hsl(var(--brand-gold))] rounded-none h-10 px-4"
              >
                Sensitivity
              </TabsTrigger>
              <TabsTrigger
                value="compare"
                data-testid="tab-compare"
                className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-[hsl(var(--brand-gold))] data-[state=active]:text-[hsl(var(--brand-navy))] dark:data-[state=active]:text-[hsl(var(--brand-gold))] rounded-none h-10 px-4"
              >
                Compare strikes
              </TabsTrigger>
            </TabsList>
          </div>

          {/* ─── CALCULATOR TAB — matches reference layout ───────────── */}
          <TabsContent
            value="calculator"
            className="flex-1 m-0 overflow-hidden data-[state=inactive]:hidden"
          >
            <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] h-full">
              {/* ─── Sidebar: Inputs ────────────────────────────────── */}
              <aside className="border-r border-border bg-card overflow-y-auto p-5">
                <h3 className="font-display text-[15px] font-bold tracking-tight text-[hsl(var(--brand-navy))] dark:text-foreground mb-4">
                  Inputs
                </h3>

                <div className="space-y-4">
                  {/* Strategy / instrument type */}
                  <div className="space-y-1.5">
                    <Label className="text-[10.5px] font-bold uppercase tracking-uppercase text-muted-foreground">
                      Strategy
                    </Label>
                    <Select
                      value={inputs.instrumentType}
                      onValueChange={(value: InstrumentType) =>
                        updateInput('instrumentType', value)
                      }
                    >
                      <SelectTrigger
                        data-testid="select-instrument-type"
                        className="h-9"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent position="popper" className="z-50">
                        <SelectItem value="long-call">Long call</SelectItem>
                        <SelectItem value="long-put">Long put</SelectItem>
                        <SelectItem value="straddle">Long straddle</SelectItem>
                        <SelectItem value="strangle">Long strangle</SelectItem>
                        <SelectItem value="call-spread">Call spread</SelectItem>
                        <SelectItem value="put-spread">Put spread</SelectItem>
                        <SelectItem value="iron-condor">Iron condor</SelectItem>
                        <SelectItem value="strip">Strip (1C/2P)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <SliderField
                    label={`Spot price (S)`}
                    value={inputs.stockPrice}
                    display={fmt(inputs.stockPrice, 2)}
                    min={Math.max(1, inputs.strikePrice * 0.5)}
                    max={inputs.strikePrice * 1.5}
                    step={0.01}
                    onChange={(v) => updateInput('stockPrice', v)}
                  />

                  <SliderField
                    label={`Strike (K)`}
                    value={inputs.strikePrice}
                    display={fmt(inputs.strikePrice, 2)}
                    min={Math.max(1, inputs.stockPrice * 0.5)}
                    max={inputs.stockPrice * 1.5}
                    step={0.01}
                    onChange={(v) => updateInput('strikePrice', v)}
                  />

                  <SliderField
                    label="Days to expiry (T)"
                    value={inputs.timeToExpiration}
                    display={`${inputs.timeToExpiration.toFixed(0)}d`}
                    min={1}
                    max={365}
                    step={1}
                    onChange={(v) => updateInput('timeToExpiration', v)}
                  />

                  <SliderField
                    label="Implied vol (σ)"
                    value={inputs.volatility}
                    display={`${fmt(inputs.volatility, 2)}%`}
                    min={1}
                    max={150}
                    step={0.1}
                    onChange={(v) => updateInput('volatility', v)}
                  />

                  <SliderField
                    label="Risk-free rate (r)"
                    value={inputs.riskFreeRate}
                    display={`${fmt(inputs.riskFreeRate, 2)}%`}
                    min={0}
                    max={15}
                    step={0.01}
                    onChange={(v) => updateInput('riskFreeRate', v)}
                  />

                  <SliderField
                    label="Dividend yield (q)"
                    value={inputs.dividendYield}
                    display={`${fmt(inputs.dividendYield, 2)}%`}
                    min={0}
                    max={10}
                    step={0.01}
                    onChange={(v) => updateInput('dividendYield', v)}
                  />

                  {showStrikeRange && (
                    <>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1.5">
                          <Label className="text-[10.5px] font-bold uppercase tracking-uppercase text-muted-foreground">
                            Lower K
                          </Label>
                          <Input
                            type="number"
                            value={inputs.lowerStrike}
                            onChange={(e) =>
                              updateInput('lowerStrike', parseFloat(e.target.value) || 0)
                            }
                            data-testid="input-lower-strike"
                            className="h-9 font-mono"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-[10.5px] font-bold uppercase tracking-uppercase text-muted-foreground">
                            Upper K
                          </Label>
                          <Input
                            type="number"
                            value={inputs.upperStrike}
                            onChange={(e) =>
                              updateInput('upperStrike', parseFloat(e.target.value) || 0)
                            }
                            data-testid="input-upper-strike"
                            className="h-9 font-mono"
                          />
                        </div>
                      </div>
                      {showWingWidth && (
                        <div className="space-y-1.5">
                          <Label className="text-[10.5px] font-bold uppercase tracking-uppercase text-muted-foreground">
                            Wing width
                          </Label>
                          <Input
                            type="number"
                            value={inputs.wingWidth}
                            onChange={(e) =>
                              updateInput('wingWidth', parseFloat(e.target.value) || 0)
                            }
                            data-testid="input-wing-width"
                            className="h-9 font-mono"
                          />
                        </div>
                      )}
                    </>
                  )}

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1.5">
                      <Label className="text-[10.5px] font-bold uppercase tracking-uppercase text-muted-foreground">
                        Lot size
                      </Label>
                      <Input
                        type="number"
                        value={inputs.lotSize}
                        onChange={(e) =>
                          updateInput('lotSize', parseFloat(e.target.value) || 0)
                        }
                        className="h-9 font-mono"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[10.5px] font-bold uppercase tracking-uppercase text-muted-foreground">
                        Market px (opt)
                      </Label>
                      <Input
                        type="number"
                        placeholder="—"
                        value={marketPrice}
                        onChange={(e) => setMarketPrice(e.target.value)}
                        className="h-9 font-mono"
                      />
                    </div>
                  </div>

                  <Button
                    onClick={handleSolveIv}
                    disabled={!Number.isFinite(marketPriceNum) || marketPriceNum <= 0}
                    className="w-full h-9 bg-[hsl(var(--brand-navy))] text-white hover:bg-[hsl(var(--brand-navy))]/90"
                  >
                    Solve for IV
                  </Button>

                  {/* Saved scenarios */}
                  <div className="pt-3 border-t border-border space-y-2">
                    <div className="flex gap-2">
                      <Input
                        placeholder="Scenario name…"
                        value={scenarioName}
                        onChange={(e) => setScenarioName(e.target.value)}
                        className="flex-1 h-9 text-xs"
                        data-testid="input-scenario-name"
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-9 px-2.5"
                        onClick={handleSaveScenario}
                        data-testid="button-save-scenario"
                      >
                        <Save className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                    {savedScenarios.length > 0 && (
                      <div className="space-y-1">
                        <Label className="text-[10.5px] font-bold uppercase tracking-uppercase text-muted-foreground">
                          Saved
                        </Label>
                        <ScrollArea className="h-24">
                          {savedScenarios.map((scenario) => (
                            <Button
                              key={scenario.id}
                              size="sm"
                              variant="ghost"
                              className="w-full justify-start text-xs h-8"
                              onClick={() => handleLoadScenario(scenario)}
                              data-testid={`button-load-${scenario.id}`}
                            >
                              <Upload className="w-3 h-3 mr-1.5" />
                              {scenario.name}
                            </Button>
                          ))}
                        </ScrollArea>
                      </div>
                    )}
                  </div>
                </div>
              </aside>

              {/* ─── Main: outputs + greeks + charts + formula ────── */}
              <section className="overflow-y-auto bg-background">
                <div className="max-w-5xl mx-auto p-6 md:p-8 space-y-5">
                  {/* Output cards: 2-col grid, featured price spans 2 cols */}
                  <div className="grid grid-cols-2 gap-3.5">
                    <div className="col-span-2 rounded-xl border-2 border-[hsl(var(--brand-gold))] bg-card p-5 shadow-card-lg">
                      <div className="text-[10.5px] font-bold uppercase tracking-uppercase text-muted-foreground">
                        Theoretical price ·{' '}
                        {isSingleLeg
                          ? primaryLeg.type === 'call'
                            ? 'Call'
                            : 'Put'
                          : 'Net premium'}
                      </div>
                      <div
                        className="font-mono text-[44px] md:text-[46px] font-bold tabular-nums leading-none mt-2 text-[hsl(var(--brand-gold))]"
                        data-testid="output-premium"
                      >
                        {fmt(greeks.optionPrice, 2)}
                      </div>
                      <div className="font-mono text-[11px] text-muted-foreground mt-2 tabular-nums">
                        Intrinsic {fmt(liveIntrinsic, 2)} · Time value{' '}
                        {fmt(timeValue, 2)} · Lot premium ₹
                        {Math.round(lotPremium).toLocaleString('en-IN')}
                      </div>
                    </div>

                    {/* Mispricing vs market (only when market price filled) */}
                    <div className="rounded-xl border border-border bg-card p-5">
                      <div className="text-[10.5px] font-bold uppercase tracking-uppercase text-muted-foreground">
                        Mispricing vs market
                      </div>
                      {mispricing != null ? (
                        <>
                          <div
                            className={cn(
                              'font-mono text-[32px] font-bold tabular-nums leading-none mt-1.5',
                              mispricing >= 0 ? 'text-positive' : 'text-negative',
                            )}
                          >
                            {mispricing >= 0 ? '+' : ''}
                            {fmt(mispricing, 2)}
                          </div>
                          <div className="font-mono text-[11px] text-muted-foreground mt-1.5 tabular-nums">
                            Market {fmt(marketPriceNum, 2)} · Theo{' '}
                            {fmt(greeks.optionPrice, 2)} ·{' '}
                            {mispricing < 0 ? 'underpriced' : 'overpriced'}
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="font-mono text-[32px] font-bold tabular-nums leading-none mt-1.5 text-muted-foreground/60">
                            —
                          </div>
                          <div className="text-[11px] text-muted-foreground mt-1.5">
                            Enter market price in sidebar to compare
                          </div>
                        </>
                      )}
                    </div>

                    {/* d1 / d2 — only meaningful for single-leg */}
                    <div className="rounded-xl border border-border bg-card p-5">
                      <div className="text-[10.5px] font-bold uppercase tracking-uppercase text-muted-foreground">
                        d1 / d2
                      </div>
                      {isSingleLeg && primaryLeg ? (
                        <>
                          <div className="font-mono text-[22px] font-bold tabular-nums leading-tight mt-1.5 text-foreground">
                            {primaryLeg.math.d1.toFixed(3)} /{' '}
                            {primaryLeg.math.d2.toFixed(3)}
                          </div>
                          <div className="font-mono text-[11px] text-muted-foreground mt-1.5 tabular-nums">
                            N(d1) = {primaryLeg.math.Nd1.toFixed(4)} · N(d2) ={' '}
                            {primaryLeg.math.Nd2.toFixed(4)}
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="font-mono text-[22px] font-bold tabular-nums leading-tight mt-1.5 text-muted-foreground/60">
                            —
                          </div>
                          <div className="text-[11px] text-muted-foreground mt-1.5">
                            Multi-leg strategy — see leg breakdown below
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Greeks row — 5 columns */}
                  <div className="rounded-xl border border-border bg-card p-5 grid grid-cols-2 sm:grid-cols-5 gap-0">
                    {[
                      { key: 'delta', symbol: 'Δ', label: 'Delta', value: greeks.delta, decimals: 4, unit: '' },
                      { key: 'gamma', symbol: 'Γ', label: 'Gamma', value: greeks.gamma, decimals: 4, unit: '' },
                      { key: 'theta', symbol: 'Θ', label: 'Theta /day', value: greeks.theta, decimals: 4, unit: '' },
                      { key: 'vega', symbol: 'ν', label: 'Vega /1%', value: greeks.vega, decimals: 4, unit: '' },
                      { key: 'rho', symbol: 'ρ', label: 'Rho /1%', value: greeks.rho, decimals: 4, unit: '' },
                    ].map((g, idx, arr) => (
                      <div
                        key={g.key}
                        className={cn(
                          'text-center px-2 py-1.5',
                          idx < arr.length - 1 && 'sm:border-r border-border',
                        )}
                      >
                        <div className="font-display italic text-[18px] font-bold text-[hsl(var(--brand-navy))] dark:text-[hsl(var(--brand-gold))] leading-none">
                          {g.symbol}
                        </div>
                        <div
                          className={cn(
                            'font-mono text-[18px] font-bold tabular-nums mt-1',
                            g.key === 'theta' && g.value < 0 && 'text-negative',
                            g.key === 'theta' && g.value > 0 && 'text-positive',
                            g.key !== 'theta' && 'text-foreground',
                          )}
                          data-testid={`output-${g.key}`}
                        >
                          {g.value.toFixed(g.decimals)}
                        </div>
                        <div className="text-[10px] uppercase tracking-uppercase font-bold text-muted-foreground mt-1 flex items-center justify-center gap-1">
                          {g.label}
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Info className="w-2.5 h-2.5 text-muted-foreground/60 cursor-help" />
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs">
                              <p className="text-xs">
                                {greekDescriptions[g.key as keyof typeof greekDescriptions]}
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Two charts side by side */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
                    <div className="rounded-xl border border-border bg-card p-5">
                      <div className="text-[10.5px] font-bold uppercase tracking-uppercase text-muted-foreground mb-3">
                        Price vs underlying
                      </div>
                      <div className="h-[200px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart
                            data={priceVsUnderlyingData}
                            margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
                          >
                            <CartesianGrid
                              strokeDasharray="3 3"
                              stroke={chartColors.grid}
                              opacity={0.5}
                            />
                            <XAxis
                              dataKey="price"
                              stroke={chartColors.axis}
                              tick={{ fontSize: 10, fill: chartColors.axis }}
                              tickLine={false}
                              tickFormatter={(v: number) => fmt(v, 0)}
                            />
                            <YAxis
                              stroke={chartColors.axis}
                              tick={{ fontSize: 10, fill: chartColors.axis }}
                              tickLine={false}
                            />
                            <ChartTooltip
                              contentStyle={{
                                backgroundColor: chartColors.tooltipBg,
                                border: `1px solid ${chartColors.tooltipBorder}`,
                                borderRadius: 6,
                                fontSize: 11,
                                fontFamily: 'var(--font-mono)',
                              }}
                              labelStyle={{ color: chartColors.axis }}
                              itemStyle={{ color: chartColors.tooltipText }}
                              formatter={(v: number) => fmt(v, 2)}
                            />
                            <ReferenceLine
                              x={inputs.strikePrice}
                              stroke={chartColors.gold}
                              strokeDasharray="2 3"
                              strokeOpacity={0.5}
                              label={{
                                value: `K = ${fmt(inputs.strikePrice, 0)}`,
                                fontSize: 9,
                                fill: chartColors.gold,
                                position: 'top',
                              }}
                            />
                            <Line
                              type="monotone"
                              dataKey="theoretical"
                              stroke={chartColors.gold}
                              strokeWidth={2}
                              dot={false}
                              name="Theoretical"
                            />
                            <Line
                              type="monotone"
                              dataKey="intrinsic"
                              stroke={chartColors.negative}
                              strokeWidth={1.4}
                              strokeDasharray="3 3"
                              dot={false}
                              name="Intrinsic"
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    <div className="rounded-xl border border-border bg-card p-5">
                      <div className="text-[10.5px] font-bold uppercase tracking-uppercase text-muted-foreground mb-3">
                        Theta decay vs DTE
                      </div>
                      <div className="h-[200px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart
                            data={thetaDecayData}
                            margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
                          >
                            <CartesianGrid
                              strokeDasharray="3 3"
                              stroke={chartColors.grid}
                              opacity={0.5}
                            />
                            <XAxis
                              dataKey="dte"
                              stroke={chartColors.axis}
                              tick={{ fontSize: 10, fill: chartColors.axis }}
                              tickLine={false}
                              tickFormatter={(v: number) => `${v.toFixed(0)}d`}
                            />
                            <YAxis
                              stroke={chartColors.axis}
                              tick={{ fontSize: 10, fill: chartColors.axis }}
                              tickLine={false}
                            />
                            <ChartTooltip
                              contentStyle={{
                                backgroundColor: chartColors.tooltipBg,
                                border: `1px solid ${chartColors.tooltipBorder}`,
                                borderRadius: 6,
                                fontSize: 11,
                                fontFamily: 'var(--font-mono)',
                              }}
                              labelStyle={{ color: chartColors.axis }}
                              itemStyle={{ color: chartColors.tooltipText }}
                              formatter={(v: number) => fmt(v, 2)}
                            />
                            <ReferenceLine
                              x={inputs.timeToExpiration}
                              stroke={chartColors.gold}
                              strokeDasharray="2 3"
                              strokeOpacity={0.5}
                            />
                            <Line
                              type="monotone"
                              dataKey="price"
                              stroke={chartColors.gold}
                              strokeWidth={2}
                              dot={false}
                              name="Premium"
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>

                  {/* Leg breakdown (multi-leg strategies) */}
                  {legsWithMath.length > 1 && (
                    <div className="rounded-xl border border-border bg-card p-5">
                      <div className="text-[10.5px] font-bold uppercase tracking-uppercase text-muted-foreground mb-3">
                        Leg breakdown
                      </div>
                      <div className="space-y-1.5">
                        {legsWithMath.map((leg, idx) => (
                          <div
                            key={`${leg.label}-${idx}`}
                            className="flex justify-between text-[12.5px]"
                          >
                            <span className="text-muted-foreground">
                              {leg.quantity > 0 ? 'Long' : 'Short'}{' '}
                              {leg.type.toUpperCase()} @ {fmt(leg.strike, 2)}{' '}
                              {Math.abs(leg.quantity) > 1 &&
                                `× ${Math.abs(leg.quantity)}`}
                            </span>
                            <span className="font-mono tabular-nums text-foreground">
                              Premium{' '}
                              {fmt(leg.math.optionPrice * leg.quantity, 2)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Formula card */}
                  <div className="rounded-xl border border-border bg-card p-6">
                    <h4 className="font-display italic text-[16px] font-bold tracking-tight text-[hsl(var(--brand-navy))] dark:text-foreground mb-3.5">
                      Black-Scholes-Merton formula
                    </h4>
                    <div
                      className="rounded-md bg-muted/40 p-4 border-l-[3px] border-[hsl(var(--brand-gold))] font-mono text-[13px] leading-[2] text-foreground"
                      style={{ fontFamily: 'var(--font-mono)' }}
                    >
                      C ={' '}
                      <em className="not-italic font-bold text-[hsl(var(--brand-gold))]">
                        S
                      </em>{' '}
                      · e<sup className="text-[10px]">−qT</sup> · N(d
                      <sub className="text-[10px]">1</sub>) −{' '}
                      <em className="not-italic font-bold text-[hsl(var(--brand-gold))]">
                        K
                      </em>{' '}
                      · e<sup className="text-[10px]">−rT</sup> · N(d
                      <sub className="text-[10px]">2</sub>)
                      <br />
                      d<sub className="text-[10px]">1</sub> = [ ln(S/K) + (r −
                      q + σ²/2) · T ] / (σ · √T)
                      <br />
                      d<sub className="text-[10px]">2</sub> = d
                      <sub className="text-[10px]">1</sub> − σ · √T
                    </div>
                    <p className="text-[12px] text-muted-foreground mt-3.5 leading-relaxed">
                      Assumes log-normal returns, constant vol, no early
                      exercise (European). For American or path-dependent
                      payoffs, use binomial-tree or Monte-Carlo (planned).
                    </p>
                  </div>
                </div>
              </section>
            </div>
          </TabsContent>

          {/* ─── PAYOFF TAB ──────────────────────────────────────────── */}
          <TabsContent
            value="payoff"
            className="flex-1 m-0 overflow-y-auto p-6 md:p-8 data-[state=inactive]:hidden"
          >
            <div className="max-w-5xl mx-auto rounded-xl border border-border bg-card p-5">
              <div className="text-[10.5px] font-bold uppercase tracking-uppercase text-muted-foreground mb-3">
                Payoff at expiration
              </div>
              <div className="h-[480px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={payoffData}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke={chartColors.grid}
                      opacity={0.5}
                    />
                    <XAxis
                      dataKey="price"
                      stroke={chartColors.axis}
                      tick={{ fontSize: 11, fill: chartColors.axis }}
                      label={{
                        value: 'Stock price',
                        position: 'insideBottom',
                        offset: -5,
                        fill: chartColors.axis,
                      }}
                    />
                    <YAxis
                      stroke={chartColors.axis}
                      tick={{ fontSize: 11, fill: chartColors.axis }}
                      label={{
                        value: 'Profit / loss',
                        angle: -90,
                        position: 'insideLeft',
                        fill: chartColors.axis,
                      }}
                    />
                    <ReferenceLine
                      x={inputs.stockPrice}
                      stroke={chartColors.gold}
                      strokeDasharray="4 4"
                      label={{
                        value: 'Spot',
                        position: 'insideTop',
                        fill: chartColors.gold,
                        fontSize: 10,
                      }}
                    />
                    <ReferenceLine y={0} stroke={chartColors.axis} strokeOpacity={0.3} />
                    <ChartTooltip
                      contentStyle={{
                        backgroundColor: chartColors.tooltipBg,
                        border: `1px solid ${chartColors.tooltipBorder}`,
                        borderRadius: 6,
                        fontSize: 11,
                        fontFamily: 'var(--font-mono)',
                      }}
                      labelStyle={{ color: chartColors.axis }}
                      itemStyle={{ color: chartColors.tooltipText }}
                    />
                    <Line
                      type="monotone"
                      dataKey="profit"
                      stroke={chartColors.positive}
                      strokeWidth={2}
                      dot={false}
                      name="P&L"
                    />
                    <Line
                      type="monotone"
                      dataKey="intrinsicValue"
                      stroke={chartColors.sky}
                      strokeWidth={1.4}
                      strokeDasharray="5 5"
                      dot={false}
                      name="Intrinsic"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </TabsContent>

          {/* ─── SENSITIVITY TAB ─────────────────────────────────────── */}
          <TabsContent
            value="sensitivity"
            className="flex-1 m-0 overflow-y-auto p-6 md:p-8 data-[state=inactive]:hidden"
          >
            <div className="max-w-5xl mx-auto rounded-xl border border-border bg-card p-5">
              <div className="text-[10.5px] font-bold uppercase tracking-uppercase text-muted-foreground mb-3">
                Price sensitivity
              </div>
              <div className="h-[480px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={sensitivityData}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke={chartColors.grid}
                      opacity={0.5}
                    />
                    <XAxis
                      dataKey="priceChange"
                      stroke={chartColors.axis}
                      tick={{ fontSize: 11, fill: chartColors.axis }}
                      tickFormatter={(v) => `${v}%`}
                      label={{
                        value: 'Stock price change',
                        position: 'insideBottom',
                        offset: -5,
                        fill: chartColors.axis,
                      }}
                    />
                    <YAxis
                      yAxisId="price"
                      stroke={chartColors.axis}
                      tick={{ fontSize: 11, fill: chartColors.axis }}
                    />
                    <YAxis
                      yAxisId="delta"
                      orientation="right"
                      stroke={chartColors.axis}
                      tick={{ fontSize: 11, fill: chartColors.axis }}
                    />
                    <ChartTooltip
                      contentStyle={{
                        backgroundColor: chartColors.tooltipBg,
                        border: `1px solid ${chartColors.tooltipBorder}`,
                        borderRadius: 6,
                        fontSize: 11,
                        fontFamily: 'var(--font-mono)',
                      }}
                      labelStyle={{ color: chartColors.axis }}
                      itemStyle={{ color: chartColors.tooltipText }}
                    />
                    <Line
                      yAxisId="price"
                      type="monotone"
                      dataKey="optionPrice"
                      stroke={chartColors.gold}
                      strokeWidth={2}
                      dot={false}
                      name="Option price"
                    />
                    <Line
                      yAxisId="delta"
                      type="monotone"
                      dataKey="delta"
                      stroke={chartColors.sky}
                      strokeWidth={2}
                      dot={false}
                      name="Delta"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </TabsContent>

          {/* ─── COMPARE TAB ─────────────────────────────────────────── */}
          <TabsContent
            value="compare"
            className="flex-1 m-0 overflow-y-auto p-6 md:p-8 data-[state=inactive]:hidden"
          >
            <div className="max-w-5xl mx-auto rounded-xl border border-border bg-card overflow-hidden">
              <div className="px-5 py-4 border-b border-border">
                <div className="text-[10.5px] font-bold uppercase tracking-uppercase text-muted-foreground">
                  Strike comparison
                </div>
              </div>
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr className="bg-muted/40 text-[10.5px] uppercase tracking-uppercase font-bold text-muted-foreground">
                    <th className="text-left py-3 px-4 border-b border-border">Strike</th>
                    <th className="text-right py-3 px-4 border-b border-border">Premium</th>
                    <th className="text-right py-3 px-4 border-b border-border">Delta</th>
                    <th className="text-right py-3 px-4 border-b border-border">Gamma</th>
                    <th className="text-right py-3 px-4 border-b border-border">Theta</th>
                    <th className="text-right py-3 px-4 border-b border-border">Vega</th>
                    <th className="text-right py-3 px-4 border-b border-border">Rho</th>
                  </tr>
                </thead>
                <tbody>
                  {strikeComparison.map((row) => (
                    <tr
                      key={row.strike}
                      className={cn(
                        'border-t border-border/60 hover:bg-muted/30 transition-colors',
                        row.strike === inputs.strikePrice &&
                          'bg-[hsl(var(--brand-gold))]/8',
                      )}
                    >
                      <td className="py-2.5 px-4 font-mono font-bold tabular-nums text-foreground">
                        {fmt(row.strike, 2)}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums text-[hsl(var(--brand-gold))] font-bold">
                        {row.optionPrice.toFixed(2)}
                      </td>
                      <td
                        className={cn(
                          'py-2.5 px-4 text-right font-mono tabular-nums',
                          row.delta >= 0 ? 'text-positive' : 'text-negative',
                        )}
                      >
                        {row.delta.toFixed(4)}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums text-foreground">
                        {row.gamma.toFixed(4)}
                      </td>
                      <td
                        className={cn(
                          'py-2.5 px-4 text-right font-mono tabular-nums',
                          row.theta < 0 ? 'text-negative' : 'text-positive',
                        )}
                      >
                        {row.theta.toFixed(4)}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums text-foreground">
                        {row.vega.toFixed(4)}
                      </td>
                      <td
                        className={cn(
                          'py-2.5 px-4 text-right font-mono tabular-nums',
                          row.rho >= 0 ? 'text-positive' : 'text-negative',
                        )}
                      >
                        {row.rho.toFixed(4)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </TooltipProvider>
  );
}
