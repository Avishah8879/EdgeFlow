import { ResponsiveSankey } from '@nivo/sankey';
import { useTheme } from 'next-themes';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertCircle } from 'lucide-react';
import { useSankey, formatSankeyValue } from '@/hooks/use-sankey';

interface FinancialSankeyProps {
  ticker: string;
  statementType: 'income' | 'cashflow' | 'balance';
  year?: number;
}

/**
 * FinancialSankey - Sankey diagram for financial statement flows.
 *
 * Renders income statement or cash flow as a flow diagram showing
 * how money flows through the company (Revenue -> Costs -> Profit, etc.)
 *
 * Uses yfinance data via backend API with 24-hour caching.
 */
export function FinancialSankey({ ticker, statementType, year }: FinancialSankeyProps) {
  const { resolvedTheme } = useTheme();
  const { data, isLoading, error } = useSankey(ticker, statementType, year);

  // Loading state
  if (isLoading) {
    return (
      <div className="h-[500px] w-full flex items-center justify-center">
        <Skeleton className="h-full w-full rounded-lg" />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="h-[500px] w-full flex flex-col items-center justify-center gap-3 text-muted-foreground">
        <AlertCircle className="h-8 w-8 text-destructive" />
        <p className="text-sm">{error.message || 'Failed to load flow diagram'}</p>
      </div>
    );
  }

  // Empty/insufficient data state
  if (!data?.data?.links?.length) {
    return (
      <div className="h-[500px] w-full flex flex-col items-center justify-center gap-2 text-muted-foreground">
        <AlertCircle className="h-8 w-8" />
        <p className="text-sm">Insufficient data for flow visualization</p>
        <p className="text-xs">Financial data may not be available for this stock</p>
      </div>
    );
  }

  const isDark = resolvedTheme === 'dark';

  // Dark mode color overrides - more vibrant/saturated colors for visibility
  const darkModeColors: Record<string, string> = {
    // Revenue nodes - bright blue
    'Total Revenue': '#60a5fa',
    'Operating Revenue': '#60a5fa',
    'Other Revenue': '#93c5fd',
    // Profit nodes - bright green
    'Gross Profit': '#4ade80',
    'Operating Income': '#22c55e',
    'Net Income': '#86efac',
    'Retained Earnings': '#4ade80',
    // Expense nodes - bright orange/amber
    'Cost of Revenue': '#fb923c',
    'Operating Expenses': '#f97316',
    'SG&A': '#fdba74',
    'R&D': '#fed7aa',
    'D&A': '#fbbf24',
    'Other OpEx': '#fcd34d',
    'Other Costs': '#d97706',
    // Tax - bright purple
    'Taxes': '#c084fc',
    // Dividend - pink/rose
    'Dividends': '#f472b6',
    // Cash flow specific
    'Operating CF': '#4ade80',
    'Investing CF': '#60a5fa',
    'Investing CF (Outflow)': '#fb923c',
    'Financing CF': '#a78bfa',
    'Financing CF (Outflow)': '#f87171',
    'Net Cash Change': '#fbbf24',
    'Capital Expenditure': '#f97316',
    'Dividends Paid': '#f472b6',
    'Net Borrowings': '#818cf8',
    'Debt Repayment': '#f87171',
    // Balance sheet - Assets (blue shades)
    'Total Assets': '#60a5fa',
    'Current Assets': '#60a5fa',
    'Non-Current Assets': '#3b82f6',
    'Cash': '#93c5fd',
    'Cash & Investments': '#93c5fd',
    'Short-Term Investments': '#93c5fd',
    'Receivables': '#60a5fa',
    'Inventory': '#38bdf8',
    'Other Current Assets': '#7dd3fc',
    'Net PPE': '#3b82f6',
    'PPE': '#3b82f6',
    'Goodwill': '#6366f1',
    'Intangibles': '#818cf8',
    'Long-Term Investments': '#a78bfa',
    'Other Non-Current': '#c4b5fd',
    // Balance sheet - Liabilities (orange shades)
    'Total Liabilities': '#fb923c',
    'Current Liabilities': '#fb923c',
    'Long-Term Liabilities': '#f97316',
    'Accounts Payable': '#fdba74',
    'Short-Term Debt': '#fb923c',
    'Accrued Liabilities': '#fed7aa',
    'Other Current Liab': '#fcd34d',
    'Long-Term Debt': '#f97316',
    'Deferred Tax Liab': '#fbbf24',
    'Other Long-Term Liab': '#d97706',
    // Balance sheet - Equity (green shades)
    'Total Equity': '#4ade80',
    'Common Stock': '#22c55e',
    'Paid-In Capital': '#86efac',
    // Note: 'Retained Earnings' already defined in income section above
    'Treasury Stock': '#f87171',
    'AOCI': '#a78bfa',
    'Minority Interest': '#c084fc',
    'Preferred Stock': '#c084fc',
    'Other Equity': '#d9f99d',
  };

  // Build color map - use dark mode overrides when in dark theme
  const colorMap = new Map(
    data.data.nodes.map(n => [
      n.id,
      isDark ? (darkModeColors[n.id] || n.color) : n.color
    ])
  );

  return (
    <div className="h-[500px] w-full">
      <ResponsiveSankey
        data={data.data}
        margin={{ top: 24, right: 160, bottom: 24, left: 160 }}
        align="justify"
        colors={(node) => colorMap.get(node.id) || '#7f7f7f'}
        nodeOpacity={1}
        nodeThickness={18}
        nodeInnerPadding={3}
        nodeSpacing={28}
        nodeBorderWidth={0}
        nodeBorderRadius={3}
        linkOpacity={isDark ? 0.85 : 0.5}
        linkHoverOpacity={0.95}
        linkContract={3}
        linkBlendMode={isDark ? 'screen' : 'multiply'}
        enableLinkGradient={true}
        labelPosition="outside"
        labelOrientation="horizontal"
        labelPadding={12}
        labelTextColor={isDark ? '#ffffff' : '#171717'}
        theme={{
          labels: {
            text: {
              fill: isDark ? '#ffffff' : '#171717',
              fontSize: 12,
              fontWeight: 600,
            },
          },
          tooltip: {
            container: {
              background: isDark ? '#1a1a1a' : '#ffffff',
              color: isDark ? '#f5f5f5' : '#171717',
              fontSize: 12,
              borderRadius: 8,
              boxShadow: isDark
                ? '0 4px 16px rgba(0,0,0,0.4)'
                : '0 4px 16px rgba(0,0,0,0.15)',
              padding: '10px 14px',
              border: isDark ? '1px solid #333' : '1px solid #e5e5e5',
            },
          },
        }}
        nodeTooltip={({ node }) => (
          <div className="flex flex-col gap-1">
            <span className="font-semibold">{node.id}</span>
            <span className="text-sm">{formatSankeyValue(node.value)}</span>
          </div>
        )}
        linkTooltip={({ link }) => (
          <div className="flex flex-col gap-1">
            <span className="text-sm">
              {link.source.id} &rarr; {link.target.id}
            </span>
            <span className="font-semibold">{formatSankeyValue(link.value)}</span>
          </div>
        )}
      />
    </div>
  );
}

export default FinancialSankey;
