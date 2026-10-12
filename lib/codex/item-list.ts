/** Item list helpers that are cheap enough for the browser (no recipe or cauldron data) */
import { getAllItems } from "@/engine/item-utils";
import type { Item } from "@/engine/types";

export const categoriesOf = (item: Item): string[] => (Array.isArray(item.category) ? item.category : [item.category]).filter(Boolean);

export function allItemsSorted(): Item[] {
    return [...getAllItems()].sort((a, b) => a.name.localeCompare(b.name));
}

export function allCategories(): string[] {
    return [...new Set(getAllItems().flatMap(categoriesOf))].sort();
}
