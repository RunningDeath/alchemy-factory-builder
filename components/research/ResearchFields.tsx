"use client";

import { RotateCcw } from "lucide-react";
import type { ResearchState } from "@/engine/types";
import { useFactoryStore } from "@/store/useFactoryStore";
import { beltSpeedForLevel, factorySpeedMultiplier } from "@/engine/game-constants";
import { calculateAlchemyBonus, calculateCustomerMgmtBonus, calculateSalesBonus, calculateThrowingBonus } from "@/engine/planner";
import { NumberField } from "@/components/ui/NumberField";
import { Button } from "@/components/ui/Button";

const pct = (v: number) => `+${Math.round(v * 100)}%`;

const FIELDS: { key: keyof ResearchState; label: string; effect: (level: number) => string; planner?: boolean }[] = [
    { key: "factoryEfficiency", label: "Factory Efficiency", effect: (l) => `${pct(factorySpeedMultiplier(l) - 1)} machine speed`, planner: true },
    { key: "logisticsEfficiency", label: "Logistics Efficiency", effect: (l) => `${beltSpeedForLevel(l)}/min per belt`, planner: true },
    { key: "alchemySkill", label: "Alchemy Skill", effect: (l) => `${pct(calculateAlchemyBonus(l))} extractor and alembic output`, planner: true },
    { key: "fuelEfficiency", label: "Fuel Efficiency", effect: (l) => `${pct(l * 0.1)} heat per fuel`, planner: true },
    { key: "fertilizerEfficiency", label: "Fertilizer Efficiency", effect: (l) => `${pct(l * 0.1)} nutrients per fertilizer`, planner: true },
    { key: "throwingEfficiency", label: "Throwing Efficiency", effect: (l) => `${pct(calculateThrowingBonus(l))} catapult range` },
    { key: "salesAbility", label: "Sales Ability", effect: (l) => `${pct(calculateSalesBonus(l))} sale price` },
    { key: "customerMgmt", label: "Customer Management", effect: (l) => `${pct(calculateCustomerMgmtBonus(l))} customer payment` },
    { key: "negotiationSkill", label: "Negotiation Skill", effect: (l) => `level ${l}` },
    { key: "relicKnowledge", label: "Relic Knowledge", effect: (l) => `level ${l}` },
];

/** Research levels, shared by every factory */
export function ResearchFields() {
    const research = useFactoryStore((s) => s.research);
    const setResearch = useFactoryStore((s) => s.setResearch);
    const resetResearch = useFactoryStore((s) => s.resetResearch);
    return (
        <div className="flex flex-col gap-2">
            <ul className="divide-y divide-[var(--border-subtle)]">
                    {FIELDS.map((f) => (
                        <li key={f.key} className="flex items-center gap-3 py-2">
                            <div className="min-w-0 flex-1">
                                <div className="text-sm font-semibold text-[var(--text-primary)]">{f.label}</div>
                                <div className="text-xs text-[var(--text-muted)]">
                                    {f.effect(research[f.key])}
                                    {f.planner ? "" : " · not used by the planner"}
                                </div>
                            </div>
                            <NumberField value={research[f.key]} onChange={(v) => setResearch(f.key, Math.round(v))} max={92} label={f.label} className="w-32 shrink-0" />
                        </li>
                    ))}
            </ul>
            <Button variant="ghost" size="sm" className="self-start" onClick={() => window.confirm("Set every research level back to 0?") && resetResearch()}>
                <RotateCcw className="h-4 w-4" /> Reset all
            </Button>
        </div>
    );
}
