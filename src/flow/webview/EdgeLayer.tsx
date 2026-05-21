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

// Renders every routed line segment + edge label exactly like the old SVG
// renderer (frank-config-layout generateSvg). It is a single non-interactive
// ReactFlow node positioned at (0,0) so it pans/zooms in lockstep with the
// Frank nodes drawn on top of it.
export default function EdgeLayer({ data }: NodeProps<EdgeLayerData>) {
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

      {data.segments.map((s, i) => {
        const color = STATUS_COLOR[s.status] ?? STATUS_COLOR[0];
        return (
          <line
            key={i}
            x1={s.x1}
            y1={s.y1}
            x2={s.x2}
            y2={s.y2}
            stroke={color}
            strokeWidth={3}
            markerEnd={s.last ? `url(#arrow-${s.status})` : undefined}
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
                fontFamily='"Inter", "trebuchet ms", sans-serif'
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
