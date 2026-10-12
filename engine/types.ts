/**
 * Shared types: the game data (items, recipes, devices), the planner's input and output,
 * and what a saved factory holds.
 */
import type { TierInfo } from "./build/generator";
import type { IoPoint, RouteResult } from "./build/router";
import type { Placement } from "./build/layout";

// ---------------------------------------------------------------------------
// Game data (data/*.json)
// ---------------------------------------------------------------------------

export interface Item {
    id: string;
    name: string;
    /** One category or several (data/items.json uses both) */
    category: string | string[];
    base_cost?: number;
    /** Price at the purchasing portal, when it sells the item */
    cost?: number;
    purchasable?: boolean;
    /** Sell price */
    price?: number;
    /** Fuel: heat one item gives */
    heat_value?: number;
    /** Fertilizer: nutrients one item gives, and how fast a nursery takes them in */
    nutrient_value?: number;
    nutrients_per_seconds?: number;
    /** Plant: nutrients one item needs to grow */
    required_nutrients?: number;
    cauldron_cost?: number;
    cauldron_target?: number;
    cauldron_coef?: number;
    cauldron_efficiency?: number;
    paradox_time?: number;
}

export interface RecipeInput {
    id?: string;
    name: string;
    count: number;
}

export interface RecipeOutput {
    id?: string;
    name: string;
    /** Some rows store counts and chances as strings */
    count: number | string;
    /** Chance in percent (absent: always) */
    percentage?: number | string;
}

export interface Recipe {
    id: string;
    inputs: RecipeInput[];
    outputs: RecipeOutput[];
    /** Seconds per craft at base speed */
    time: number;
    /** Device id */
    crafted_in: string;
    category?: string | string[];
}

export interface Device {
    id: string;
    name: string;
    category: string;
    /** Heat a second while working */
    heat_consuming_speed?: number;
    /** Heating devices: heat they burn themselves, and the slots they offer */
    heat_self?: number;
    slots?: number;
    /** Heated machines: the heating device they sit on, and the slots they take */
    parent?: string;
    slots_required?: number;
}

// ---------------------------------------------------------------------------
// Planner
// ---------------------------------------------------------------------------

export interface Rate {
    item: string;
    rate: number;
}

/** Research levels that change rates (Research tab in game) */
export interface ResearchState {
    /** Belt speed */
    logisticsEfficiency: number;
    /** Catapult range */
    throwingEfficiency: number;
    /** Machine speed */
    factoryEfficiency: number;
    /** Extra output of extractors and alembics */
    alchemySkill: number;
    /** Heat per fuel item */
    fuelEfficiency: number;
    /** Nutrients per fertilizer item */
    fertilizerEfficiency: number;
    salesAbility: number;
    negotiationSkill: number;
    customerMgmt: number;
    relicKnowledge: number;
}

/** Machine count rounding. "exact" keeps fractions (machines throttled to demand). */
export type RoundingMode = "exact" | "up" | "down";

/** Per-node override for parallel-line planning. Absent: the factory setting. */
export type LineOverride = "on" | "off";

export interface PlannerConfig extends ResearchState {
    targets: Rate[];
    /** Supplied from outside the factory (not bought, not made) */
    availableResources: Rate[];
    selectedFuel?: string;
    selectedFertilizer?: string;
    /** Make the fuel here (else it comes in from outside) */
    selfFuel?: boolean;
    /** Make the fertilizer here (else it comes in from outside) */
    selfFertilizer?: boolean;
    /** Self-made fertilizer planned this share above what the nurseries eat (0.25 = 25 %) */
    fertilizerReserve?: number;
    /** Plan parallel belt lines for flows over the belt limit (default on) */
    planParallelLines?: boolean;
    machineRounding?: RoundingMode;
    /** Make materials in the cauldron where that takes fewer steps than their usual chain */
    useCauldron?: boolean;
    /** The advanced cauldron too (two inputs; level 8) */
    useAdvancedCauldron?: boolean;
    /** Cauldron inputs may be bought at the purchasing portal */
    cauldronBuyInputs?: boolean;
    /** Coins one machine is worth next to raw material cost (unset: a default) */
    machineWeight?: number;
    /** Recipe the player picked per item id: the planner uses only that one for the item */
    recipeLocks?: Record<string, string>;
}

/**
 * One step of the plan: a recipe on its machines, or a raw material that comes in.
 * Inputs reference the producing nodes themselves (shared objects), with this node's share
 * of each in inputRates; see plan-graph.ts.
 */
export interface ProductionNode {
    /** Unique key: `<item>-prod-<recipe>` or `<item>-raw` */
    id?: string;
    /** Display name of the main output */
    itemName: string;
    /** Gross output a minute */
    rate: number;
    /** Output a minute left after the factory's own use (targets) */
    netOutputRate?: number;
    /** An edge-only copy of a producer (kept for older trees; the planner doesn't make them) */
    isConsumptionReference?: boolean;
    isRaw: boolean;
    recipeId?: string;
    deviceId?: string;
    /** Machines (fractional) */
    deviceCount: number;
    /** Heat a minute, machines and their heating devices together */
    heatConsumption: number;
    parentFurnaceId?: string;
    parentFurnaceCount?: number;
    inputs: ProductionNode[];
    /** What this node takes from each input a minute, by the input's id */
    inputRates?: Record<string, number>;
    /** Outputs besides the main one */
    byproducts: { itemName: string; rate: number }[];
    beltLimit?: number;
    isBeltSaturated?: boolean;
    isTarget?: boolean;
    /** Raw nodes supplied from outside: the supplied rate */
    suppliedRate?: number;
}

// ---------------------------------------------------------------------------
// Saved factories
// ---------------------------------------------------------------------------

export type ViewMode = "graph" | "list" | "build";

/** Generator settings for the Build view */
export interface BuildOptions {
    maxWidth: number;
    maxDepth: number;
    maxStack: number;
    maxHeight?: number;
    useBridges?: boolean;
    exportItems?: string[];
    stackBlocks?: boolean;
    disposal?: "altar" | "trash" | "sell" | "export";
    buyRaw?: boolean;
    modules?: boolean;
    moduleGroups?: string[][];
}

/** Saved module layout for the Build view */
export interface BuildLayoutState {
    placements: Placement[];
    options?: BuildOptions;
    /** Tiers and lanes of the last generated module */
    tiers?: TierInfo[];
    /** Belt connections between blocks of the last generated module */
    routes?: RouteResult[];
    /** Where raw materials come in and products leave */
    io?: IoPoint[];
    /** Unused output that isn't sent out */
    surplus?: { itemName: string; rate: number }[];
    /** Plan the module was generated for, to notice when it changed */
    planKey?: string;
}

export type FactoryConfig = Omit<PlannerConfig, "targets" | "availableResources">;

export interface FactoryState {
    id: string;
    name: string;
    targets: Rate[];
    availableResources: Rate[];
    config: FactoryConfig;
    viewMode: ViewMode;
    /** Keyed by production node id */
    lineOverrides?: Record<string, LineOverride>;
    roundingOverrides?: Record<string, RoundingMode>;
    buildLayout?: BuildLayoutState;
}
