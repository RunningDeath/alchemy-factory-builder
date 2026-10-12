"use client";

import { useMemo } from "react";
import dagre from "@dagrejs/dagre";
import { Background, Controls, Handle, MarkerType, Position, ReactFlow, type Edge, type Node, type NodeProps } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { beltEdgeData, type PlanView, type Step } from "@/lib/planView";
import { formatRate } from "@/lib/beltDisplay";
import { BeltEdge } from "@/components/graph/BeltEdge";
import { ItemIcon } from "@/components/ui/ItemIcon";
import { cn } from "@/lib/utils";

const NODE_WIDTH = 200;
const NODE_HEIGHT = 64;

type StepNode = Node<{ step: Step }, "step">;

function StepNodeView({ data }: NodeProps<StepNode>) {
    const { step } = data;
    const built = step.belt?.machinesBuilt ?? Math.ceil(step.node.deviceCount - 1e-6);
    const out = step.isRaw ? step.outputs.reduce((n, o) => n + o.rate, 0) : step.node.rate;
    return (
        <div
            className={cn(
                "flex items-center gap-2 rounded-xl border bg-[var(--surface)] px-2 py-2 shadow",
                step.isTarget ? "border-[var(--accent-gold)]" : step.isRaw ? "border-dashed border-[var(--border)]" : "border-[var(--border)]",
            )}
            style={{ width: NODE_WIDTH, height: NODE_HEIGHT }}
        >
            <Handle type="target" position={Position.Left} className="!h-2 !w-2 !border-0 !bg-[var(--accent-gold-dim)]" />
            <ItemIcon item={step.itemId} size={36} />
            <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-semibold text-[var(--text-primary)]">{step.itemName}</div>
                <div className="truncate text-[10px] text-[var(--text-muted)]">{step.isRaw ? "raw" : `${built}× ${step.deviceName}`}</div>
                <div className="font-mono text-[11px] text-[var(--accent-gold)]">{formatRate(out)}/min</div>
            </div>
            <Handle type="source" position={Position.Right} className="!h-2 !w-2 !border-0 !bg-[var(--accent-gold-dim)]" />
        </div>
    );
}

const nodeTypes = { step: StepNodeView };
const edgeTypes = { belt: BeltEdge };

/** Left-to-right layout: raw materials on the left, products on the right */
function layout(view: PlanView, beltSpeed: number): { nodes: StepNode[]; edges: Edge[] } {
    const g = new dagre.graphlib.Graph();
    g.setGraph({ rankdir: "LR", nodesep: 28, ranksep: 110, edgesep: 14 });
    g.setDefaultEdgeLabel(() => ({}));
    const edges = view.edges.filter((e) => e.rate > 0 || e.demand > 0);
    // Steps nothing flows through (seeds sit in their nursery) stay out of the chart
    const linked = new Set(edges.flatMap((e) => [e.source, e.target]));
    const steps = view.steps.filter((s) => linked.has(s.key) || s.isTarget);
    for (const s of steps) g.setNode(s.key, { width: NODE_WIDTH, height: NODE_HEIGHT });
    // Loops (fertilizer back to its nurseries) don't shape the layout: raw materials stay left
    for (const e of edges) if (!e.loop) g.setEdge(e.source, e.target);
    dagre.layout(g);
    return {
        nodes: steps.map((s) => {
            const p = g.node(s.key);
            return { id: s.key, type: "step", position: { x: p.x - NODE_WIDTH / 2, y: p.y - NODE_HEIGHT / 2 }, data: { step: s } };
        }),
        edges: edges.map((e) => {
            const data = beltEdgeData(e, beltSpeed);
            // Bend points between the node borders (the handles replace the end points)
            if (!e.loop) data.points = (g.edge(e.source, e.target)?.points ?? []).slice(1, -1);
            const color = e.short ? "var(--warning)" : e.loop ? "var(--accent-purple)" : data.fluid ? "var(--info)" : "var(--accent-gold-dim)";
            return {
                id: `${e.source}->${e.target}`,
                source: e.source,
                target: e.target,
                type: "belt",
                data,
                label: `${formatRate(e.rate)}/min${data.lines > 1 ? ` · ${data.lines} lines` : ""}`,
                style: { stroke: color, strokeWidth: 2 },
                markerEnd: { type: MarkerType.ArrowClosed, color },
            };
        }),
    };
}

/** The plan as a flow chart (pinch and drag on phones) */
export function PlanGraph({ view, beltSpeed }: { view: PlanView; beltSpeed: number }) {
    const { nodes, edges } = useMemo(() => layout(view, beltSpeed), [view, beltSpeed]);
    return (
        <div className="h-[70dvh] min-h-[420px] overflow-hidden rounded-xl border border-[var(--border)]">
            <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes} fitView minZoom={0.1} nodesDraggable={false} nodesConnectable={false}>
                <Background gap={24} color="var(--border-subtle)" />
                <Controls showInteractive={false} />
            </ReactFlow>
        </div>
    );
}
