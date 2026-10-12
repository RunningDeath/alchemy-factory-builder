/**
 * Everything about the player's progress that changes rates: research multipliers, belt
 * speed, the chosen fuel and fertilizer, and the planner switches.
 */
import type { PlannerConfig } from "../types";
import { beltSpeedForLevel, factorySpeedMultiplier } from "../game-constants";

export interface EfficiencyContext {
    /** Machine speed (Factory Efficiency) */
    speedMultiplier: number;
    /** Extra output of extractors and alembics (Alchemy Skill) */
    alchemyMultiplier: number;
    /** Heat per fuel item (Fuel Efficiency) */
    fuelMultiplier: number;
    /** Nutrients per fertilizer item (Fertilizer Efficiency) */
    fertilizerMultiplier: number;
    /** Items a minute on one belt (Logistics Efficiency) */
    beltLimit: number;
    selectedFuel: string;
    selectedFertilizer?: string;
    selfFuel: boolean;
    selfFertilizer: boolean;
    /** Share of self-made fertilizer planned above what the nurseries eat */
    fertilizerReserve: number;
    useCauldron: boolean;
    useAdvancedCauldron: boolean;
    /** Coins one machine is worth next to raw material cost */
    machineWeight: number;
    cauldronBuyInputs: boolean;
    /** Only these cauldron recipes (second pass: one mix per material) */
    cauldronOnly?: Set<string>;
    /** Recipe the player picked per item id */
    recipeLocks: Record<string, string>;
}

/** Machine weight without the cauldron: enough to drop long chains that save only a little raw cost */
export const BASE_MACHINE_WEIGHT = 300;
/** With the cauldron a simpler factory is the whole point */
export const CAULDRON_MACHINE_WEIGHT = 1000;

/** Machines whose output grows with the Alchemy Skill */
const ALCHEMY_MACHINES = new Set(["extractor", "thermal-extractor", "thermal extractor", "alembic", "advanced-alembic", "advanced alembic"]);

export function isAlchemyMachine(machine: string): boolean {
    return ALCHEMY_MACHINES.has(machine.toLowerCase());
}

/** Bonus that grows by a different step in each band of levels: bands as [last level, step] */
function tiered(level: number, bands: [number, number][]): number {
    let bonus = 0;
    let previous = 0;
    for (const [last, step] of bands) {
        if (level <= previous) break;
        bonus += (Math.min(level, last) - previous) * step;
        previous = last;
    }
    return bonus;
}

/** Alchemy Skill: +6 % for levels 1–2, +8 % for 3–8, +10 % after */
export function calculateAlchemyBonus(level: number): number {
    return tiered(level, [[2, 0.06], [8, 0.08], [Infinity, 0.1]]);
}

/** Throwing Efficiency (catapult range): +25 % up to level 12, +5 % after */
export function calculateThrowingBonus(level: number): number {
    return tiered(level, [[12, 0.25], [Infinity, 0.05]]);
}

/** Sales Ability: +3 %, +4 %, +5 %, +6 %, +7 % for each pair of levels up to 10, +10 % after */
export function calculateSalesBonus(level: number): number {
    return tiered(level, [[2, 0.03], [4, 0.04], [6, 0.05], [8, 0.06], [10, 0.07], [Infinity, 0.1]]);
}

/** Customer Management: +6 %, +8 %, +10 %, +12 %, +14 % for each pair of levels up to 10, +20 % after */
export function calculateCustomerMgmtBonus(level: number): number {
    return tiered(level, [[2, 0.06], [4, 0.08], [6, 0.1], [8, 0.12], [10, 0.14], [Infinity, 0.2]]);
}

export function buildEfficiencyContext(config: PlannerConfig): EfficiencyContext {
    const useCauldron = config.useCauldron ?? false;
    return {
        speedMultiplier: factorySpeedMultiplier(config.factoryEfficiency ?? 0),
        alchemyMultiplier: 1 + calculateAlchemyBonus(config.alchemySkill ?? 0),
        fuelMultiplier: 1 + (config.fuelEfficiency ?? 0) * 0.1,
        fertilizerMultiplier: 1 + (config.fertilizerEfficiency ?? 0) * 0.1,
        beltLimit: beltSpeedForLevel(config.logisticsEfficiency ?? 0),
        selectedFuel: config.selectedFuel || "Coal",
        selectedFertilizer: config.selectedFertilizer,
        selfFuel: config.selfFuel ?? true,
        selfFertilizer: config.selfFertilizer ?? true,
        fertilizerReserve: config.fertilizerReserve ?? 0,
        useCauldron,
        useAdvancedCauldron: useCauldron && (config.useAdvancedCauldron ?? false),
        machineWeight: config.machineWeight ?? (useCauldron ? CAULDRON_MACHINE_WEIGHT : BASE_MACHINE_WEIGHT),
        cauldronBuyInputs: config.cauldronBuyInputs ?? false,
        recipeLocks: config.recipeLocks ?? {},
    };
}
