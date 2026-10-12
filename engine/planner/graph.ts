/**
 * Turns the solved program into production nodes: one per recipe in use and one per raw
 * material. Every consumer links to the shared node of each source of what it uses, with its
 * share in inputRates; a source's share is its part of everything made of that item.
 */
import type { ProductionNode } from "../types";
import { entryId, getDevice, getItem, getRecipeById, isSeedInput } from "../item-utils";
import type { EfficiencyContext } from "./context";
import { primaryOutput, recipeFlows, type RecipeFlows } from "./recipes";

const EPSILON = 1e-6;

export interface Solved {
    crafts: Map<string, number>;
    /** Row key → rate bought */
    bought: Map<string, number>;
    /** Row key → rate taken from the supply */
    supplied: Map<string, number>;
}

const nameOf = (id: string) => getItem(id)?.name ?? id;
export const rawNodeId = (item: string) => `${item}-raw`;
export const recipeNodeId = (item: string, recipeId: string) => `${item}-prod-${recipeId}`;

function recipeNode(f: RecipeFlows, crafts: number, ctx: EfficiencyContext): ProductionNode {
    const main = primaryOutput(f.recipe);
    const device = getDevice(f.recipe.crafted_in ?? "");
    const machines = crafts * f.machineMinutes;
    const node: ProductionNode = {
        id: recipeNodeId(main, f.recipe.id),
        itemName: nameOf(main),
        rate: crafts * (f.outputs.get(main) ?? 0),
        isRaw: false,
        recipeId: f.recipe.id,
        deviceId: device?.id,
        deviceCount: machines,
        heatConsumption: 0,
        inputs: [],
        byproducts: [...f.outputs].filter(([id]) => id !== main).map(([id, count]) => ({ itemName: nameOf(id), rate: crafts * count })),
        beltLimit: ctx.beltLimit,
    };
    node.isBeltSaturated = node.rate > ctx.beltLimit;
    const heater = device?.parent ? getDevice(device.parent) : undefined;
    if (device?.heat_consuming_speed && heater?.slots) {
        const perHeater = heater.slots / (device.slots_required ?? 1);
        const heaters = Math.ceil(machines / perHeater - 1e-4);
        node.parentFurnaceId = heater.id;
        node.parentFurnaceCount = heaters;
        node.heatConsumption = (machines * device.heat_consuming_speed * ctx.speedMultiplier + heaters * (heater.heat_self ?? 0)) * 60;
    }
    return node;
}

function rawNode(item: string, rate: number, ctx: EfficiencyContext): ProductionNode {
    return { id: rawNodeId(item), itemName: nameOf(item), rate, isRaw: true, deviceCount: 0, heatConsumption: 0, inputs: [], byproducts: [], beltLimit: ctx.beltLimit, isBeltSaturated: rate > ctx.beltLimit };
}

export function buildGraph(solved: Solved, targets: Map<string, number>, ctx: EfficiencyContext): ProductionNode[] {
    const nodes = new Map<string, ProductionNode>();
    /** Row key → its sources with the rate each puts out */
    const sources = new Map<string, { node: ProductionNode; rate: number }[]>();
    const addSource = (key: string, node: ProductionNode, rate: number) => rate > EPSILON && sources.set(key, [...(sources.get(key) ?? []), { node, rate }]);
    const rawFor = (item: string) => {
        let node = nodes.get(rawNodeId(item));
        if (!node) nodes.set(rawNodeId(item), (node = rawNode(item, 0, ctx)));
        return node;
    };

    // Flows without the reserve: the plan shows what the nurseries really eat
    const active = [...solved.crafts].filter(([, c]) => c > EPSILON).map(([id, crafts]) => ({ crafts, f: recipeFlows(getRecipeById(id)!, ctx) }));
    for (const { crafts, f } of active) {
        const node = recipeNode(f, crafts, ctx);
        nodes.set(node.id!, node);
        for (const [id, count] of f.outputs) addSource(id, node, crafts * count);
    }
    for (const [key, rate] of solved.bought) {
        const node = rawFor(key.replace(/#external$/, ""));
        node.rate += rate;
        addSource(key, node, rate);
    }
    for (const [key, rate] of solved.supplied) {
        const node = rawFor(key.replace(/#external$/, ""));
        node.rate += rate;
        node.suppliedRate = (node.suppliedRate ?? 0) + rate;
        addSource(key, node, rate);
    }

    // Link each consumer to the sources of what it uses
    for (const { crafts, f } of active) {
        const node = nodes.get(recipeNodeId(primaryOutput(f.recipe), f.recipe.id))!;
        const link = (key: string, rate: number) => {
            const list = (sources.get(key) ?? []).filter((s) => s.node !== node);
            const total = list.reduce((sum, s) => sum + s.rate, 0);
            for (const s of list) {
                const share = total > 0 ? (rate * s.rate) / total : 0;
                if (share < EPSILON) continue;
                if (!node.inputs.includes(s.node)) node.inputs.push(s.node);
                node.inputRates = { ...node.inputRates, [s.node.id!]: (node.inputRates?.[s.node.id!] ?? 0) + share };
            }
        };
        for (const [key, value] of f.net) {
            // Inputs and the fuel or fertilizer burnt (an output used up in the same machine nets out)
            const usedHere = -value + (f.outputs.get(key) ?? 0);
            if (usedHere > EPSILON && value < 0) link(key, -value * crafts);
        }
        // Seeds sit in the nursery for good: shown as raw inputs, nothing flows
        for (const i of f.recipe.inputs) {
            if (!isSeedInput(f.recipe, i)) continue;
            const seed = rawFor(entryId(i));
            seed.rate = Math.max(seed.rate, i.count * Math.ceil(crafts * f.machineMinutes - 1e-6));
            if (!node.inputs.includes(seed)) node.inputs.push(seed);
            node.inputRates = { ...node.inputRates, [seed.id!]: 0 };
        }
    }

    // Roots: the nodes making each target, with what is left of it after the factory's own use
    const roots: ProductionNode[] = [];
    for (const item of targets.keys()) {
        const makers = (sources.get(item) ?? []).filter((s) => !s.node.isRaw && s.node.itemName === nameOf(item));
        const made = makers.reduce((sum, s) => sum + s.rate, 0);
        const ids = new Set(makers.map((m) => m.node.id!));
        const usedInside = [...nodes.values()].reduce((sum, n) => sum + Object.entries(n.inputRates ?? {}).reduce((s, [id, r]) => s + (ids.has(id) ? r : 0), 0), 0);
        for (const { node, rate } of makers) {
            node.isTarget = true;
            node.netOutputRate = (rate / made) * (made - usedInside);
            roots.push(node);
        }
        // A target nobody makes (supplied or bought outright) still shows up
        if (!makers.length && nodes.has(rawNodeId(item))) roots.push(nodes.get(rawNodeId(item))!);
    }
    return roots;
}
