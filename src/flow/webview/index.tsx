import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import ReactFlow, {
  Background,
  Controls,
  Node,
  NodeMouseHandler,
  ReactFlowProvider,
} from 'reactflow';
import 'reactflow/dist/style.css';
import FrankNode, { FrankNodeData } from './FrankNode';
import EdgeLayer, { EdgeLayerData } from './EdgeLayer';
import type { FlowGraph } from '../layout-builder';

interface AdapterGraph {
  name: string;
  graph: FlowGraph | null;
  error: string | null;
}

type WebviewState =
  | { kind: 'empty' }
  | { kind: 'error'; message: string }
  | { kind: 'graph'; adapters: AdapterGraph[] };

const vscode = (window as any).acquireVsCodeApi();

const nodeTypes = { frank: FrankNode, edges: EdgeLayer };

function buildNodes(graph: FlowGraph): Node[] {
  const edgeLayer: Node<EdgeLayerData> = {
    id: '__edges__',
    type: 'edges',
    position: { x: 0, y: 0 },
    data: {
      width: graph.width,
      height: graph.height,
      segments: graph.segments,
      labels: graph.labels,
    },
    draggable: false,
    selectable: false,
    focusable: false,
    deletable: false,
    zIndex: 0,
    style: { width: graph.width, height: graph.height },
  };

  const frankNodes: Node<FrankNodeData>[] = graph.nodes.map((n) => ({
    id: n.id,
    type: 'frank',
    position: { x: n.x, y: n.y },
    data: {
      pipeName: n.pipeName,
      subLabel: n.subLabel,
      error: n.error,
      width: n.width,
      height: n.height,
    },
    draggable: false,
    connectable: false,
    selectable: true,
    zIndex: 1,
    style: { width: n.width, height: n.height },
  }));

  return [edgeLayer, ...frankNodes];
}

function FlowCanvas({ adapter, fullHeight }: { adapter: AdapterGraph; fullHeight: boolean }) {
  const nodes = useMemo(
    () => (adapter.graph ? buildNodes(adapter.graph) : []),
    [adapter.graph]
  );

  const onNodeClick: NodeMouseHandler = (_event, node) => {
    if (node.type === 'frank') {
      const data = node.data as FrankNodeData;
      vscode.postMessage({ type: 'navigate', pipeName: data.pipeName, adapterName: adapter.name });
    }
  };

  if (adapter.error) {
    return (
      <pre style={{ color: 'var(--vscode-errorForeground)', padding: 10, whiteSpace: 'pre-wrap' }}>
        Failed to render adapter "{adapter.name}":{'\n'}
        {adapter.error}
      </pre>
    );
  }

  return (
    <div style={{ width: '100%', height: fullHeight ? '100%' : '75vh' }}>
      <ReactFlowProvider>
        <ReactFlow
          nodes={nodes}
          edges={[]}
          nodeTypes={nodeTypes}
          fitView
          minZoom={0.1}
          maxZoom={4}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable
          proOptions={{ hideAttribution: true }}
          onNodeClick={onNodeClick}
        >
          <Background color="var(--vscode-editorWidget-border)" gap={20} />
          <Controls showInteractive={false} />

        </ReactFlow>
      </ReactFlowProvider>
    </div>
  );
}

function App() {
  const [state, setState] = useState<WebviewState>({ kind: 'empty' });

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data;
      if (msg && msg.type === 'state') {
        setState(msg.state as WebviewState);
      }
    };
    window.addEventListener('message', handler);
    vscode.postMessage({ type: 'ready' });
    return () => window.removeEventListener('message', handler);
  }, []);

  if (state.kind === 'empty') {
    return (
      <div style={{ padding: 16, fontFamily: 'sans-serif' }}>
        <h2>Hello!</h2>
        <p>Open a Frank!Configuration to get started :)</p>
      </div>
    );
  }

  if (state.kind === 'error') {
    return (
      <div style={{ padding: 16, fontFamily: 'sans-serif', color: 'var(--vscode-errorForeground)' }}>
        <h2>Error</h2>
        <p>Something is wrong with your XML :(</p>
        <pre
          style={{
            background: 'var(--vscode-editorWidget-background)',
            borderLeft: '4px solid var(--vscode-errorForeground)',
            padding: 8,
            whiteSpace: 'pre-wrap',
          }}
        >
          {state.message}
        </pre>
      </div>
    );
  }

  const adapters = state.adapters;
  const single = adapters.length === 1;

  if (single) {
    return (
      <div style={{ width: '100%', height: '100%' }}>
        <FlowCanvas adapter={adapters[0]} fullHeight />
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height: '100%', overflowY: 'auto' }}>
      {adapters.map((adapter, i) => (
        <div
          key={`${adapter.name}-${i}`}
          style={{
            border: '1px solid var(--vscode-editorWidget-border, #555)',
            borderRadius: 6,
            margin: 8,
          }}
        >
          <div
            style={{
              fontSize: 12,
              fontWeight: 'bold',
              padding: '6px 10px',
              borderBottom: '1px solid var(--vscode-editorWidget-border, #555)',
              whiteSpace: 'nowrap',
            }}
          >
            {adapter.name}
          </div>
          <FlowCanvas adapter={adapter} fullHeight={false} />
        </div>
      ))}
    </div>
  );
}

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(<App />);
}
