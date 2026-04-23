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
