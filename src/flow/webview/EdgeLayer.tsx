import { NodeProps } from 'reactflow';
import type { FlowSegment, FlowLabel } from '../layout-builder';

export interface EdgeLayerData {
  width: number;
  height: number;
  segments: FlowSegment[];
  labels: FlowLabel[];
}

const STATUS_COLOR: Record<number, string> = {
  0: '#8bc34a', // success
  1: '#FFDE59', // mixed
  2: '#ec4758', // error
};

const CORNER_RADIUS = 10;

// Groups consecutive segments into per-edge chains. Each chain ends at the
// segment with last=true.
function groupSegments(segments: FlowSegment[]): FlowSegment[][] {
  const groups: FlowSegment[][] = [];
  let current: FlowSegment[] = [];
  for (const seg of segments) {
    current.push(seg);
    if (seg.last) {
      groups.push(current);
      current = [];
    }
  }
  if (current.length > 0) { groups.push(current); }
  return groups;
}

// Converts a chain of segments into a smooth SVG path string, rounding each
// intermediate waypoint with a quadratic bézier so corners flow instead of
// snapping at right angles.
function buildSmoothPath(segs: FlowSegment[]): string {
  if (segs.length === 0) { return ''; }

  const pts = [
    { x: segs[0].x1, y: segs[0].y1 },
    ...segs.map((s) => ({ x: s.x2, y: s.y2 })),
  ];

  if (pts.length < 2) { return ''; }
  if (pts.length === 2) {
    return `M ${pts[0].x} ${pts[0].y} L ${pts[1].x} ${pts[1].y}`;
  }

  let d = `M ${pts[0].x} ${pts[0].y}`;

  for (let i = 1; i < pts.length - 1; i++) {
    const prev = pts[i - 1];
    const curr = pts[i];
    const next = pts[i + 1];

    const inDx = curr.x - prev.x;
    const inDy = curr.y - prev.y;
    const inLen = Math.sqrt(inDx * inDx + inDy * inDy);

    const outDx = next.x - curr.x;
    const outDy = next.y - curr.y;
    const outLen = Math.sqrt(outDx * outDx + outDy * outDy);

    if (inLen === 0 || outLen === 0) {
      d += ` L ${curr.x} ${curr.y}`;
      continue;
    }

    const r = Math.min(CORNER_RADIUS, inLen / 2, outLen / 2);
    const bx = curr.x - (inDx / inLen) * r;
    const by = curr.y - (inDy / inLen) * r;
    const ax = curr.x + (outDx / outLen) * r;
    const ay = curr.y + (outDy / outLen) * r;

    d += ` L ${bx} ${by} Q ${curr.x} ${curr.y} ${ax} ${ay}`;
  }

  const last = pts[pts.length - 1];
  d += ` L ${last.x} ${last.y}`;
  return d;
}

// Renders every routed edge + label as a smooth flowing path. It is a single
// non-interactive ReactFlow node positioned at (0,0) so it pans/zooms in
// lockstep with the Frank nodes drawn on top of it.
export default function EdgeLayer({ data }: NodeProps<EdgeLayerData>) {
  const edgeGroups = groupSegments(data.segments);

  return (
    <svg
      width={data.width}
      height={data.height}
      style={{ pointerEvents: 'none', overflow: 'visible', display: 'block' }}
    >
      <defs>
        {Object.entries(STATUS_COLOR).map(([status, color]) => (
          <marker
            key={status}
            id={`arrow-${status}`}
            viewBox="0 0 4 4"
            refX="4"
            refY="2"
            markerWidth="4"
            markerHeight="4"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 4 2 L 0 4 z" fill={color} />
          </marker>
        ))}
      </defs>

      {edgeGroups.map((segs, i) => {
        const status = segs[segs.length - 1].status;
        const color = STATUS_COLOR[status] ?? STATUS_COLOR[0];
        return (
          <path
            key={i}
            d={buildSmoothPath(segs)}
            stroke={color}
            strokeWidth={3}
            fill="none"
            markerEnd={`url(#arrow-${status})`}
          />
        );
      })}

      {data.labels.map((label, i) => {
        const cx = label.x + label.width / 2;
        const lineHeight = label.lines.length > 0 ? label.height / label.lines.length : label.height;
        return (
          <g key={`l${i}`} textAnchor="middle" dominantBaseline="middle">
            {label.lines.map((text, j) => (
              <text
                key={j}
                x={cx}
                y={label.y + lineHeight * (j + 0.5)}
                fontSize={10}
                fontFamily='var(--vscode-editor-font-family)'
                fill="var(--vscode-editor-foreground)"
              >
                {text}
              </text>
            ))}
          </g>
        );
      })}
    </svg>
  );
}
