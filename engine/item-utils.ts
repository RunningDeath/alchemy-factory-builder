/**
 * Lookups into the game data (items, recipes, devices) and the few derived values most of
 * the engine needs: recipe output counts, nursery growth time and nutrients.
 */
import itemsData from "../data/items.json";
import recipesData from "../data/recipes.json";
import devicesData from "../data/devices.json";
import type { Device, Item, Recipe, RecipeInput, RecipeOutput } from "./types";
import { cauldronRecipeById } from "./cauldron";

const items = itemsData as unknown as Item[];
const recipes = recipesData as unknown as Recipe[];
const devices = (Array.isArray(devicesData) ? devicesData : Object.values(devicesData)) as Device[];

const itemById = new Map<string, Item>();
const itemByName = new Map<string, Item>();
/** Display names as written: "Mercury" (the planet, id mercuryp) is not the id mercury (Quicksilver) */
const itemByExactName = new Map<string, Item>();
for (const item of items) {
    itemById.set(item.id, item);
    itemByName.set(item.name.toLowerCase(), item);
    itemByExactName.set(item.name, item);
}
const recipeById = new Map(recipes.map((r) => [r.id, r]));
const deviceByKey = new Map<string, Device>();
for (const d of devices) {
    deviceByKey.set(d.id.toLowerCase(), d);
    deviceByKey.set(d.name.toLowerCase(), d);
}

/** Item id for an id or a display name (unknown names come back lowercased) */
export function normalizeItemId(ref: string): string {
    const named = itemByExactName.get(ref);
    if (named) return named.id;
    const lower = ref.toLowerCase();
    if (itemById.has(lower)) return lower;
    return itemByName.get(lower)?.id ?? lower;
}

/** Item by id or display name */
export function getItem(ref: string): Item | undefined {
    return itemById.get(normalizeItemId(ref));
}

export function getAllItems(): Item[] {
    return items;
}

export function getAllRecipes(): Recipe[] {
    return recipes;
}

/** Recipe by id, generated cauldron mixes included */
export function getRecipeById(id: string): Recipe | undefined {
    return recipeById.get(id) ?? cauldronRecipeById(id);
}

/** Device by id or display name */
export function getDevice(ref: string): Device | undefined {
    return deviceByKey.get(ref.toLowerCase());
}

export function getAllDevices(): Device[] {
    return devices;
}

/** Item id of a recipe input or output */
export function entryId(entry: RecipeInput | RecipeOutput): string {
    return entry.id || normalizeItemId(entry.name);
}

/** Expected count of an output per craft (its chance included) */
export function outputCount(o: RecipeOutput): number {
    const count = typeof o.count === "string" ? parseFloat(o.count) : o.count;
    const chance = o.percentage === undefined ? 100 : parseFloat(String(o.percentage));
    return count * (chance / 100);
}

export function isNursery(recipe: Recipe): boolean {
    return recipe.crafted_in?.toLowerCase() === "nursery";
}

/** Seeds a nursery holds: listed as inputs, but never used up */
export function isSeedInput(recipe: Recipe, input: RecipeInput): boolean {
    return isNursery(recipe) && !!getItem(entryId(input))?.name.toLowerCase().endsWith(" seeds");
}

/**
 * Nutrients one nursery cycle takes: every output counts (gentian nectar comes with 80
 * gentian, and those need 6000 each), not just the first one listed
 */
export function recipeNutrients(recipe: Recipe): number {
    return recipe.outputs.reduce((sum, o) => sum + outputCount(o) * (getItem(entryId(o))?.required_nutrients ?? 0), 0);
}

/**
 * Seconds per craft at base speed. A nursery grows as fast as its fertilizer delivers
 * nutrients: nutrients per cycle / the fertilizer's nutrients a second. The Fertilizer
 * Efficiency research raises the nutrients per item (fewer items eaten), not that speed
 * (checked in game: a Growth Potion lasts 6480 × 1.1 / 1980 = 3.6 s in a belt-capped nursery).
 *
 * With `beltCap`, a nursery can't put out more than one belt carries: all its outputs leave
 * on the same belt.
 */
export function getEffectiveRecipeTime(
    recipe: Recipe,
    selectedFertilizer: string | undefined,
    _fertilizerMultiplier = 1,
    beltCap?: { beltSpeed: number; speedMultiplier: number },
): number {
    if (!isNursery(recipe)) return recipe.time;
    const perSecond = selectedFertilizer ? getItem(selectedFertilizer)?.nutrients_per_seconds : undefined;
    const nutrients = recipeNutrients(recipe);
    const growth = perSecond && nutrients > 0 ? nutrients / perSecond : recipe.time;
    if (!beltCap || beltCap.beltSpeed <= 0) return growth;
    const perCycle = recipe.outputs.reduce((sum, o) => sum + outputCount(o), 0);
    return Math.max(growth, (perCycle * 60 * beltCap.speedMultiplier) / beltCap.beltSpeed);
}
