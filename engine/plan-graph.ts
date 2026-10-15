/**
 * Flattens production trees into distinct nodes and edges.
 * Nodes that share a key are merged (rates and machines summed); edges carry
 * the rate each consumer takes from each source. Used by the graph view and
 * the belt/flow analysis so both see the same network.
 */
import { ProductionNode } from "./types";

export const EDGE_KEY_SEPARATOR = "___";

export function nodeKeyOf(node: ProductionNode): string {
    return node.id || node.itemName;
}

export function edgeKey(source: string, target: string): string {
    return `${source}${EDGE_KEY_SEPARATOR}${target}`;
}

export function splitEdgeKey(key: string): [source: string, target: string] {
    const [source, target] = key.split(EDGE_KEY_SEPARATOR);
    return [source, target];
}

export interface PlanGraph {
    /** Merged nodes by key (inputs cleared) */
    nodes: Map<string, ProductionNode>;
    /** Demand rate per edge, keyed by edgeKey(source, target) */
    edgeRates: Map<string, number>;
}

export function collectPlanGraph(rootNodes: ProductionNode[]): PlanGraph {
    const mergedNodes = new Map<string, ProductionNode>();
    const edgeRates = new Map<string, number>();
    // Each node object once: the planner shares producer nodes between consumers, and
    // loops (fertilizer back to the nurseries that make it) would otherwise never end
    const seen = new Set<ProductionNode>();
    const addEdgeRate = (key: string, rate: number) => edgeRates.set(key, (edgeRates.get(key) || 0) + rate);

    function visit(node: ProductionNode) {
        if (seen.has(node)) return;
        seen.add(node);
        const key = nodeKeyOf(node);
        if (!node.isConsumptionReference) {
            const existing = mergedNodes.get(key);
            if (existing) {
                existing.rate += node.rate;
                existing.deviceCount += node.deviceCount;
                existing.heatConsumption += node.heatConsumption;
                existing.suppliedRate = (existing.suppliedRate || 0) + (node.suppliedRate || 0);
                existing.isBeltSaturated = existing.rate > (existing.beltLimit || 60);
            } else {
                mergedNodes.set(key, { ...node, inputs: [], byproducts: node.byproducts.map((b) => ({ ...b })) });
            }
        }
        for (const input of node.inputs) {
            const inputKey = nodeKeyOf(input);
            // A fuel/fertilizer reference carries its own rate; a shared producer node its consumer's share
            const rate = input.isConsumptionReference ? input.rate : (node.inputRates?.[inputKey] ?? input.rate);
            if (inputKey !== key) addEdgeRate(edgeKey(inputKey, key), rate);
            // An edge-only copy stands for its producer: carry on with the producer itself
            visit(input.isConsumptionReference ? (input.inputs[0] ?? input) : input);
        }
    }

    rootNodes.forEach(visit);
    return { nodes: mergedNodes, edgeRates };
}
