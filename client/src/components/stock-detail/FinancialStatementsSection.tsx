import { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table2, GitBranch } from "lucide-react";
import { FinancialSankey } from "./FinancialSankey";
import { useSankeyYears } from "@/hooks/use-sankey";

interface FinancialStatementsSectionProps {
  ticker: string;
  exchange?: string;
  financials: {
    income_statement: Record<string, any> | null;
    balance_sheet: Record<string, any> | null;
    cash_flow: Record<string, any> | null;
  };
}

/**
 * Convert database symbol + exchange to yfinance ticker symbol.
 * NSE stocks need .NS suffix, BSE stocks need .BO suffix.
 * US stocks (no exchange or non-Indian) use symbol as-is.
 */
function getYfinanceSymbol(symbol: string, exchange?: string): string {
  if (!exchange) return symbol;

  const exchangeUpper = exchange.toUpperCase();
  if (exchangeUpper === 'NSE') {
    return `${symbol}.NS`;
  } else if (exchangeUpper === 'BSE') {
    return `${symbol}.BO`;
  }
  return symbol;
}

function formatNumber(value: any): string {
  if (value === null || value === undefined) return "-";
  const num = typeof value === "number" ? value : parseFloat(value);
  if (isNaN(num)) return "-";

  // Format in crores
  const crores = num / 10000000;
  return `₹${crores.toFixed(2)} Cr`;
}

function FinancialTable({ data, title }: { data: Record<string, any> | null; title: string }) {
  if (!data || Object.keys(data).length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground">No {title.toLowerCase()} data available</p>
      </div>
    );
  }

  // Get years from the data
  const years = Object.keys(data).sort().reverse();

  // Get all unique fields across all years
  const allFields = new Set<string>();
  years.forEach((year) => {
    if (data[year] && typeof data[year] === "object") {
      Object.keys(data[year]).forEach((field) => allFields.add(field));
    }
  });

  const fields = Array.from(allFields).sort();

  // Only show top fields to avoid overwhelming display
  const importantFields = fields.slice(0, 15);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b">
            <th className="text-left py-2 px-4 font-semibold sticky left-0 bg-background">Metric</th>
            {years.map((year) => (
              <th key={year} className="text-right py-2 px-4 font-semibold">
                {year}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {importantFields.map((field) => (
            <tr key={field} className="border-b hover:bg-muted/50">
              <td className="py-2 px-4 sticky left-0 bg-background">{field}</td>
              {years.map((year) => (
                <td key={year} className="text-right py-2 px-4 font-mono">
                  {formatNumber(data[year]?.[field])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function FinancialStatementsSection({ ticker, exchange, financials }: FinancialStatementsSectionProps) {
  const [viewMode, setViewMode] = useState<"table" | "flow">("table");
  const [selectedYear, setSelectedYear] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"income" | "balance" | "cashflow">("income");

  // Convert to yfinance symbol (e.g., RELIANCE → RELIANCE.NS for NSE)
  const yfinanceSymbol = getYfinanceSymbol(ticker, exchange);

  // Fetch available years for Sankey diagrams
  const { data: yearsData } = useSankeyYears(yfinanceSymbol);

  // Get available years based on active tab
  const availableYears = activeTab === "income"
    ? yearsData?.income_years || []
    : activeTab === "cashflow"
    ? yearsData?.cashflow_years || []
    : yearsData?.balance_years || [];

  // Set default year when years load or tab changes
  useEffect(() => {
    if (availableYears.length > 0) {
      setSelectedYear(String(availableYears[0]));
    }
  }, [availableYears]);

  // Map tab value to statement type for Sankey
  const getStatementType = (): "income" | "cashflow" | "balance" => {
    if (activeTab === "cashflow") return "cashflow";
    if (activeTab === "balance") return "balance";
    return "income";
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-4">
          <CardTitle>Financial Statements</CardTitle>
          <div className="flex items-center gap-3">
            {/* Year selector - show in Flow view for all tabs */}
            {viewMode === "flow" && availableYears.length > 0 && (
              <Select value={selectedYear} onValueChange={setSelectedYear}>
                <SelectTrigger className="w-[100px] h-9">
                  <SelectValue placeholder="Year" />
                </SelectTrigger>
                <SelectContent>
                  {availableYears.map((year) => (
                    <SelectItem key={year} value={String(year)}>
                      FY {year}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {/* View mode toggle */}
            <div className="flex rounded-lg border p-1 gap-1">
              <Button
                variant={viewMode === "table" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setViewMode("table")}
                className="h-7 px-2.5 gap-1.5"
              >
                <Table2 className="h-3.5 w-3.5" />
                Table
              </Button>
              <Button
                variant={viewMode === "flow" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setViewMode("flow")}
                className="h-7 px-2.5 gap-1.5"
              >
                <GitBranch className="h-3.5 w-3.5" />
                Flow
              </Button>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs
          defaultValue="income"
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as typeof activeTab)}
          className="w-full"
        >
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="income">Income Statement</TabsTrigger>
            <TabsTrigger value="balance">Balance Sheet</TabsTrigger>
            <TabsTrigger value="cashflow">Cash Flow</TabsTrigger>
          </TabsList>

          <TabsContent value="income" className="mt-6">
            {viewMode === "table" ? (
              <FinancialTable data={financials.income_statement} title="Income Statement" />
            ) : (
              <FinancialSankey
                ticker={yfinanceSymbol}
                statementType="income"
                year={selectedYear ? parseInt(selectedYear) : undefined}
              />
            )}
          </TabsContent>

          <TabsContent value="balance" className="mt-6">
            {viewMode === "table" ? (
              <FinancialTable data={financials.balance_sheet} title="Balance Sheet" />
            ) : (
              <FinancialSankey
                ticker={yfinanceSymbol}
                statementType="balance"
                year={selectedYear ? parseInt(selectedYear) : undefined}
              />
            )}
          </TabsContent>

          <TabsContent value="cashflow" className="mt-6">
            {viewMode === "table" ? (
              <FinancialTable data={financials.cash_flow} title="Cash Flow" />
            ) : (
              <FinancialSankey
                ticker={yfinanceSymbol}
                statementType="cashflow"
                year={selectedYear ? parseInt(selectedYear) : undefined}
              />
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
