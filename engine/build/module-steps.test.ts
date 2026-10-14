import { describe, expect, test } from "bun:test";
import { analyzeBelts } from "../belt-analysis";
import { calculatePlan } from "../planner";
import type { PlannerConfig } from "../types";
import { stepsFromReport } from "./module-steps";

const config: PlannerConfig = {
  targets: [{ item: "Steel Ingot", rate: 3.8 }],
  availableResources: [],
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
  // As the planner keeps it: the item id
  selectedFuel: "coal",
  selfFuel: true,
  selfFertilizer: true,
};

describe("stepsFromReport", () => {
  test("a machine that burns its own ingredient (coke from coal) is heated, with the fuel given by id", () => {
    const report = analyzeBelts(calculatePlan(config), config, { planParallelLines: true, machineRounding: "up" });
    const steps = stepsFromReport(report, config.selectedFuel);
    const crucibles = steps.filter((s) => s.deviceId === "crucible");
    expect(crucibles.length).toBeGreaterThan(0);
    crucibles.forEach((s) => expect(s.heating).toMatchObject({ kind: "stove", fuelItem: "Coal" }));
    expect(crucibles.every((s) => s.heating!.fuelRate > 0)).toBe(true);
  });

  test("with a strong fuel (panacea) every heated machine still gets the selected fuel and a fuel belt", () => {
    const cfg: PlannerConfig = { ...config, targets: [{ item: "Copper Coin", rate: 1 }], selectedFuel: "panaceaelixir", selectedFertilizer: "panaceaelixir", selfFertilizer: true, useCauldron: true, useAdvancedCauldron: true };
    const report = analyzeBelts(calculatePlan(cfg), cfg, { planParallelLines: true, machineRounding: "up" });
    const heated = stepsFromReport(report, cfg.selectedFuel).filter((s) => ["crucible", "alembic", "advanced-alembic", "cauldron", "advanced-cauldron", "iron-smelter"].includes(s.deviceId));
    expect(heated.length).toBeGreaterThan(0);
    // Not a byproduct that happens to share the belt (gentian for aqua vitae), not nothing
    heated.forEach((s) => expect(s.heating).toMatchObject({ fuelItem: "Panacea Potion" }));
    heated.forEach((s) => expect(s.heating!.fuelRate).toBeGreaterThanOrEqual(0.01));
  });
});
