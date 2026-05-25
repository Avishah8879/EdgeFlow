import { useQuery } from '@tanstack/react-query';

export type GroupType = 'sector' | 'industry';
export type PairMethod = 'correlation' | 'cointegration';

export interface PairTradingGroups {
  sectors: string[];
  industries: string[];
}

export interface PairMatrixResponse {
  symbols: string[];
  matrix: Array<Array<number | null>>;
  method: PairMethod;
  lookback_days: number;
  group_type: GroupType;
  group: string;
  truncated: boolean;
  symbol_cap: number;
  as_of: string | null;
  pvalues?: Array<Array<number | null>>;
}

export interface ScanConditions {
  correlationMin?: number;
  correlationMax?: number;
}

function unwrap<T>(raw: any, fallback: T): T {
  if (raw && typeof raw === 'object' && 'data' in raw) {
    return (raw.data ?? fallback) as T;
  }
  return (raw ?? fallback) as T;
}

export function usePairTradingGroups() {
  return useQuery<PairTradingGroups>({
    queryKey: ['/api/pair-trading/groups'],
    staleTime: 60 * 60 * 1000,
    select: (raw: any) => unwrap<PairTradingGroups>(raw, { sectors: [], industries: [] }),
  });
}

interface UsePairMatrixArgs {
  groupType: GroupType;
  group: string;
  method: PairMethod;
  lookbackDays: number;
  enabled?: boolean;
}

export function usePairMatrix({
  groupType,
  group,
  method,
  lookbackDays,
  enabled = true,
}: UsePairMatrixArgs) {
  const params = new URLSearchParams({
    group_type: groupType,
    group,
    method,
    lookback_days: String(lookbackDays),
  });
  return useQuery<PairMatrixResponse | null>({
    queryKey: [`/api/pair-trading/matrix?${params.toString()}`],
    enabled: enabled && group.length > 0,
    staleTime: 10 * 60 * 1000,
    select: (raw: any) => unwrap<PairMatrixResponse | null>(raw, null),
  });
}

export interface PairScanResult {
  symbolA: string;
  symbolB: string;
  correlation: number | null;
  beta: number | null;
  delta: number | null;
  pvalue?: number | null;
}

export interface PairScanResponse {
  results: PairScanResult[];
  total_pairs: number;
  truncated: boolean;
  symbol_cap: number;
  method: string;
  lookback_days: number;
  as_of: string | null;
}

interface UsePairScanArgs {
  groupType: GroupType;
  group: string;
  method: PairMethod;
  lookbackDays: number;
  conditions: ScanConditions;
  enabled: boolean;
}

export function usePairScan({
  groupType,
  group,
  method,
  lookbackDays,
  conditions,
  enabled,
}: UsePairScanArgs) {
  const params = new URLSearchParams({
    group_type: groupType,
    group,
    method,
    lookback_days: String(lookbackDays),
  });
  if (conditions.correlationMin !== undefined)
    params.set('min_correlation', String(conditions.correlationMin));
  if (conditions.correlationMax !== undefined)
    params.set('max_correlation', String(conditions.correlationMax));

  return useQuery<PairScanResponse | null>({
    queryKey: [`/api/pair-trading/scan?${params.toString()}`],
    enabled: enabled && group.length > 0,
    staleTime: 10 * 60 * 1000,
    select: (raw: any) => unwrap<PairScanResponse | null>(raw, null),
  });
}
