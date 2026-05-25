"""
Fundamental Screener Module

Screens stocks using fundamental data from the stock_fundamentals table.
Evaluates boolean expressions like:
  trailing_pe < 20 and return_on_equity > 15 and debt_to_equity < 1

Reuses ConditionEvaluator from expert_screener.py for safe AST-based evaluation.
"""

import logging
import time
from typing import Dict, List, Optional, Callable, Any

logger = logging.getLogger(__name__)

# All fundamental variables available for screening
FUNDAMENTAL_VARIABLES = {
    'market_cap': {'label': 'Market Cap', 'description': 'Market capitalization in INR', 'example': 'market_cap > 50000000000'},
    'trailing_pe': {'label': 'Trailing P/E', 'description': 'Trailing price-to-earnings ratio', 'example': 'trailing_pe < 20'},
    'forward_pe': {'label': 'Forward P/E', 'description': 'Forward price-to-earnings ratio', 'example': 'forward_pe < 15'},
    'price_to_book': {'label': 'P/B Ratio', 'description': 'Price-to-book ratio', 'example': 'price_to_book < 3'},
    'price_to_sales': {'label': 'P/S Ratio', 'description': 'Price-to-sales ratio', 'example': 'price_to_sales < 2'},
    'peg_ratio': {'label': 'PEG Ratio', 'description': 'Price/earnings to growth ratio', 'example': 'peg_ratio < 1.5'},
    'enterprise_value': {'label': 'Enterprise Value', 'description': 'Enterprise value in INR', 'example': 'enterprise_value > 10000000000'},
    'dividend_yield': {'label': 'Dividend Yield', 'description': 'Annual dividend yield (%)', 'example': 'dividend_yield > 2'},
    'dividend_rate': {'label': 'Dividend Rate', 'description': 'Dividend payment rate', 'example': 'dividend_rate > 5'},
    'payout_ratio': {'label': 'Payout Ratio', 'description': 'Dividend payout ratio (%)', 'example': 'payout_ratio < 50'},
    'profit_margin': {'label': 'Profit Margin', 'description': 'Net profit margin (%)', 'example': 'profit_margin > 10'},
    'operating_margin': {'label': 'Operating Margin', 'description': 'Operating margin (%)', 'example': 'operating_margin > 15'},
    'return_on_equity': {'label': 'ROE', 'description': 'Return on equity (%)', 'example': 'return_on_equity > 15'},
    'return_on_assets': {'label': 'ROA', 'description': 'Return on assets (%)', 'example': 'return_on_assets > 5'},
    'earnings_growth': {'label': 'Earnings Growth', 'description': 'Year-over-year earnings growth (%)', 'example': 'earnings_growth > 20'},
    'revenue_growth': {'label': 'Revenue Growth', 'description': 'Year-over-year revenue growth (%)', 'example': 'revenue_growth > 15'},
    'total_cash': {'label': 'Total Cash', 'description': 'Total cash reserves in INR', 'example': 'total_cash > 1000000000'},
    'total_debt': {'label': 'Total Debt', 'description': 'Total debt outstanding in INR', 'example': 'total_debt < 5000000000'},
    'debt_to_equity': {'label': 'Debt/Equity', 'description': 'Debt-to-equity ratio', 'example': 'debt_to_equity < 1'},
    'current_ratio': {'label': 'Current Ratio', 'description': 'Current assets / current liabilities', 'example': 'current_ratio > 1.5'},
    'quick_ratio': {'label': 'Quick Ratio', 'description': 'Liquid assets / current liabilities', 'example': 'quick_ratio > 1'},
    'avg_volume': {'label': 'Avg Volume', 'description': 'Average daily trading volume', 'example': 'avg_volume > 500000'},
    'shares_outstanding': {'label': 'Shares Outstanding', 'description': 'Total shares outstanding', 'example': 'shares_outstanding > 10000000'},
}

# SQL columns to fetch (must match the keys in FUNDAMENTAL_VARIABLES)
FUNDAMENTAL_COLUMNS = list(FUNDAMENTAL_VARIABLES.keys())


