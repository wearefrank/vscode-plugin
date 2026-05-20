import React from 'react';
import { NodeProps } from 'reactflow';

export interface FrankNodeData {
  pipeName: string;
  subLabel: string;
  error: boolean;
  width: number;
  height: number;
}

export default function FrankNode({ data, selected }: NodeProps<FrankNodeData>) {
  const borderColor = data.error ? '#ec4758' : '#8bc34a';

  return (
    <div
      title={`Go to "${data.pipeName}"`}
      style={{
        width: data.width,
        height: data.height,
        boxSizing: 'border-box',
        border: `4px solid ${borderColor}`,
        borderRadius: 5,
        background: 'transparent',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: '4px 6px',
        cursor: 'pointer',
        fontFamily: '"Inter", "trebuchet ms", sans-serif',
        color: 'var(--vscode-editor-foreground)',
        outline: selected ? '2px solid var(--vscode-focusBorder)' : 'none',
        overflow: 'hidden',
      }}
    >
      <span style={{ fontWeight: 'bold', fontSize: 14, lineHeight: 1.2, wordBreak: 'break-word' }}>
        {data.pipeName}
      </span>
      {data.subLabel && (
        <span
          style={{
            fontSize: 10,
            lineHeight: 1.2,
            color: '#909090',
            marginTop: 2,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            maxWidth: '100%',
          }}
        >
          {data.subLabel}
        </span>
      )}
    </div>
  );
}
