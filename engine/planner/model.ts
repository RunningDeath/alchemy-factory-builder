/**
 * The linear program behind the plan.
 *
 * Variables, all a minute:
 * - `craft:<recipe>`: crafts of a recipe;
 * - `buy:<item>`: an item that comes in raw (no recipe makes it, or it is outside fuel or fertilizer);
 * - `supply:<item>`: an item the player supplies, up to the supplied rate, for free.
 *
 * One row per item: what is made, bought and supplied, less what is used, covers the target
 * (0 for everything else). The objective is raw material cost plus machines, each machine
 * weighted with how hard it is to build (cauldron slots without plants, heated machines).
 */
import type { Constraint, Model } from "yalps";
import type { PlannerConfig, Recipe } from "../types";
import { PLANT_BASED } from "../cauldron";
import { getDevice, getItem, normalizeItemId } from "../item-utils";
import type { EfficiencyContext } from "./context";
import { candidateRecipes, externalKey, recipeFlows, type RecipeFlows } from "./recipes";

/** Extra weight per cauldron slot that isn't plant-based, in machines */
const NON_PLANT_SLOT_COST = 4;
/** Extra weight per cauldron slot taking an item another slot takes too (it fills up first) */
const SHARED_SLOT_COST = 4;
/** Extra weight of a heated machine: the heating device under it */
const HEATED_COST = 1;
/** Cost of a raw material without a price */
const UNPRICED_COST = 1000;
const EPSILON = 1e-9;

export interface PlanModel {
    model: Model<string, string>;
    flows: Map<string, RecipeFlows>;
    /** Items that come in raw, by the row key (outside fuel or fertilizer have their own) */
    raw: Map<string, string>;
    targets: Map<string, number>;
    supplies: Map<string, number>;
}

const row = (key: string) => `item:${key}`;

function sumRates(list: { item: string; rate: number }[] | undefined): Map<string, number> {
    const map = new Map<string, number>();
    for (const { item, rate } of list ?? []) if (rate > 0) map.set(normalizeItemId(item), (map.get(normalizeItemId(item)) ?? 0) + rate);
    return map;
}

/** How hard a machine for this recipe is to build, in plain machines */
function buildWeight(recipe: Recipe): number {
    const device = getDevice(recipe.crafted_in ?? "");
    const heated = device?.heat_consuming_speed && device.parent ? HEATED_COST : 0;
    const slots = recipe.crafted_in === "cauldron" ? 3 : recipe.crafted_in === "advanced-cauldron" ? 2 : 0;
    if (!slots) return 1 + heated;
    const heavy = recipe.inputs.reduce((n, i) => n + (PLANT_BASED.has(i.id ?? "") ? 0 : (i.count ?? 1)), 0);
    const shared = slots - recipe.inputs.length;
    return 1 + heated + heavy * NON_PLANT_SLOT_COST + shared * SHARED_SLOT_COST;
}

export function buildModel(config: PlannerConfig, ctx: EfficiencyContext): PlanModel {
    const targets = sumRates(config.targets);
    const supplies = sumRates(config.availableResources);
    const variables: Record<string, Record<string, number>> = {};
    const flows = new Map<string, RecipeFlows>();
    const produced = new Set<string>();
    const used = new Set<string>([...targets.keys()]);

    for (const recipe of candidateRecipes(ctx)) {
        const f = recipeFlows(recipe, ctx, true);
        flows.set(recipe.id, f);
        const coefficients: Record<string, number> = {};
        for (const [key, value] of f.net) {
            if (Math.abs(value) < EPSILON) continue;
            coefficients[row(key)] = value;
            (value > 0 ? produced : used).add(key);
        }
        const cost = ctx.machineWeight * f.machineMinutes * buildWeight(recipe);
        if (cost > 0) coefficients.cost = cost;
        variables[`craft:${recipe.id}`] = coefficients;
    }

    // Raw: used, but no recipe makes it (outside fuel and fertilizer never are)
    const raw = new Map<string, string>();
    for (const key of used) {
        if (produced.has(key) && !key.endsWith("#external")) continue;
        const item = key.replace(/#external$/, "");
        raw.set(key, item);
        const price = getItem(item);
        variables[`buy:${key}`] = { [row(key)]: 1, cost: price?.cost || price?.base_cost || UNPRICED_COST };
    }

    const constraints: Record<string, Constraint> = {};
    for (const key of new Set([...used, ...produced])) constraints[row(key)] = { min: targets.get(key) ?? 0 };
    for (const [item, rate] of supplies) {
        variables[`supply:${item}`] = { [row(item)]: 1, [`cap:${item}`]: 1 };
        constraints[`cap:${item}`] = { max: rate };
        constraints[row(item)] ??= { min: 0 };
    }
    // Outside fuel or fertilizer can come from the supply too (sharing its cap)
    for (const [key, item] of raw) {
        if (key === externalKey(item) && supplies.has(item)) variables[`supply:${key}`] = { [row(key)]: 1, [`cap:${item}`]: 1 };
    }

    return { model: { direction: "minimize", objective: "cost", constraints, variables }, flows, raw, targets, supplies };
}
