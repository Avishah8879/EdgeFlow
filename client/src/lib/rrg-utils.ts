export type RRGQuadrant = 'Leading' | 'Weakening' | 'Improving' | 'Lagging';

/**
 * Classify a stock into an RRG quadrant using raw RS-Ratio and RS-Momentum.
 *
 * Both values are centered at 100 (the benchmark baseline). The quadrant
 * boundaries sit at exactly 100 on each axis, matching the chart's x=0/y=0
 * reference lines (which correspond to ratio=100 / mom=100 in raw space via
 * the transform x=(ratio-100)*res, y=mom-100).
 *
 * Boundary convention: a value of exactly 100 is treated as "not above",
 * so (100, 100) falls into 'Lagging' (lower-left quadrant).
 */
export function classifyQuadrant(rsRatio: number, rsMom: number): RRGQuadrant {
  const ratioAbove = rsRatio > 100;
  const momAbove   = rsMom   > 100;
  if ( ratioAbove &&  momAbove) return 'Leading';
  if ( ratioAbove && !momAbove) return 'Weakening';
  if (!ratioAbove &&  momAbove) return 'Improving';
  return 'Lagging';
}
