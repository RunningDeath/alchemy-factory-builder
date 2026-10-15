import { describe, expect, test } from "bun:test";
import { calculatePlan } from ".";
import { analyzeBelts } from "../belt-analysis";
import { collectPlanGraph } from "../plan-graph";
import { getItem, normalizeItemId } from "../item-utils";
import type { PlannerConfig, ProductionNode, ResearchState } from "../types";

const NO_RESEARCH: ResearchState = {
    logisticsEfficiency: 0,
    throwingEfficiency: 0,
    factoryEfficiency: 0,
    alchemySkill: 0,
    fuelEfficiency: 0,
    fertilizerEfficiency: 0,
    salesAbility: 0,
    negotiationSkill: 0,
    customerMgmt: 0,
    relicKnowledge: 0,
};

const config = (given: Partial<PlannerConfig> & Pick<PlannerConfig, "targets">): PlannerConfig => ({ ...NO_RESEARCH, availableResources: [], ...given });
const report = (cfg: PlannerConfig) => analyzeBelts(calculatePlan(cfg), cfg, { planParallelLines: true, machineRounding: cfg.machineRounding ?? "up" });
const delivered = (cfg: PlannerConfig) => report(cfg).targets.reduce((sum, t) => sum + t.delivered, 0);

// Cases found by the stress test (wild combinations of targets, fuel, fertilizer and settings)
describe("planner edge cases", () => {
    test("an item name that is another item's id means the named item", () => {
        // The planet Mercury (id mercuryp) is not Quicksilver (id mercury)
        expect(normalizeItemId("Mercury")).toBe("mercuryp");
        expect(normalizeItemId("mercury")).toBe("mercury");
        expect(getItem("Mercury")?.id).toBe("mercuryp");
    });

    test("a target made by its own recipe, not as a twin recipe's byproduct", () => {
        const roots = calculatePlan(config({ targets: [{ item: "gentiannectar", rate: 11 }], selectedFertilizer: "growthpotion", selfFertilizer: false }));
        expect(roots.map((r) => r.id)).toEqual(["gentiannectar-prod-gentian-nectar"]);
        expect(roots[0].netOutputRate).toBeCloseTo(11, 6);
    });

    test("a machine taking two outputs of one source gets both", () => {
        // The cauldron's topaz mix takes gentian and gentian nectar from the same nursery
        const cfg = config({ targets: [{ item: "topaz", rate: 16 }], useCauldron: true, selectedFuel: "coal", selfFuel: true });
        const rep = report(cfg);
        expect(rep.targets[0].delivered).toBeGreaterThanOrEqual(16);
        expect(Object.values(rep.nodes).some((n) => n.inputLimited)).toBe(false);
    });

    test("a target's net output counts only that item, not the byproduct taken from its maker", () => {
        // Rock salt crushing makes salt and sand; the factory uses the sand, the salt is the target
        const roots = calculatePlan(config({ targets: [{ item: "lapislazuli", rate: 37 }, { item: "salt", rate: 0.084 }], recipeLocks: { salt: "salt_alt" }, selectedFuel: "woodboard", selfFuel: true, selectedFertilizer: "growthpotion", selfFertilizer: true }));
        const salt = roots.filter((r) => r.itemName === "Salt");
        expect(salt.reduce((sum, r) => sum + (r.netOutputRate ?? 0), 0)).toBeGreaterThanOrEqual(0.084 - 1e-6);
    });

    test("a target also made on the side keeps its own makers' output", () => {
        const cfg = config({ targets: [{ item: "perfumedsoappowder", rate: 26 }, { item: "sand", rate: 0.22 }], selectedFuel: "steam", selfFuel: false, selectedFertilizer: "growthpotion", selfFertilizer: true });
        const roots = calculatePlan(cfg);
        expect(roots.find((r) => r.itemName === "Sand")!.netOutputRate!).toBeGreaterThanOrEqual(0.22 - 1e-6);
    });

    test("a target taken straight from the supply is delivered", () => {
        const cfg = config({ targets: [{ item: "ironingot", rate: 21 }], availableResources: [{ item: "ironingot", rate: 100 }] });
        expect(delivered(cfg)).toBeCloseTo(21, 6);
    });

    test("fuel that comes as another recipe's byproduct reaches the heated machine", () => {
        // Wood board as fuel, partly from the table saw's gloom fungus recipe
        const cfg = config({
            ...NO_RESEARCH,
            logisticsEfficiency: 4,
            factoryEfficiency: 4,
            alchemySkill: 2,
            fuelEfficiency: 2,
            fertilizerEfficiency: 2,
            targets: [{ item: "silveringot", rate: 0.47 }, { item: "limewater", rate: 0.61 }],
            selectedFuel: "woodboard",
            selfFuel: true,
            selectedFertilizer: "advancedfertilizer",
            selfFertilizer: true,
            fertilizerReserve: 0,
            availableResources: [{ item: "growthpotion", rate: 50 }],
            recipeLocks: { silverpowder3: "silver-powder3_alt" },
        });
        const rep = report(cfg);
        for (const t of rep.targets) expect(t.delivered).toBeGreaterThanOrEqual(t.demand - 1e-6);
    });

    test("a tiny target keeps every input", () => {
        const roots = calculatePlan(config({ ...NO_RESEARCH, factoryEfficiency: 10, logisticsEfficiency: 10, alchemySkill: 5, targets: [{ item: "coppercoin", rate: 0.059 }], useCauldron: true, useAdvancedCauldron: true, selectedFuel: "woodboard", selfFuel: true }));
        const nodes = [...collectPlanGraph(roots).nodes.values()] as ProductionNode[];
        const mix = nodes.find((n) => n.recipeId?.includes("flax+gentian"));
        if (mix) expect(nodes.some((n) => n.itemName === "Flax")).toBe(true);
        expect(roots[0].netOutputRate).toBeCloseTo(0.059, 6);
    });
});