def run_fundamental_screener(
    conn,
    expression: str,
    progress_cb: Optional[Callable] = None,
    result_cb: Optional[Callable] = None,
    abort_check: Optional[Callable] = None,
) -> Dict[str, Any]:
    """
    Screen stocks using fundamental data.

    Args:
        conn: psycopg2 connection
        expression: Boolean expression (e.g., "trailing_pe < 20 and return_on_equity > 15")
        progress_cb: Callback(processed, total, matches) for progress updates
        result_cb: Callback(result_dict) for each matching stock
        abort_check: Callback() -> bool, returns True if job should abort

    Returns:
        Dict with 'results', 'matched', 'universe', 'expression', 'fundamental_columns'
    """
    import sys
    import os
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    from expert_screener import ConditionEvaluator

    # Validate expression
    evaluator = ConditionEvaluator(expression)

    # Fetch all fundamentals in one query
    start_time = time.time()
    rows = _fetch_all_fundamentals(conn)
    load_time = time.time() - start_time
    logger.info(f"Loaded {len(rows)} stocks fundamentals in {load_time:.2f}s")

    if progress_cb:
        progress_cb(0, len(rows), 0)

    results = []
    matched = 0
    fundamental_columns = set()

    for i, row in enumerate(rows):
        if abort_check and abort_check():
            break

        # Build context dict for evaluation
        # Percentage fields stored as decimals (0.15 = 15%) are scaled to % for intuitive expressions
        PERCENT_FIELDS = {
            'profit_margin', 'operating_margin', 'return_on_equity', 'return_on_assets',
            'earnings_growth', 'revenue_growth', 'dividend_yield', 'payout_ratio',
        }
        context = {}
        for col in FUNDAMENTAL_COLUMNS:
            val = row.get(col)
            if val is not None:
                try:
                    fval = float(val)
                    # Scale decimal percentages to human-readable % (0.15 → 15.0)
                    if col in PERCENT_FIELDS and -1 < fval < 1:
                        fval *= 100
                    context[col] = fval
                except (ValueError, TypeError):
                    context[col] = None
            else:
                context[col] = None

        # Skip if any variable used in expression is None
        try:
            match = evaluator.evaluate(context)
        except (ValueError, TypeError, NameError):
            continue

        if match:
            matched += 1
            result_entry = {
                'symbol': row['symbol'],
                'companyName': row.get('company_name') or row['symbol'],
                'sector': row.get('sector') or 'N/A',
                'industry': row.get('industry') or 'N/A',
                'fundamentals': {},
            }

            for col in FUNDAMENTAL_COLUMNS:
                val = context.get(col)
                if val is not None:
                    result_entry['fundamentals'][col] = round(val, 4) if isinstance(val, float) and abs(val) < 1e12 else val
                    fundamental_columns.add(col)

            results.append(result_entry)
            if result_cb:
                result_cb(result_entry)

        if progress_cb and (i + 1) % 50 == 0:
            progress_cb(i + 1, len(rows), matched)

    if progress_cb:
        progress_cb(len(rows), len(rows), matched)

    return {
        'results': results,
        'matched': matched,
        'universe': len(rows),
        'expression': expression,
        'fundamental_columns': sorted(fundamental_columns),
    }


def _fetch_all_fundamentals(conn) -> List[Dict]:
    """Fetch all fundamental data from stock_fundamentals joined with tickers."""
    cursor = conn.cursor()

    col_list = ', '.join([f'sf.{col}' for col in FUNDAMENTAL_COLUMNS])

    query = f"""
        SELECT
            t.symbol,
            COALESCE(sf.long_name, t.name) as company_name,
            sf.sector,
            sf.industry,
            {col_list}
        FROM stock_fundamentals sf
        JOIN tickers t ON t.id = sf.ticker_id
        WHERE t.is_active = true
        ORDER BY sf.market_cap DESC NULLS LAST
    """

    try:
        cursor.execute(query)
        columns = [desc[0] for desc in cursor.description]
        rows = []
        for row in cursor.fetchall():
            rows.append(dict(zip(columns, row)))
        return rows
    except Exception as e:
        logger.error(f"Error fetching fundamentals: {e}")
        return []
    finally:
        cursor.close()
