import type { PatternKeyPoint } from './PatternChartExpansion';

interface PixelPoint {
  x: number;
  y: number;
  label: string;
}

interface Props {
  patternType: string;
  points: PixelPoint[];
  color: string;
  containerWidth: number;
  containerHeight: number;
  confidence: number;
}

/**
 * Draws pattern-specific SVG overlays on top of the candlestick chart.
 *
 * Each pattern expects `points` in a specific order (matching what the
 * backend pattern detectors emit in `keyPoints`):
 *
 *   Head and Shoulders / Inverse:  [Left Shoulder, Head, Right Shoulder, Neckline L, Neckline R]
 *   Double Top / Bottom:           [P1, mid, P2]
 *   Triple Top:                    [Peak 1, Trough 1, Peak 2, Trough 2, Peak 3]
 *   Triple Bottom:                 [Bottom 1, Peak 1, Bottom 2, Peak 2, Bottom 3]
 *   Triangles / Wedges / Channels: [Upper Start, Upper End, Lower Start, Lower End]
 *   Bullish/Bearish Flag:          [Pole Start, Pole End, Flag Top S, Flag Top E, Flag Bot S, Flag Bot E]
 *   Pennant:                       [Pole Start, Pole End, Upper Start, Upper End, Lower Start, Lower End]
 *   Cup and Handle:                [Cup Start, Cup Bottom, Cup End, Handle Start, Handle Low, Handle End]
 *   Rounding Top / Bottom:         [Start, Vertex, End]
 */
