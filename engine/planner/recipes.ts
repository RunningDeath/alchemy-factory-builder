/**
 * The recipes the planner may use, and what one craft of each moves: items in and out,
 * fertilizer for nurseries, fuel for heated machines and their heating device, and the
 * machine time it takes.
 */
import type { Recipe } from "../types";
import { advancedCauldronRecipesFor, cauldronRecipesFor } from "../cauldron";
import { entryId, getAllRecipes, getDevice, getEffectiveRecipeTime, getItem, isNursery, isSeedInput, normalizeItemId, outputCount, recipeNutrients } from "../item-utils";
import { isAlchemyMachine, type EfficiencyContext } from "./context";

/** Item key for fuel or fertilizer that comes in from outside (the factory never makes it for that use) */
export const externalKey = (itemId: string) => `${itemId}#external`;

export interface RecipeFlows {
    recipe: Recipe;
    /** Item id → net count per craft (+ out, − in); fuel and fertilizer included */
    net: Map<string, number>;
    /** Output id → count per craft (main output first) */
    outputs: Map<string, number>;
    /** Machine-minutes one craft takes */
    machineMinutes: number;
    /** Seconds per craft at base speed (nurseries: from their fertilizer) */
    time: number;
    /** Heat per craft, machine and its share of the heating device */
    heatPerCraft: number;
    /** Item consumed as fuel or fertilizer, and the key it is consumed under */
    fuel?: { item: string; key: string; perCraft: number };
    fertilizer?: { item: string; key: string; perCraft: number };
}

/** Main output of a recipe: its first */
export function primaryOutput(recipe: Recipe): string {
    return entryId(recipe.outputs[0]);
}

/**
 * Recipes to choose from. With the cauldron on, materials it makes in fewer steps lose
 * their usual recipes and get every cauldron mix instead. A recipe the player locked for
 * an item drops the item's other recipes.
 */
export function candidateRecipes(ctx: EfficiencyContext): Recipe[] {
    let list = getAllRecipes();
    if (ctx.useCauldron) {
        // Second pass: only the chosen mixes; other materials keep their usual recipes
        const cauldron = [
            ...cauldronRecipesFor({ buyInputs: ctx.cauldronBuyInputs }),
            ...(ctx.useAdvancedCauldron ? advancedCauldronRecipesFor({ buyInputs: ctx.cauldronBuyInputs }) : []),
        ].filter((r) => !ctx.cauldronOnly || ctx.cauldronOnly.has(r.id));
        const replaced = new Set(cauldron.map(primaryOutput));
        // A lock on a usual recipe keeps it (and its material) out of the cauldron
        for (const [item, recipeId] of Object.entries(ctx.recipeLocks)) if (!recipeId.includes("cauldron-")) replaced.delete(item);
        list = [
            ...list.filter((r) => !replaced.has(primaryOutput(r))),
            ...cauldron.filter((r) => replaced.has(primaryOutput(r))),
        ];
    }
    const locks = Object.entries(ctx.recipeLocks);
    if (!locks.length) return list;
    return list.filter((r) => {
        const lock = ctx.recipeLocks[primaryOutput(r)];
        return !lock || lock === r.id || !list.some((other) => other.id === lock);
    });
}

/**
 * What one craft moves. `withReserve` plans self-made fertilizer with the reserve on top
 * (the model does; the finished plan shows what nurseries really eat).
 */
export function recipeFlows(recipe: Recipe, ctx: EfficiencyContext, withReserve = false): RecipeFlows {
    const machine = recipe.crafted_in?.toLowerCase() ?? "";
    const device = getDevice(machine);
    const time = getEffectiveRecipeTime(recipe, ctx.selectedFertilizer, ctx.fertilizerMultiplier, { beltSpeed: ctx.beltLimit, speedMultiplier: ctx.speedMultiplier });
    const net = new Map<string, number>();
    const outputs = new Map<string, number>();
    const add = (key: string, value: number) => net.set(key, (net.get(key) ?? 0) + value);

    const bonus = isAlchemyMachine(machine) ? ctx.alchemyMultiplier : 1;
    for (const o of recipe.outputs) {
        const count = outputCount(o) * bonus;
        outputs.set(entryId(o), (outputs.get(entryId(o)) ?? 0) + count);
        add(entryId(o), count);
    }
    for (const i of recipe.inputs) if (!isSeedInput(recipe, i)) add(entryId(i), -i.count);

    const flows: RecipeFlows = { recipe, net, outputs, machineMinutes: time / (60 * ctx.speedMultiplier), time, heatPerCraft: 0 };

    // Nurseries eat fertilizer: the nutrients of every output, over the nutrients per item
    if (isNursery(recipe) && ctx.selectedFertilizer) {
        const fertId = normalizeItemId(ctx.selectedFertilizer);
        const value = getItem(fertId)?.nutrient_value;
        const nutrients = recipeNutrients(recipe);
        if (value && nutrients > 0) {
            const reserve = withReserve && ctx.selfFertilizer ? 1 + ctx.fertilizerReserve : 1;
            const perCraft = (nutrients / (value * ctx.fertilizerMultiplier)) * reserve;
            const key = ctx.selfFertilizer ? fertId : externalKey(fertId);
            add(key, -perCraft);
            flows.fertilizer = { item: fertId, key, perCraft };
        }
    }

    // Heated machines burn fuel while they work, and their heating device burns its own share:
    // the device's heat over the machines it holds. Both speed up with Factory Efficiency
    // (checked by the player), so per craft neither depends on it
    if (device?.heat_consuming_speed && device.parent) {
        const heater = getDevice(device.parent);
        const share = heater?.heat_self && heater.slots ? (heater.heat_self * (device.slots_required ?? 1)) / heater.slots : 0;
        flows.heatPerCraft = (device.heat_consuming_speed + share) * time;
        const fuelId = normalizeItemId(ctx.selectedFuel);
        const heatValue = getItem(fuelId)?.heat_value;
        if (heatValue) {
            const perCraft = flows.heatPerCraft / (heatValue * ctx.fuelMultiplier);
            const key = ctx.selfFuel ? fuelId : externalKey(fuelId);
            add(key, -perCraft);
            flows.fuel = { item: fuelId, key, perCraft };
        }
    }
    return flows;
}
