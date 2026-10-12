"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { FactoryConfig, Item, RoundingMode } from "@/engine/types";
import { useFactoryStore, type FactoryData, DEFAULT_FERTILIZER_RESERVE } from "@/store/useFactoryStore";
import { Panel } from "@/components/ui/Panel";
import { ItemPicker } from "@/components/ui/ItemPicker";
import { Switch } from "@/components/ui/Switch";
import { NumberField } from "@/components/ui/NumberField";
import { Segmented } from "@/components/ui/Segmented";
import { cn } from "@/lib/utils";
import { ResearchFields } from "@/components/research/ResearchFields";

const isFuel = (i: Item) => !!i.heat_value;
const isFertilizer = (i: Item) => !!i.nutrient_value;

function Section({
    title,
    children,
    defaultOpen = true,
    open: controlled,
    onToggle,
}: {
    title: string;
    children: React.ReactNode;
    defaultOpen?: boolean;
    /** Controlled from outside (remembered state) */
    open?: boolean;
    onToggle?: (open: boolean) => void;
}) {
    const [own, setOwn] = useState(defaultOpen);
    const open = controlled ?? own;
    const setOpen = (next: boolean) => (onToggle ? onToggle(next) : setOwn(next));
    return (
        <div className="border-t border-[var(--border-subtle)] first:border-t-0">
            <button onClick={() => setOpen(!open)} className="flex min-h-11 w-full items-center justify-between px-4 text-left text-sm font-semibold text-[var(--text-primary)]" aria-expanded={open}>
                {title}
                <ChevronDown className={cn("h-4 w-4 text-[var(--text-muted)] transition-transform", open && "rotate-180")} />
            </button>
            {open && <div className="flex flex-col gap-2 px-4 pb-4">{children}</div>}
        </div>
    );
}

/** Fuel, fertilizer, cauldron and machine rounding for one factory */
export function SettingsPanel({ factory }: { factory: FactoryData }) {
    const updateConfig = useFactoryStore((s) => s.updateFactoryConfig);
    const c = factory.config;
    // Research starts open (the levels matter for everything); closing it is remembered
    const researchOpen = useFactoryStore((s) => !s.researchCollapsed);
    const setResearchCollapsed = useFactoryStore((s) => s.setResearchCollapsed);
    const noLevels = useFactoryStore((s) => Object.values(s.research).every((level) => level === 0));
    const set = (updates: Partial<FactoryConfig>) => updateConfig(factory.id, updates);

    return (
        <Panel>
            <Section title="Research (all factories)" open={researchOpen} onToggle={(open) => setResearchCollapsed(!open)}>
                {noLevels && <p className="text-xs text-[var(--accent-gold)]">Enter your research levels from the game first: they change machine and belt speeds.</p>}
                <ResearchFields />
            </Section>
            <Section title="Fuel and fertilizer">
                <label className="text-xs text-[var(--text-muted)]">Fuel for heated machines</label>
                <ItemPicker value={c.selectedFuel ?? "coal"} onChange={(selectedFuel) => set({ selectedFuel })} filter={isFuel} title="Fuel" />
                <Switch checked={c.selfFuel ?? true} onChange={(selfFuel) => set({ selfFuel })} label="Make the fuel here" hint="Off: it comes in from outside" />
                <label className="mt-2 text-xs text-[var(--text-muted)]">Fertilizer for nurseries</label>
                <ItemPicker value={c.selectedFertilizer ?? ""} onChange={(selectedFertilizer) => set({ selectedFertilizer })} filter={isFertilizer} allowNone="No fertilizer (slow growth)" title="Fertilizer" />
                {c.selectedFertilizer && (
                    <>
                        <Switch checked={c.selfFertilizer ?? true} onChange={(selfFertilizer) => set({ selfFertilizer })} label="Make the fertilizer here" hint="The nurseries get their share before anything leaves" />
                        {(c.selfFertilizer ?? true) && (
                            <div className="flex items-center justify-between gap-3">
                                <span className="text-sm text-[var(--text-primary)]">
                                    Reserve
                                    <span className="block text-xs text-[var(--text-muted)]">Extra fertilizer, so a slow start doesn’t starve a nursery</span>
                                </span>
                                <NumberField
                                    value={Math.round((c.fertilizerReserve ?? DEFAULT_FERTILIZER_RESERVE) * 100)}
                                    onChange={(v) => set({ fertilizerReserve: v / 100 })}
                                    max={200}
                                    step={5}
                                    suffix="%"
                                    label="Reserve"
                                    className="w-36"
                                />
                            </div>
                        )}
                    </>
                )}
            </Section>
            <Section title="Cauldron" defaultOpen={!!c.useCauldron}>
                <Switch checked={!!c.useCauldron} onChange={(useCauldron) => set({ useCauldron })} label="Use the cauldron" hint="Where a mix takes fewer steps than the usual chain; plant mixes preferred" />
                <Switch checked={!!c.useAdvancedCauldron} onChange={(useAdvancedCauldron) => set({ useAdvancedCauldron })} label="Advanced cauldron too" hint="Two inputs, level 8" disabled={!c.useCauldron} />
                <Switch checked={!!c.cauldronBuyInputs} onChange={(cauldronBuyInputs) => set({ cauldronBuyInputs })} label="Buy cauldron inputs" hint="At the purchasing portal, instead of making them" disabled={!c.useCauldron} />
            </Section>
            <Section title="Machines and belts" defaultOpen={false}>
                <span className="text-xs text-[var(--text-muted)]">Machine counts</span>
                <Segmented<RoundingMode>
                    label="Machine counts"
                    value={c.machineRounding ?? "up"}
                    onChange={(machineRounding) => set({ machineRounding })}
                    options={[
                        { value: "up", label: "Round up" },
                        { value: "down", label: "Round down" },
                        { value: "exact", label: "Exact" },
                    ]}
                />
                <Switch checked={c.planParallelLines ?? true} onChange={(planParallelLines) => set({ planParallelLines })} label="Parallel belt lines" hint="Split flows over one belt’s speed into several lines" />
            </Section>
        </Panel>
    );
}
