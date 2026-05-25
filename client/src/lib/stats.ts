export function calculatePearsonCorrelation(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n === 0) return 0;

  let sumX = 0;
  let sumY = 0;
  for (let i = 0; i < n; i++) {
    sumX += x[i];
    sumY += y[i];
  }
  const meanX = sumX / n;
  const meanY = sumY / n;

  let num = 0;
  let denX = 0;
  let denY = 0;

  for (let i = 0; i < n; i++) {
    const dx = x[i] - meanX;
    const dy = y[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }

  if (denX === 0 || denY === 0) return 0;
  return num / Math.sqrt(denX * denY);
}

export interface OhlcPoint {
  date: string;
  close: number;
}

export interface NormalizedSeriesRow {
  date: string;
  [symbol: string]: string | number;
}

export function buildNormalizedSeries(
  seriesBySymbol: Record<string, OhlcPoint[]>,
  symbols: string[],
): NormalizedSeriesRow[] {
  if (symbols.length === 0) return [];

  const dateToCloses: Record<string, Record<string, number>> = {};
  const basePrices: Record<string, number> = {};

  for (const symbol of symbols) {
    const points = seriesBySymbol[symbol];
    if (!points || points.length === 0) continue;
    basePrices[symbol] = points[0].close;
    for (const point of points) {
      if (!dateToCloses[point.date]) dateToCloses[point.date] = {};
      dateToCloses[point.date][symbol] = point.close;
    }
  }

  const sortedDates = Object.keys(dateToCloses).sort();

  const rows: NormalizedSeriesRow[] = [];
  for (const date of sortedDates) {
    const row: NormalizedSeriesRow = { date };
    let complete = true;
    for (const symbol of symbols) {
      const close = dateToCloses[date][symbol];
      const base = basePrices[symbol];
      if (close === undefined || base === undefined) {
        complete = false;
        break;
      }
      row[symbol] = parseFloat((((close - base) / base) * 100).toFixed(2));
    }
    if (complete) rows.push(row);
  }
  return rows;
}

export interface PairScatterPoint {
  date: string;
  xValue: number;
  yValue: number;
}

export function buildPairScatter(
  normalized: NormalizedSeriesRow[],
  xSymbol: string,
  ySymbol: string,
): PairScatterPoint[] {
  if (!xSymbol || !ySymbol) return [];
  const out: PairScatterPoint[] = [];
  for (const row of normalized) {
    const xv = row[xSymbol];
    const yv = row[ySymbol];
    if (typeof xv === 'number' && typeof yv === 'number') {
      out.push({ date: row.date, xValue: xv, yValue: yv });
    }
  }
  return out;
}

export function olsRegression(x: number[], y: number[]): { beta: number; alpha: number } {
  const n = Math.min(x.length, y.length);
  if (n < 2) return { beta: 0, alpha: 0 };

  let sumX = 0;
  let sumY = 0;
  for (let i = 0; i < n; i++) {
    sumX += x[i];
    sumY += y[i];
  }
  const meanX = sumX / n;
  const meanY = sumY / n;

  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - meanX;
    num += dx * (y[i] - meanY);
    den += dx * dx;
  }

  if (den === 0) return { beta: 0, alpha: meanY };
  const beta = num / den;
  return { beta, alpha: meanY - beta * meanX };
}

export function buildRegressionLine(
  scatter: PairScatterPoint[],
  beta: number,
  alpha: number,
): PairScatterPoint[] {
  if (scatter.length < 2 || !Number.isFinite(beta) || !Number.isFinite(alpha)) return [];
  let minX = Infinity;
  let maxX = -Infinity;
  for (const p of scatter) {
    if (p.xValue < minX) minX = p.xValue;
    if (p.xValue > maxX) maxX = p.xValue;
  }
  if (!Number.isFinite(minX) || !Number.isFinite(maxX) || minX === maxX) return [];
  return [
    { date: 'start', xValue: minX, yValue: alpha + beta * minX },
    { date: 'end', xValue: maxX, yValue: alpha + beta * maxX },
  ];
}

export interface ResidualPoint {
  date: string;
  residual: number;
}

export function computeResiduals(
  scatter: PairScatterPoint[],
  beta: number,
  alpha: number,
): ResidualPoint[] {
  if (scatter.length === 0 || !Number.isFinite(beta) || !Number.isFinite(alpha)) return [];
  return scatter.map((p) => ({
    date: p.date,
    residual: parseFloat((p.yValue - (alpha + beta * p.xValue)).toFixed(4)),
  }));
}

export function residualStdDev(residuals: ResidualPoint[]): number {
  if (residuals.length < 2) return 0;
  const values = residuals.map((r) => r.residual);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}
