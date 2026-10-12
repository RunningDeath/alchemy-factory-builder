import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, type EdgeProps } from "@xyflow/react";
import type { BeltEdgeData } from "../../lib/planView";

const CORNER = 10;

/**
 * A path through the layout's bend points with rounded corners: belts run in straight
 * segments and only bend where the layout routed them around other steps
 */
function routedPath(points: { x: number; y: number }[]): string {
    let d = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length - 1; i++) {
        const [a, b, c] = [points[i - 1], points[i], points[i + 1]];
        const p1 = towards(b, a, Math.min(CORNER, Math.hypot(b.x - a.x, b.y - a.y) / 2));
        const p2 = towards(b, c, Math.min(CORNER, Math.hypot(c.x - b.x, c.y - b.y) / 2));
        d += ` L ${p1.x} ${p1.y} Q ${b.x} ${b.y} ${p2.x} ${p2.y}`;
    }
    const last = points[points.length - 1];
    return `${d} L ${last.x} ${last.y}`;
}

function towards(from: { x: number; y: number }, to: { x: number; y: number }, distance: number) {
    const length = Math.hypot(to.x - from.x, to.y - from.y) || 1;
    return { x: from.x + ((to.x - from.x) / length) * distance, y: from.y + ((to.y - from.y) / length) * distance };
}

/** A belt: thicker for each extra line it needs; loops (fertilizer, fuel going back) dashed */
export function BeltEdge({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd, style, data, label }: EdgeProps) {
    const d = data as BeltEdgeData | undefined;
    let path: string;
    let labelX: number;
    let labelY: number;
    if (d?.points?.length && !d.loop) {
        const points = [{ x: sourceX, y: sourceY }, ...d.points, { x: targetX, y: targetY }];
        path = routedPath(points);
        const mid = points[Math.floor(points.length / 2)];
        [labelX, labelY] = [mid.x, mid.y];
    } else {
        // Loops run back against the flow: a step path around the nodes reads better
        [path, labelX, labelY] = getSmoothStepPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, borderRadius: CORNER, offset: 24 });
    }
    const lines = d?.lines ?? 1;
    return (
        <>
            <BaseEdge path={path} markerEnd={markerEnd} style={{ ...style, strokeWidth: 1.5 + (Math.min(lines, 4) - 1) * 1.5, strokeDasharray: d?.loop ? "6 4" : undefined }} />
            {label && (
                <EdgeLabelRenderer>
                    <div
                        className="nodrag nopan pointer-events-none absolute rounded bg-[var(--surface)] px-1 font-mono text-[10px] text-[var(--text-secondary)]"
                        style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
                    >
                        {label}
                    </div>
                </EdgeLabelRenderer>
            )}
        </>
    );
}
