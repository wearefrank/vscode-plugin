// Runs on the extension host. Converts a Mermaid flowchart string into a
// serializable graph by reusing the EXACT layout algorithm from
// @frankframework/frank-config-layout (the same one that produced the SVG),
// but stopping at the `Layout` object instead of rendering SVG. The resulting
// JSON is posted to the React/ReactFlow webview.
//
// Requires the global `DOMParser` to be set (frank-config-layout's
// createNodeText uses it). The caller (FlowViewProvider) installs the jsdom
// DOMParser before invoking this — same precondition the old mermaid2svg path
// already relied on.

import {
    getGraphFromMermaid,
    findErrorFlow,
    calculateLayerNumbers,
    introduceIntermediateNodesAndEdges,
    LayoutBase,
    minimizeNumCrossings,
    LayoutModelBuilder,
    LayoutBuilder,
    getDerivedEdgeLabelDimensions,
    getFactoryDimensions,
    LAYERS_LONGEST_PATH,
    ERROR_STATUS_ERROR,
} from "@frankframework/frank-config-layout";

export interface FlowNode {
    id: string;
    // The pipe's @name attribute — used to navigate back to the XML source.
    pipeName: string;
    // Short class name (last segment after the last '.'), e.g. "ApiListenerPipe".
    // Empty string when no class annotation is present.
    subLabel: string;
    x: number;
    y: number;
    width: number;
    height: number;
    error: boolean;
}

// One straight line segment. Frank routes edges as a chain of segments
// through invisible intermediate nodes; we draw each segment exactly like the
// SVG renderer did (arrowhead only on the last segment of an edge).
export interface FlowSegment {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    // 0 = success (green), 1 = mixed (yellow), 2 = error (red)
    status: number;
    last: boolean;
}

export interface FlowLabel {
    x: number;
    y: number;
    width: number;
    height: number;
    lines: string[];
}

export interface FlowGraph {
    width: number;
    height: number;
    nodes: FlowNode[];
    segments: FlowSegment[];
    labels: FlowLabel[];
}

interface IntervalLike {
    minValue: number;
    size: number;
    center: number;
}

interface NodeTextPartLike {
    name: string;
    text: string;
}

interface PlacedNodeLike {
    id: string;
    text: { html: string; parts: NodeTextPartLike[] };
    errorStatus: number;
    horizontalBox: IntervalLike;
    verticalBox: IntervalLike;
}

interface LineSegmentLike {
    line: {
        startPoint: { x: number; y: number };
        endPoint: { x: number; y: number };
    };
    errorStatus: number;
    isLastLineSegment: boolean;
}

interface EdgeLabelLike {
    horizontalBox: IntervalLike;
    verticalBox: IntervalLike;
    text: { lines: { text: string }[] };
}

interface LayoutLike {
    width: number;
    height: number;
    nodes: PlacedNodeLike[];
    layoutLineSegments: LineSegmentLike[];
    edgeLabels: EdgeLabelLike[];
}

// Pull the pipe's @name out of the rich label. The XSL emits the name as the
// first <b> element (see adapter2mermaid.xsl createMermaidElement: $text =
// (@name,name())[1]).
function extractPipeName(parts: NodeTextPartLike[], html: string): string {
    const bold = parts.find((p) => p.name === "b");
    if (bold && bold.text.trim() !== "") {
        return bold.text.trim();
    }
    // Fallback: strip tags from the html.
    return html.replace(/<[^>]+>/g, "").split(/\r?\n/)[0].trim();
}

// Extract the short class name from the non-bold label parts. The XSL puts a
// fully-qualified class name there (e.g. "org.frankframework.pipes.EchoPipe");
// we keep only the last segment after the last dot for brevity.
function extractSubLabel(parts: NodeTextPartLike[]): string {
    const text = parts
        .filter((p) => p.name !== "b" && p.text.trim() !== "")
        .map((p) => p.text)
        .join("")
        .trim();
    if (!text) { return ""; }
    const lastDot = text.lastIndexOf(".");
    return lastDot >= 0 ? text.slice(lastDot + 1) : text;
}

// Replicates frank-config-layout's mermaid2svgStatisticsImpl pipeline up to
// (but not including) generateSvg, using only public exports.
export function buildFlowGraph(mermaid: string): FlowGraph {
    const dimensions = getFactoryDimensions();

    const mermaidGraph = getGraphFromMermaid(mermaid, dimensions, dimensions);
    const errorFlow = findErrorFlow(mermaidGraph);
    const nodeIdToLayer = calculateLayerNumbers(errorFlow, LAYERS_LONGEST_PATH);
    const intermediates = introduceIntermediateNodesAndEdges(errorFlow, nodeIdToLayer);

    let layoutBase = LayoutBase.create(
        intermediates.intermediate.nodes.map((n) => n.id),
        intermediates.intermediate
    );
    layoutBase = minimizeNumCrossings(layoutBase);

    const layoutModel = new LayoutModelBuilder(layoutBase, intermediates.intermediate).run();
    const layout = new LayoutBuilder(
        layoutModel,
        intermediates.original,
        dimensions,
        getDerivedEdgeLabelDimensions(dimensions)
    ).run() as unknown as LayoutLike;

    const nodes: FlowNode[] = layout.nodes.map((n) => ({
        id: n.id,
        pipeName: extractPipeName(n.text.parts, n.text.html),
        subLabel: extractSubLabel(n.text.parts),
        x: n.horizontalBox.minValue,
        y: n.verticalBox.minValue,
        width: n.horizontalBox.size,
        height: n.verticalBox.size,
        error: n.errorStatus === ERROR_STATUS_ERROR,
    }));

    const segments: FlowSegment[] = layout.layoutLineSegments.map((s) => ({
        x1: s.line.startPoint.x,
        y1: s.line.startPoint.y,
        x2: s.line.endPoint.x,
        y2: s.line.endPoint.y,
        status: s.errorStatus,
        last: s.isLastLineSegment,
    }));

    const labels: FlowLabel[] = layout.edgeLabels.map((l) => ({
        x: l.horizontalBox.minValue,
        y: l.verticalBox.minValue,
        width: l.horizontalBox.size,
        height: l.verticalBox.size,
        lines: l.text.lines.map((line) => line.text),
    }));

    return { width: layout.width, height: layout.height, nodes, segments, labels };
}
