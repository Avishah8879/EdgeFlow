import { useState, useEffect, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calculator, History, DollarSign, Percent, TrendingUp } from 'lucide-react';

interface CalculationHistory {
  id: string;
  expression: string;
  result: string;
  timestamp: number;
  type: 'basic' | 'financial' | 'currency';
}

export function FinancialCalculator() {
  const [display, setDisplay] = useState('0');
  const [previousValue, setPreviousValue] = useState('');
  const [operation, setOperation] = useState('');
  const [waitingForOperand, setWaitingForOperand] = useState(false);
  const [memory, setMemory] = useState(0);
  const [history, setHistory] = useState<CalculationHistory[]>([]);
  
  // Financial calculator states
  const [principal, setPrincipal] = useState('10000');
  const [rate, setRate] = useState('5');
  const [time, setTime] = useState('5');
  const [npvCashFlows, setNpvCashFlows] = useState('1000,1500,2000,2500,3000');
  const [npvRate, setNpvRate] = useState('10');
  
  // Currency conversion - NO MOCK DATA
  const [amount, setAmount] = useState('100');
  const [fromCurrency, setFromCurrency] = useState('USD');
  const [toCurrency, setToCurrency] = useState('EUR');
  
  // Real rates should be fetched from API - showing unavailable for now
  const mockRates: Record<string, number> = {};

  // Load history from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('calculator-history');
    if (saved) {
      setHistory(JSON.parse(saved));
    }
  }, []);

  // Save history to localStorage
  const saveToHistory = (expression: string, result: string, type: CalculationHistory['type'] = 'basic') => {
    const newEntry: CalculationHistory = {
      id: Date.now().toString(),
      expression,
      result,
      timestamp: Date.now(),
      type,
    };
    
    const updatedHistory = [newEntry, ...history].slice(0, 50); // Keep last 50 entries
    setHistory(updatedHistory);
    localStorage.setItem('calculator-history', JSON.stringify(updatedHistory));
  };

  // Basic calculator functions
  const inputDigit = useCallback((digit: string) => {
    if (waitingForOperand) {
      setDisplay(String(digit));
      setWaitingForOperand(false);
    } else {
      setDisplay(display === '0' ? String(digit) : display + digit);
    }
  }, [display, waitingForOperand]);

  const inputDecimal = useCallback(() => {
    if (waitingForOperand) {
      setDisplay('0.');
      setWaitingForOperand(false);
    } else if (display.indexOf('.') === -1) {
      setDisplay(display + '.');
    }
  }, [display, waitingForOperand]);

  const clear = useCallback(() => {
    setDisplay('0');
    setPreviousValue('');
    setOperation('');
    setWaitingForOperand(false);
  }, []);

  const performOperation = useCallback((nextOperation: string) => {
    const inputValue = parseFloat(display);

    if (previousValue === '') {
      setPreviousValue(display);
    } else if (operation) {
      const currentValue = parseFloat(previousValue);
      const newValue = calculate(currentValue, inputValue, operation);
      const expression = `${previousValue} ${operation} ${display}`;
      const result = String(newValue);
      
      setDisplay(result);
      setPreviousValue(result);
      saveToHistory(expression, result);
    }

    setWaitingForOperand(true);
    setOperation(nextOperation);
  }, [display, previousValue, operation]);

  const calculate = (firstValue: number, secondValue: number, operation: string) => {
    switch (operation) {
      case '+': return firstValue + secondValue;
      case '-': return firstValue - secondValue;
      case '*': return firstValue * secondValue;
      case '/': return firstValue / secondValue;
      case '=': return secondValue;
      default: return 0;
    }
  };

  // Memory functions
  const memoryAdd = () => setMemory(memory + parseFloat(display));
  const memorySubtract = () => setMemory(memory - parseFloat(display));
  const memoryRecall = () => setDisplay(String(memory));
  const memoryClear = () => setMemory(0);

  // Financial calculations
  const calculateCompoundInterest = () => {
    const p = parseFloat(principal);
    const r = parseFloat(rate) / 100;
    const t = parseFloat(time);
    const result = p * Math.pow(1 + r, t);
    const expression = `CI: $${principal} @ ${rate}% for ${time} years`;
    saveToHistory(expression, `$${result.toFixed(2)}`, 'financial');
    return result.toFixed(2);
  };

  const calculateNPV = () => {
    const cashFlows = npvCashFlows.split(',').map(cf => parseFloat(cf.trim()));
    const r = parseFloat(npvRate) / 100;
    let npv = 0;
    
    cashFlows.forEach((cf, i) => {
      npv += cf / Math.pow(1 + r, i + 1);
    });
    
    const expression = `NPV @ ${npvRate}%: [${npvCashFlows}]`;
    saveToHistory(expression, `$${npv.toFixed(2)}`, 'financial');
    return npv.toFixed(2);
  };

  const calculateLoanPayment = () => {
    const p = parseFloat(principal);
    const r = parseFloat(rate) / 100 / 12;
    const n = parseFloat(time) * 12;
    const payment = (p * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
    const expression = `Loan: $${principal} @ ${rate}% for ${time} years`;
    saveToHistory(expression, `$${payment.toFixed(2)}/month`, 'financial');
    return payment.toFixed(2);
  };

  // Currency conversion - No mock data allowed
  const convertCurrency = () => {
    // No real forex rates available - return unavailable
    const expression = `${amount} ${fromCurrency} to ${toCurrency}`;
    saveToHistory(expression, 'Data unavailable', 'currency');
    return 'UNAVAILABLE';
  };

  // Keyboard support
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') {
        inputDigit(e.key);
      } else if (e.key === '.') {
        inputDecimal();
      } else if (e.key === '+' || e.key === '-' || e.key === '*' || e.key === '/') {
        performOperation(e.key);
      } else if (e.key === 'Enter' || e.key === '=') {
        performOperation('=');
      } else if (e.key === 'Escape') {
        clear();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [inputDigit, inputDecimal, performOperation, clear]);

  const clearHistory = () => {
    setHistory([]);
    localStorage.removeItem('calculator-history');
  };

  return (
    <div className="h-full bg-card p-2">
      <Tabs defaultValue="basic" className="h-full">
        <TabsList className="grid w-full grid-cols-4 mb-2">
          <TabsTrigger value="basic" data-testid="tab-basic">Basic</TabsTrigger>
          <TabsTrigger value="financial" data-testid="tab-financial">Financial</TabsTrigger>
          <TabsTrigger value="currency" data-testid="tab-currency">Currency</TabsTrigger>
          <TabsTrigger value="history" data-testid="tab-history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="basic" className="h-[calc(100%-48px)]">
          <Card className="p-2 bg-card/50 border-primary/20">
            {/* Display */}
            <div className="mb-2 p-2 bg-black rounded border border-primary/30">
              <div className="text-right text-3xl font-mono text-primary">
                {display}
              </div>
              {previousValue && operation && (
                <div className="text-right text-sm text-muted-foreground">
                  {previousValue} {operation}
                </div>
              )}
            </div>

            {/* Memory buttons */}
            <div className="grid grid-cols-4 gap-2 mb-2">
              <Button
                variant="outline"
                size="sm"
                onClick={memoryClear}
                className="text-xs"
                data-testid="button-mc"
              >
                MC
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={memoryRecall}
                className="text-xs"
                data-testid="button-mr"
              >
                MR
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={memoryAdd}
                className="text-xs"
                data-testid="button-m-plus"
              >
                M+
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={memorySubtract}
                className="text-xs"
                data-testid="button-m-minus"
              >
                M-
              </Button>
            </div>

            {/* Calculator buttons */}
            <div className="grid grid-cols-4 gap-2">
              <Button 
                variant="outline" 
                onClick={clear} 
                className="col-span-2"
                data-testid="button-clear"
              >
                Clear
              </Button>
              <Button 
                variant="outline" 
                onClick={() => performOperation('/')}
                data-testid="button-divide"
              >
                ÷
              </Button>
              <Button 
                variant="outline" 
                onClick={() => performOperation('*')}
                data-testid="button-multiply"
              >
                ×
              </Button>

              {[7, 8, 9].map(n => (
                <Button
                  key={n}
                  variant="outline"
                  onClick={() => inputDigit(String(n))}
                  data-testid={`button-${n}`}
                >
                  {n}
                </Button>
              ))}
              <Button 
                variant="outline" 
                onClick={() => performOperation('-')}
                data-testid="button-subtract"
              >
                -
              </Button>

              {[4, 5, 6].map(n => (
                <Button
                  key={n}
                  variant="outline"
                  onClick={() => inputDigit(String(n))}
                  data-testid={`button-${n}`}
                >
                  {n}
                </Button>
              ))}
              <Button 
                variant="outline" 
                onClick={() => performOperation('+')}
                data-testid="button-add"
              >
                +
              </Button>

              {[1, 2, 3].map(n => (
                <Button
                  key={n}
                  variant="outline"
                  onClick={() => inputDigit(String(n))}
                  data-testid={`button-${n}`}
                >
                  {n}
                </Button>
              ))}
              <Button
                variant="outline"
                onClick={() => performOperation('=')}
                className="row-span-2"
                data-testid="button-equals"
              >
                =
              </Button>

              <Button
                variant="outline"
                onClick={() => inputDigit('0')}
                className="col-span-2"
                data-testid="button-0"
              >
                0
              </Button>
              <Button
                variant="outline"
                onClick={inputDecimal}
                data-testid="button-decimal"
              >
                .
              </Button>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="financial" className="h-[calc(100%-60px)]">
          <ScrollArea className="h-full">
            <div className="space-y-4">
              {/* Compound Interest */}
              <Card className="p-4 bg-card/50 border-primary/20">
                <h3 className="text-sm font-bold mb-3 text-primary flex items-center gap-2">
                  <TrendingUp className="w-4 h-4" />
                  Compound Interest
                </h3>
                <div className="space-y-2">
                  <div>
                    <Label htmlFor="principal">Principal ($)</Label>
                    <Input
                      id="principal"
                      type="number"
                      value={principal}
                      onChange={(e) => setPrincipal(e.target.value)}
                      className="bg-background"
                      data-testid="input-principal"
                    />
                  </div>
                  <div>
                    <Label htmlFor="rate">Annual Rate (%)</Label>
                    <Input
                      id="rate"
                      type="number"
                      value={rate}
                      onChange={(e) => setRate(e.target.value)}
                      className="bg-background"
                      data-testid="input-rate"
                    />
                  </div>
                  <div>
                    <Label htmlFor="time">Time (years)</Label>
                    <Input
                      id="time"
                      type="number"
                      value={time}
                      onChange={(e) => setTime(e.target.value)}
                      className="bg-background"
                      data-testid="input-time"
                    />
                  </div>
                  <Button
                    onClick={() => setDisplay(calculateCompoundInterest())}
                    className="w-full"
                    data-testid="button-calculate-ci"
                  >
                    Calculate Compound Interest
                  </Button>
                </div>
              </Card>

              {/* NPV Calculator */}
              <Card className="p-4 bg-card/50 border-primary/20">
                <h3 className="text-sm font-bold mb-3 text-primary flex items-center gap-2">
                  <DollarSign className="w-4 h-4" />
                  Net Present Value (NPV)
                </h3>
                <div className="space-y-2">
                  <div>
                    <Label htmlFor="cashflows">Cash Flows (comma-separated)</Label>
                    <Input
                      id="cashflows"
                      value={npvCashFlows}
                      onChange={(e) => setNpvCashFlows(e.target.value)}
                      placeholder="1000,1500,2000"
                      className="bg-background"
                      data-testid="input-cashflows"
                    />
                  </div>
                  <div>
                    <Label htmlFor="npvrate">Discount Rate (%)</Label>
                    <Input
                      id="npvrate"
                      type="number"
                      value={npvRate}
                      onChange={(e) => setNpvRate(e.target.value)}
                      className="bg-background"
                      data-testid="input-npv-rate"
                    />
                  </div>
                  <Button
                    onClick={() => setDisplay(calculateNPV())}
                    className="w-full"
                    data-testid="button-calculate-npv"
                  >
                    Calculate NPV
                  </Button>
                </div>
              </Card>

              {/* Loan Payment Calculator */}
              <Card className="p-4 bg-card/50 border-primary/20">
                <h3 className="text-sm font-bold mb-3 text-primary flex items-center gap-2">
                  <Percent className="w-4 h-4" />
                  Loan Payment
                </h3>
                <p className="text-xs text-muted-foreground mb-2">
                  Uses values from Compound Interest section
                </p>
                <Button
                  onClick={() => setDisplay(calculateLoanPayment())}
                  className="w-full"
                  data-testid="button-calculate-loan"
                >
                  Calculate Monthly Payment
                </Button>
              </Card>

              {/* Result Display */}
              {display !== '0' && (
                <Card className="p-4 bg-black border-primary/30">
                  <div className="text-2xl font-mono text-primary text-center">
                    ${display}
                  </div>
                </Card>
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="currency" className="h-[calc(100%-60px)]">
          <Card className="p-4 bg-card/50 border-primary/20">
            <h3 className="text-sm font-bold mb-3 text-primary flex items-center gap-2">
              <DollarSign className="w-4 h-4" />
              Currency Converter - DATA UNAVAILABLE
            </h3>
            <div className="space-y-3">
              <div>
                <Label htmlFor="amount">Amount</Label>
                <Input
                  id="amount"
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="bg-background"
                  data-testid="input-amount"
                />
              </div>
              <div>
                <Label htmlFor="from">From Currency</Label>
                <Select value={fromCurrency} onValueChange={setFromCurrency}>
                  <SelectTrigger id="from" className="bg-background" data-testid="select-from-currency">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="EUR">EUR</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="to">To Currency</Label>
                <Select value={toCurrency} onValueChange={setToCurrency}>
                  <SelectTrigger id="to" className="bg-background" data-testid="select-to-currency">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="EUR">EUR</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                onClick={() => {
                  const result = convertCurrency();
                  setDisplay(result);
                }}
                className="w-full"
                data-testid="button-convert"
              >
                Convert
              </Button>

              {display !== '0' && (
                <Card className="p-4 bg-black border-primary/30">
                  <div className="text-2xl font-mono text-primary text-center">
                    {display} {toCurrency}
                  </div>
                </Card>
              )}

              <div className="mt-4 p-3 bg-sidebar/20 rounded">
                <p className="text-xs text-muted-foreground">
                  Mock exchange rates for demonstration
                </p>
              </div>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="h-[calc(100%-60px)]">
          <Card className="p-4 h-full bg-card/50 border-primary/20">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-sm font-bold text-primary flex items-center gap-2">
                <History className="w-4 h-4" />
                Calculation History
              </h3>
              <Button
                variant="outline"
                size="sm"
                onClick={clearHistory}
                data-testid="button-clear-history"
              >
                Clear
              </Button>
            </div>
            
            <ScrollArea className="h-[calc(100%-40px)]">
              {history.length === 0 ? (
                <div className="text-center text-muted-foreground py-8">
                  <Calculator className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No calculations yet</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {history.map((item) => (
                    <Card
                      key={item.id}
                      className="p-2 bg-sidebar/20 border-primary/10 cursor-pointer hover-elevate"
                      onClick={() => setDisplay(item.result.replace(/[^0-9.-]/g, ''))}
                      data-testid={`history-item-${item.id}`}
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="text-xs text-primary font-mono">
                            {item.expression}
                          </div>
                          <div className="text-sm font-bold text-foreground">
                            = {item.result}
                          </div>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(item.timestamp).toLocaleTimeString()}
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </ScrollArea>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}