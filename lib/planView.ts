/**
 * The plan as the UI shows it: steps in production order (raw materials first, targets
 * last), each with what flows in and out, and the totals for the summary.
 */
import type { ProductionNode } from "@/engine/types";
import type { BeltReport, NodeBeltInfo } from "@/engine/belt-analysis";
import { collectPlanGraph, nodeKeyOf, splitEdgeKey } from "@/engine/plan-graph";
import { getAllRecipes, getDevice, getItem, getRecipeById } from "@/engine/item-utils";
import { isFluidItem } from "@/engine/belt-analysis";

export interface StepFlow {
    key: string;
    itemName: string;
    rate: number;
    /** What to show: the source or the consumer (when it differs from the item) */
    label?: string;
    /** Demand when the source can't deliver it all */
    demand?: number;
}

export interface Step {
    key: string;
    node: ProductionNode;
    itemId: string;
    itemName: string;
    isRaw: boolean;
    isTarget: boolean;
    deviceName?: string;
    recipeId?: string;
    belt?: NodeBeltInfo;
    /** What this step takes from each source */
    inputs: StepFlow[];
    /** Where its output goes */
    outputs: StepFlow[];
    /** Other recipes that make the same item (for the recipe choice) */
    alternatives: { id: string; label: string }[];
    /** Longest chain of steps below this one (0: raw) */
    depth: number;
}

export interface PlanView {
    steps: Step[];
    /** loop: feeds back into a step it depends on (fertilizer to its own nurseries, fuel to its own kilns) */
    edges: { source: string; target: string; rate: number; demand: number; short: boolean; itemName: string; loop: boolean }[];
    raw: { itemName: string; rate: number; supplied: boolean }[];
    machines: { deviceId: string; name: string; built: number; exact: number }[];
    targets: { itemName: string; demand: number; delivered: number }[];
    /** Rounded-up machines could make this much more: the belt backs up, nothing is lost */
    spare: { itemName: string; rate: number }[];
    /** Byproducts nobody in the plan uses: they need a sink (altar, trash, dispatch) */
    unused: { itemName: string; rate: number }[];
    heatPerMinute: number;
}

/** Recipe label: inputs → outputs, with the machine */
export function recipeLabel(recipeId: string): string {
    const r = getRecipeById(recipeId);
    if (!r) return recipeId;
    const part = (list: { name: string; count: number | string }[]) => list.map((e) => `${e.count}× ${getItem(e.name)?.name ?? e.name}`).join(" + ");
    return `${part(r.inputs) || "nothing"} → ${part(r.outputs)} (${getDevice(r.crafted_in)?.name ?? r.crafted_in})`;
}

/**
 * Item moving along an edge: what the source makes that the target uses (a byproduct can be
 * what another step needs), else the source's main output
 */
function edgeItem(source: ProductionNode | undefined, target: ProductionNode | undefined): string {
    if (!source) return "";
    const made = [source.itemName, ...source.byproducts.map((b) => b.itemName)];
    const recipe = target?.recipeId ? getRecipeById(target.recipeId) : undefined;
    const used = new Set((recipe?.inputs ?? []).map((i) => getItem(i.id ?? i.name)?.name ?? i.name));
    return made.find((name) => used.has(name)) ?? source.itemName;
}

/** Recipes that have the item as their main output */
function recipesMaking(itemId: string): { id: string; label: string }[] {
    return getAllRecipes()
        .filter((r) => (r.outputs[0]?.id ?? "") === itemId)
        .map((r) => ({ id: r.id, label: recipeLabel(r.id) }));
}