export function PatternShape({ patternType, points, color, containerWidth, containerHeight, confidence }: Props) {
  if (points.length === 0) return null;

  const common = {
    stroke: color,
    fill: 'none',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };

  const dot = (p: PixelPoint, key: string, radius = 4) => (
    <circle key={key} cx={p.x} cy={p.y} r={radius} fill={color} opacity={0.9} />
  );

  const textLabel = (p: PixelPoint, key: string, offsetY = -10) => (
    <text
      key={`${key}-text`}
      x={p.x}
      y={p.y + offsetY}
      fill={color}
      fontSize={10}
      fontWeight="600"
      textAnchor="middle"
      style={{ paintOrder: 'stroke', stroke: '#0f172a', strokeWidth: 3 }}
    >
      {p.label}
    </text>
  );

  let shape: JSX.Element | null = null;

  switch (patternType) {
    case 'Head and Shoulders':
    case 'Inverse Head and Shoulders': {
      if (points.length < 5) break;
      const [ls, head, rs, nl, nr] = points;
      // Extend neckline slightly past both shoulders
      const slope = (nr.y - nl.y) / (nr.x - nl.x || 1);
      const extLeftX = ls.x;
      const extLeftY = nl.y + slope * (ls.x - nl.x);
      const extRightX = rs.x;
      const extRightY = nl.y + slope * (rs.x - nl.x);
      shape = (
        <>
          <polyline points={`${ls.x},${ls.y} ${nl.x},${nl.y} ${head.x},${head.y} ${nr.x},${nr.y} ${rs.x},${rs.y}`} {...common} />
          <line x1={extLeftX} y1={extLeftY} x2={extRightX} y2={extRightY} stroke={color} strokeDasharray="4 3" strokeWidth={1.5} opacity={0.8} />
          {dot(ls, 'ls')}
          {dot(head, 'head')}
          {dot(rs, 'rs')}
          {textLabel(ls, 'ls')}
          {textLabel(head, 'head')}
          {textLabel(rs, 'rs')}
        </>
      );
      break;
    }

    case 'Double Top': {
      if (points.length < 3) break;
      const [p1, trough, p2] = points;
      // Horizontal resistance connecting peaks
      shape = (
        <>
          <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke={color} strokeDasharray="5 3" strokeWidth={1.5} opacity={0.75} />
          <polyline points={`${p1.x},${p1.y} ${trough.x},${trough.y} ${p2.x},${p2.y}`} {...common} />
          {dot(p1, 'p1')}
          {dot(trough, 'tr')}
          {dot(p2, 'p2')}
          {textLabel(p1, 'p1')}
          {textLabel(p2, 'p2')}
          {textLabel(trough, 'tr', 14)}
        </>
      );
      break;
    }

    case 'Double Bottom': {
      if (points.length < 3) break;
      const [b1, peak, b2] = points;
      shape = (
        <>
          <line x1={b1.x} y1={b1.y} x2={b2.x} y2={b2.y} stroke={color} strokeDasharray="5 3" strokeWidth={1.5} opacity={0.75} />
          <polyline points={`${b1.x},${b1.y} ${peak.x},${peak.y} ${b2.x},${b2.y}`} {...common} />
          {dot(b1, 'b1')}
          {dot(peak, 'pk')}
          {dot(b2, 'b2')}
          {textLabel(b1, 'b1', 14)}
          {textLabel(b2, 'b2', 14)}
          {textLabel(peak, 'pk')}
        </>
      );
      break;
    }

    case 'Ascending Triangle':
    case 'Descending Triangle':
    case 'Symmetric Triangle':
    case 'Rising Wedge':
    case 'Falling Wedge':
    case 'Ascending Channel':
    case 'Descending Channel': {
      if (points.length < 4) break;
      const [us, ue, ls, le] = points;
      shape = (
        <>
          <line x1={us.x} y1={us.y} x2={ue.x} y2={ue.y} {...common} />
          <line x1={ls.x} y1={ls.y} x2={le.x} y2={le.y} {...common} />
          {dot(us, 'us', 3)}
          {dot(ue, 'ue', 3)}
          {dot(ls, 'ls', 3)}
          {dot(le, 'le', 3)}
        </>
      );
      break;
    }

    case 'Triple Top': {
      if (points.length < 5) break;
      const [p1, t1, p2, t2, p3] = points;
      shape = (
        <>
          <line x1={p1.x} y1={p1.y} x2={p3.x} y2={p3.y} stroke={color} strokeDasharray="5 3" strokeWidth={1.5} opacity={0.75} />
          <polyline points={`${p1.x},${p1.y} ${t1.x},${t1.y} ${p2.x},${p2.y} ${t2.x},${t2.y} ${p3.x},${p3.y}`} {...common} />
          {dot(p1, 'p1')}
          {dot(p2, 'p2')}
          {dot(p3, 'p3')}
          {dot(t1, 't1', 3)}
          {dot(t2, 't2', 3)}
          {textLabel(p1, 'p1')}
          {textLabel(p2, 'p2')}
          {textLabel(p3, 'p3')}
        </>
      );
      break;
    }

    case 'Triple Bottom': {
      if (points.length < 5) break;
      const [b1, k1, b2, k2, b3] = points;
      shape = (
        <>
          <line x1={b1.x} y1={b1.y} x2={b3.x} y2={b3.y} stroke={color} strokeDasharray="5 3" strokeWidth={1.5} opacity={0.75} />
          <polyline points={`${b1.x},${b1.y} ${k1.x},${k1.y} ${b2.x},${b2.y} ${k2.x},${k2.y} ${b3.x},${b3.y}`} {...common} />
          {dot(b1, 'b1')}
          {dot(b2, 'b2')}
          {dot(b3, 'b3')}
          {dot(k1, 'k1', 3)}
          {dot(k2, 'k2', 3)}
          {textLabel(b1, 'b1', 14)}
          {textLabel(b2, 'b2', 14)}
          {textLabel(b3, 'b3', 14)}
        </>
      );
      break;
    }

    case 'Rounding Top':
    case 'Rounding Bottom': {
      if (points.length < 3) break;
      const [start, vertex, end] = points;
      // Quadratic curve through start → vertex → end. Solve control point
      // so the bezier passes through `vertex` at t=0.5: control = 2*vertex - 0.5*(start + end).
      const controlX = 2 * vertex.x - 0.5 * (start.x + end.x);
      const controlY = 2 * vertex.y - 0.5 * (start.y + end.y);
      const path = `M ${start.x} ${start.y} Q ${controlX} ${controlY}, ${end.x} ${end.y}`;
      shape = (
        <>
          <path d={path} {...common} />
          {dot(start, 'rs', 3)}
          {dot(vertex, 'rv', 4)}
          {dot(end, 're', 3)}
          {textLabel(vertex, 'rv', patternType === 'Rounding Top' ? -12 : 14)}
        </>
      );
      break;
    }

    case 'Bullish Flag':
    case 'Bearish Flag': {
      if (points.length < 6) break;
      const [poleS, poleE, fts, fte, fbs, fbe] = points;
      shape = (
        <>
          <line x1={poleS.x} y1={poleS.y} x2={poleE.x} y2={poleE.y} stroke={color} strokeWidth={3} opacity={0.85} />
          <line x1={fts.x} y1={fts.y} x2={fte.x} y2={fte.y} {...common} />
          <line x1={fbs.x} y1={fbs.y} x2={fbe.x} y2={fbe.y} {...common} />
          <line x1={fts.x} y1={fts.y} x2={fbs.x} y2={fbs.y} stroke={color} strokeDasharray="3 3" strokeWidth={1} opacity={0.6} />
          <line x1={fte.x} y1={fte.y} x2={fbe.x} y2={fbe.y} stroke={color} strokeDasharray="3 3" strokeWidth={1} opacity={0.6} />
          {dot(poleS, 'ps', 3)}
          {dot(poleE, 'pe', 3)}
          {textLabel(poleE, 'pole', -14)}
        </>
      );
      break;
    }

    case 'Pennant': {
      if (points.length < 6) break;
      const [poleS, poleE, us, ue, ls, le] = points;
      shape = (
        <>
          <line x1={poleS.x} y1={poleS.y} x2={poleE.x} y2={poleE.y} stroke={color} strokeWidth={3} opacity={0.85} />
          <line x1={us.x} y1={us.y} x2={ue.x} y2={ue.y} {...common} />
          <line x1={ls.x} y1={ls.y} x2={le.x} y2={le.y} {...common} />
          {dot(poleE, 'pe', 3)}
          {textLabel(poleE, 'pole', -14)}
        </>
      );
      break;
    }

    case 'Cup and Handle': {
      if (points.length < 6) break;
      const [cs, cb, ce, hs, hl, he] = points;
      // Cup: cubic Bezier through cs → cb → ce with control points that curve the arc
      const cupControl1X = cs.x + (cb.x - cs.x) * 0.4;
      const cupControl1Y = cb.y;
      const cupControl2X = ce.x - (ce.x - cb.x) * 0.4;
      const cupControl2Y = cb.y;
      const cupPath = `M ${cs.x} ${cs.y} C ${cupControl1X} ${cupControl1Y}, ${cupControl2X} ${cupControl2Y}, ${ce.x} ${ce.y}`;
      // Handle: line from hs → hl → he
      const handlePath = `M ${hs.x} ${hs.y} L ${hl.x} ${hl.y} L ${he.x} ${he.y}`;
      shape = (
        <>
          <path d={cupPath} {...common} />
          <path d={handlePath} {...common} strokeDasharray="0" />
          {dot(cs, 'cs', 3)}
          {dot(cb, 'cb', 4)}
          {dot(ce, 'ce', 3)}
          {dot(hl, 'hl', 3)}
          {textLabel(cb, 'cup', 14)}
          {textLabel(hl, 'handle', 14)}
        </>
      );
      break;
    }

    default:
      shape = null;
  }

  if (!shape) return null;

  // Badge at the first keypoint
  const first = points[0];

  return (
    <svg
      className="absolute inset-0 pointer-events-none"
      width={containerWidth}
      height={containerHeight}
      style={{ overflow: 'visible' }}
    >
      {shape}
      <g transform={`translate(${Math.max(4, first.x)}, ${Math.max(14, first.y - 22)})`}>
        <rect
          x={-2}
          y={-11}
          rx={3}
          ry={3}
          width={`${patternType.length * 6.2 + 40}`}
          height={16}
          fill="#1f2937"
          stroke={color}
        />
        <text x={3} y={1} fill={color} fontSize={10} fontWeight={600}>
          {patternType} · {confidence}%
        </text>
      </g>
    </svg>
  );
}
