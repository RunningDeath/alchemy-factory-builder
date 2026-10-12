/**
 * Items for the codex: what each costs and gives, which recipes make it and which use it.
 */
import { entryId, getAllRecipes, getDevice, getItem } from "@/engine/item-utils";
import { categoriesOf } from "./item-list";
import { cauldronMixesByOutput } from "@/engine/cauldron";
import type { Item, Recipe } from "@/engine/types";

export { categoriesOf };

export interface RecipeRow {
    id: string;
    device: string;
    deviceId: string;
    time: number;
    inputs: { id: string; name: string; count: number }[];
    outputs: { id: string; name: string; count: number; chance?: number }[];
}

export interface ItemDetail {
    item: Item;
    categories: string[];
    madeBy: RecipeRow[];
    usedIn: RecipeRow[];
    /** Cauldron mixes that make it (basic, advanced) */
    mixes: { basic: number; advanced: number };
}

function row(r: Recipe): RecipeRow {
    return {
        id: r.id,
        device: getDevice(r.crafted_in)?.name ?? r.crafted_in,
        deviceId: r.crafted_in,
        time: r.time,
        inputs: r.inputs.map((i) => ({ id: entryId(i), name: getItem(entryId(i))?.name ?? i.name, count: i.count })),
        outputs: r.outputs.map((o) => ({
            id: entryId(o),
            name: getItem(entryId(o))?.name ?? o.name,
            count: Number(o.count),
            chance: o.percentage === undefined ? undefined : Number(o.percentage),
        })),
    };
}

let mixCounts: { basic: Map<string, number>; advanced: Map<string, number> } | null = null;
function countMixes() {
    const count = (kind: "basic" | "advanced") => new Map([...cauldronMixesByOutput(kind)].map(([id, list]) => [id, list.length]));
    return (mixCounts ??= { basic: count("basic"), advanced: count("advanced") });
}

export function itemDetail(id: string): ItemDetail | undefined {
    const item = getItem(id);
    if (!item || item.id !== id) return undefined;
    const recipes = getAllRecipes();
    return {
        item,
        categories: categoriesOf(item),
        madeBy: recipes.filter((r) => r.outputs.some((o) => entryId(o) === id)).map(row),
        usedIn: recipes.filter((r) => r.inputs.some((i) => entryId(i) === id)).map(row),
        mixes: { basic: countMixes().basic.get(id) ?? 0, advanced: countMixes().advanced.get(id) ?? 0 },
    };
}
