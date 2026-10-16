#!/usr/bin/env bun

/**
 * Adds the fail products of athanor recipes to data/recipes.json. A craft that fails gives
 * the fail product instead of the main one (Steel Ingot: 3 of 4 crafts give the Iron Ingot
 * back), and the machine puts it out on its own port (see the footprint ports' `product`).
 * The main output keeps the chance that is left, each fail product gets its own chance.
 *
 * Reads DT_EnemyCrafting (the recipe table, from `tools/extract-game-data tables`).
 *
 * Usage: bun run scripts/recipe-fail-products.ts <DT_EnemyCrafting.json>
 */

import { readFile, writeFile } from 'node:fs/promises';
import type { Recipe, RecipeOutput } from '../engine/types';

const RECIPES = './data/recipes.json';
const ITEMS = './data/items.json';

interface Ingredient {
  IngredientName: string;
  Count: number;
}
interface CraftRow {
  IngredientList: Ingredient[];
  ProductInfo: Ingredient;
  CraftType: string;
  FailRate1: number;
  FailRate2: number;
  FailProduct1: Ingredient;
  FailProduct2: Ingredient;
}

/** Game names and our ids compare without case and punctuation (SteelIngot / steel-ingot) */
const plain = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
/** Chances in percent, rounded off the float noise of the table (0.30000000000000004) */
const percent = (rate: number) => Math.round(rate * 1e6) / 1e4;

const [tablePath] = process.argv.slice(2);
if (!tablePath) {
  console.error('Usage: bun run scripts/recipe-fail-products.ts <DT_EnemyCrafting.json>');
  process.exit(1);
}

const table = JSON.parse(await readFile(tablePath, 'utf8')) as Record<string, CraftRow>;
const recipes = JSON.parse(await readFile(RECIPES, 'utf8')) as Recipe[];
const items = JSON.parse(await readFile(ITEMS, 'utf8')) as { id: string; name: string }[];
const itemOf = (gameName: string) => items.find((i) => plain(i.id) === plain(gameName));

let changed = 0;
for (const [key, row] of Object.entries(table)) {
  const fails = [
    { rate: row.FailRate1, product: row.FailProduct1, slot: 1 as const },
    { rate: row.FailRate2, product: row.FailProduct2, slot: 2 as const },
  ].filter((f) => f.rate > 0 && f.product.IngredientName !== 'None');
  if (!fails.length) continue;
  const recipe = recipes.find((r) => plain(r.id) === plain(key));
  if (!recipe) {
    console.warn(`${key}: no recipe`);
    continue;
  }
  const main = recipe.outputs[0];
  const failed = fails.reduce((sum, f) => sum + f.rate, 0);
  const outputs: RecipeOutput[] = [{ ...main, percentage: percent(1 - failed) }];
  for (const f of fails) {
    const item = itemOf(f.product.IngredientName);
    if (!item) throw new Error(`${key}: unknown fail product ${f.product.IngredientName}`);
    outputs.push({ id: item.id, name: item.name, count: f.product.Count || 1, percentage: percent(f.rate), fail: f.slot });
  }
  recipe.outputs = outputs;
  changed++;
  console.log(`${recipe.id}: ${outputs.map((o) => `${o.id} ${o.percentage}%`).join(', ')}`);
}
await writeFile(RECIPES, JSON.stringify(recipes, null, 2) + '\n');
console.log(`${changed} recipes with fail products`);