export function buildPlanView(roots: ProductionNode[], report: BeltReport | null): PlanView {
    const graph = collectPlanGraph(roots);
    const rootKeys = new Set(roots.map(nodeKeyOf));
    const edges: PlanView["edges"] = [];
    const inputs = new Map<string, StepFlow[]>();
    const outputs = new Map<string, StepFlow[]>();
    for (const [key, demand] of graph.edgeRates) {
        const [source, target] = splitEdgeKey(key);
        const flow = report?.edges[key];
        const rate = flow?.actual ?? demand;
        const itemName = edgeItem(graph.nodes.get(source), graph.nodes.get(target));
        edges.push({ source, target, rate, demand, short: flow?.short ?? false, itemName, loop: false });
        inputs.set(target, [...(inputs.get(target) ?? []), { key: source, itemName, rate, demand: flow?.short ? demand : undefined }]);
        outputs.set(source, [...(outputs.get(source) ?? []), { key: target, itemName, rate, label: `${itemName} → ${graph.nodes.get(target)?.itemName ?? target}` }]);
    }

    // Loops: walking from the products down their inputs, an input that is already on the
    // path closes a loop (the products' fertilizer going back to the nurseries)
    const loops = new Set<string>();
    const onPath = new Set<string>();
    const walked = new Set<string>();
    const walk = (key: string) => {
        if (walked.has(key)) return;
        walked.add(key);
        onPath.add(key);
        for (const f of inputs.get(key) ?? []) {
            if (onPath.has(f.key)) loops.add(`${f.key}>${key}`);
            else walk(f.key);
        }
        onPath.delete(key);
    };
    [...rootKeys, ...graph.nodes.keys()].forEach(walk);
    for (const e of edges) e.loop = loops.has(`${e.source}>${e.target}`);

    // Depth: longest path from a raw material, loops left out
    const depth = new Map<string, number>();
    const depthOf = (key: string): number => {
        if (depth.has(key)) return depth.get(key)!;
        depth.set(key, 0);
        const feeds = (inputs.get(key) ?? []).filter((f) => !loops.has(`${f.key}>${key}`));
        const d = Math.max(-1, ...feeds.map((f) => depthOf(f.key))) + 1;
        depth.set(key, d);
        return d;
    };

    const steps: Step[] = [...graph.nodes].map(([key, node]) => {
        const itemId = getItem(node.itemName)?.id ?? node.itemName;
        const alternatives = node.isRaw ? [] : recipesMaking(itemId);
        return {
            key,
            node,
            itemId,
            itemName: node.itemName,
            isRaw: node.isRaw,
            isTarget: rootKeys.has(key) && !node.isRaw,
            deviceName: node.deviceId ? (getDevice(node.deviceId)?.name ?? node.deviceId) : undefined,
            recipeId: node.recipeId,
            belt: report?.nodes[key],
            inputs: inputs.get(key) ?? [],
            outputs: outputs.get(key) ?? [],
            alternatives: alternatives.length > 1 || (node.recipeId && !alternatives.some((a) => a.id === node.recipeId)) ? alternatives : [],
            depth: depthOf(key),
        };
    });
    steps.sort((a, b) => a.depth - b.depth || Number(a.isTarget) - Number(b.isTarget) || a.itemName.localeCompare(b.itemName));

    const machines = new Map<string, { exact: number; built: number }>();
    for (const s of steps) {
        if (!s.node.deviceId) continue;
        const entry = machines.get(s.node.deviceId) ?? { exact: 0, built: 0 };
        entry.exact += s.node.deviceCount;
        entry.built += s.belt?.machinesBuilt ?? Math.ceil(s.node.deviceCount - 1e-6);
        machines.set(s.node.deviceId, entry);
        if (s.node.parentFurnaceId && s.node.parentFurnaceCount) {
            const heater = machines.get(s.node.parentFurnaceId) ?? { exact: 0, built: 0 };
            heater.exact += s.node.parentFurnaceCount;
            heater.built += s.node.parentFurnaceCount;
            machines.set(s.node.parentFurnaceId, heater);
        }
    }

    return {
        steps,
        edges,
        raw: steps.filter((s) => s.isRaw && s.outputs.some((o) => o.rate > 0)).map((s) => ({ itemName: s.itemName, rate: s.outputs.reduce((n, o) => n + o.rate, 0), supplied: !!s.node.suppliedRate })),
        machines: [...machines].map(([deviceId, m]) => ({ deviceId, name: getDevice(deviceId)?.name ?? deviceId, ...m })).sort((a, b) => b.built - a.built),
        targets: report?.targets.map((t) => ({ itemName: t.itemName, demand: t.demand, delivered: t.delivered })) ?? [],
        spare: steps.filter((s) => !s.isTarget && !s.isRaw && (s.belt?.leftoverRate ?? 0) > 0.05).map((s) => ({ itemName: s.itemName, rate: s.belt!.leftoverRate })),
        unused: steps.flatMap((s) => {
            const sent = (name: string) => s.outputs.filter((o) => o.itemName === name).reduce((n, o) => n + o.rate, 0);
            return s.node.byproducts.map((b) => ({ itemName: b.itemName, rate: b.rate - sent(b.itemName) })).filter((l) => l.rate > 0.05);
        }),
        heatPerMinute: steps.reduce((n, s) => n + s.node.heatConsumption, 0),
    };
}

/** Graph edge data for the belt edges */
export interface BeltEdgeData extends Record<string, unknown> {
    rate: number;
    demand: number;
    itemName: string;
    /** Belt lines the flow needs */
    lines: number;
    short: boolean;
    fluid: boolean;
    loop: boolean;
    /** Bend points from the layout (between the two handles) */
    points?: { x: number; y: number }[];
}

/** Edge data with the lines one flow needs at this belt speed */
export function beltEdgeData(e: PlanView["edges"][number], beltSpeed: number): BeltEdgeData {
    const fluid = isFluidItem(e.itemName);
    return { rate: e.rate, demand: e.demand, itemName: e.itemName, short: e.short, fluid, loop: e.loop, lines: fluid ? 1 : Math.max(1, Math.ceil(e.rate / beltSpeed - 1e-6)) };
}
