/**
 * Production planner: picks recipes and rates with a linear program (cheapest raw materials
 * and simplest machines), then lays the result out as production nodes.
 *
 * With the cauldron on, the program may blend several mixes for one material, each with its
 * own supply chain. The second pass keeps the most used mix per material and solves again.
 */
import { solve } from "yalps";
import type { PlannerConfig, ProductionNode } from "../types";
import { cauldronRecipeById } from "../cauldron";
import { buildEfficiencyContext, type EfficiencyContext } from "./context";
import { buildModel } from "./model";
import { buildGraph, type Solved } from "./graph";

const EPSILON = 1e-7;
/**
 * The program is solved for targets scaled to this largest rate and scaled back: a plan is
 * linear in its targets, and tiny targets (0.05/min) would otherwise lose inputs under the
 * solver's tolerances
 */
const SOLVE_SCALE = 100;

function run(given: PlannerConfig, ctx: EfficiencyContext): { solved: Solved; targets: Map<string, number> } | null {
    const largest = Math.max(...given.targets.map((t) => t.rate));
    const k = largest > 0 ? SOLVE_SCALE / largest : 1;
    const scale = (list: PlannerConfig["targets"]) => list?.map((r) => ({ ...r, rate: r.rate * k }));
    const config = { ...given, targets: scale(given.targets), availableResources: scale(given.availableResources) };
    let { model, targets } = buildModel(config, ctx);
    let solution = solve(model);
    // A target its own recipes can't make (a locked recipe in a loop): any source will do
    if (solution.status !== "optimal") {
        ({ model, targets } = buildModel(config, ctx, false));
        solution = solve(model);
    }
    if (solution.status !== "optimal") return null;
    const solved: Solved = { crafts: new Map(), bought: new Map(), supplied: new Map() };
    for (const [name, scaled] of solution.variables) {
        if (scaled < EPSILON) continue;
        const value = scaled / k;
        const [kind, key] = [name.slice(0, name.indexOf(":")), name.slice(name.indexOf(":") + 1)];
        if (kind === "craft") solved.crafts.set(key, value);
        else if (kind === "buy") solved.bought.set(key, value);
        else if (kind === "supply") solved.supplied.set(key, value);
    }
    return { solved, targets: new Map([...targets].map(([item, rate]) => [item, rate / k])) };
}

/** One cauldron mix per material: the one the program used most */
function mainMixes(crafts: Map<string, number>): Set<string> {
    const best = new Map<string, { id: string; crafts: number }>();
    for (const [id, value] of crafts) {
        const mix = cauldronRecipeById(id);
        if (!mix) continue;
        const material = mix.outputs[0].id ?? id;
        if ((best.get(material)?.crafts ?? 0) < value) best.set(material, { id, crafts: value });
    }
    return new Set([...best.values()].map((b) => b.id));
}

/** Production nodes making the targets (empty when the targets can't be made) */
export function calculatePlan(config: PlannerConfig): ProductionNode[] {
    if (!config.targets?.some((t) => t.rate > 0)) return [];
    const ctx = buildEfficiencyContext(config);
    let result = run(config, ctx);
    if (result && ctx.useCauldron) {
        const mixes = mainMixes(result.solved.crafts);
        if (mixes.size) result = run(config, { ...ctx, cauldronOnly: mixes }) ?? result;
    }
    return result ? buildGraph(result.solved, result.targets, ctx) : [];
}

export { buildEfficiencyContext, isAlchemyMachine, calculateAlchemyBonus, calculateThrowingBonus, calculateSalesBonus, calculateCustomerMgmtBonus } from "./context";
export type { EfficiencyContext } from "./context";
