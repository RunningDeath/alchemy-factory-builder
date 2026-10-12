/**
 * Factories, research and build unlocks, kept in the browser. The plan and belt report of
 * each factory are derived (recomputed after every change, never stored).
 */
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { BuildLayoutState, FactoryConfig, FactoryState, LineOverride, ProductionNode, Rate, ResearchState, RoundingMode, ViewMode } from "../engine/types";
import { calculatePlan } from "../engine/planner";
import { analyzeBelts, DEFAULT_ROUNDING, type BeltReport, type LineMode, type RoundingChoice } from "../engine/belt-analysis";
import { MAX_LEVEL, type BuildUnlocks } from "../engine/build/unlocks";

export interface FactoryData extends FactoryState {
    /** Derived: the plan's target nodes */
    productionTrees: ProductionNode[];
    /** Derived: belts, machines built and what really arrives */
    beltReport: BeltReport | null;
}

export const DEFAULT_RESEARCH: ResearchState = {
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

/** Self-made fertilizer planned this share above what the nurseries eat */
export const DEFAULT_FERTILIZER_RESERVE = 0.25;

const DEFAULT_CONFIG: FactoryConfig = {
    ...DEFAULT_RESEARCH,
    selectedFuel: "coal",
    selectedFertilizer: "",
    selfFuel: true,
    selfFertilizer: true,
    fertilizerReserve: DEFAULT_FERTILIZER_RESERVE,
    planParallelLines: true,
    machineRounding: DEFAULT_ROUNDING,
};

function compute(factory: FactoryState, research: ResearchState): Pick<FactoryData, "productionTrees" | "beltReport"> {
    const config = {
        ...DEFAULT_CONFIG,
        ...factory.config,
        ...research,
        // Rows still without an item don't count
        targets: factory.targets.filter((t) => t.item && t.rate > 0),
        availableResources: factory.availableResources.filter((r) => r.item && r.rate > 0),
    };
    const productionTrees = calculatePlan(config);
    const beltReport = productionTrees.length
        ? analyzeBelts(productionTrees, config, {
              planParallelLines: config.planParallelLines ?? true,
              lineOverrides: factory.lineOverrides ?? {},
              machineRounding: config.machineRounding ?? DEFAULT_ROUNDING,
              roundingOverrides: factory.roundingOverrides ?? {},
          })
        : null;
    return { productionTrees, beltReport };
}

/** Set or clear ("inherit") one entry of a per-node override map */
function withOverride<T extends string>(map: Record<string, T> | undefined, key: string, value: T | "inherit"): Record<string, T> {
    const next = { ...(map ?? {}) };
    if (value === "inherit") delete next[key];
    else next[key] = value;
    return next;
}

const newId = () => (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `f${Date.now()}${Math.random().toString(36).slice(2, 8)}`);

interface FactoryStore {
    factories: FactoryData[];
    activeFactoryId: string | null;
    research: ResearchState;
    buildUnlocks: BuildUnlocks;
    /** The player closed the research section (it starts open) */
    researchCollapsed: boolean;

    addFactory: (name?: string) => string;
    removeFactory: (id: string) => void;
    renameFactory: (id: string, name: string) => void;
    duplicateFactory: (id: string) => void;
    setActiveFactory: (id: string) => void;
    setTargets: (id: string, targets: Rate[]) => void;
    setResources: (id: string, resources: Rate[]) => void;
    updateFactoryConfig: (id: string, updates: Partial<FactoryConfig>) => void;
    setRecipeLock: (id: string, itemId: string, recipeId: string | null) => void;
    setViewMode: (id: string, mode: ViewMode) => void;
    setBuildLayout: (id: string, layout: BuildLayoutState) => void;
    setLineOverride: (id: string, nodeKey: string, mode: LineMode) => void;
    setRoundingOverride: (id: string, nodeKey: string, mode: RoundingChoice) => void;
    setResearch: (field: keyof ResearchState, value: number) => void;
    resetResearch: () => void;
    setBuildUnlocks: (unlocks: BuildUnlocks) => void;
    setResearchCollapsed: (collapsed: boolean) => void;
    /** Recompute every factory (after loading) */
    recalculate: () => void;
}

export const useFactoryStore = create<FactoryStore>()(
    persist(
        (set, get) => {
            /** Change one factory and recompute its plan */
            const update = (id: string, change: (f: FactoryData) => Partial<FactoryState>) =>
                set((state) => ({
                    factories: state.factories.map((f) => {
                        if (f.id !== id) return f;
                        const next = { ...f, ...change(f) };
                        return { ...next, ...compute(next, state.research) };
                    }),
                }));
            /** Change one factory without touching its plan (view state, layouts) */
            const patch = (id: string, change: (f: FactoryData) => Partial<FactoryData>) =>
                set((state) => ({ factories: state.factories.map((f) => (f.id === id ? { ...f, ...change(f) } : f)) }));

            return {
                factories: [],
                activeFactoryId: null,
                research: DEFAULT_RESEARCH,
                buildUnlocks: { level: MAX_LEVEL },
                researchCollapsed: false,

                addFactory: (name) => {
                    const id = newId();
                    const factory: FactoryState = {
                        id,
                        name: name ?? `Factory ${get().factories.length + 1}`,
                        targets: [],
                        availableResources: [],
                        config: DEFAULT_CONFIG,
                        viewMode: "list",
                    };
                    set((state) => ({ factories: [...state.factories, { ...factory, productionTrees: [], beltReport: null }], activeFactoryId: id }));
                    return id;
                },
                removeFactory: (id) =>
                    set((state) => {
                        const factories = state.factories.filter((f) => f.id !== id);
                        return { factories, activeFactoryId: state.activeFactoryId === id ? (factories[0]?.id ?? null) : state.activeFactoryId };
                    }),
                renameFactory: (id, name) => patch(id, () => ({ name })),
                duplicateFactory: (id) => {
                    const source = get().factories.find((f) => f.id === id);
                    if (!source) return;
                    const copy = { ...structuredClone(source), id: newId(), name: `${source.name} (copy)` };
                    set((state) => ({ factories: [...state.factories, copy], activeFactoryId: copy.id }));
                },
                setActiveFactory: (id) => set({ activeFactoryId: id }),
                setTargets: (id, targets) => update(id, () => ({ targets })),
                setResources: (id, availableResources) => update(id, () => ({ availableResources })),
                updateFactoryConfig: (id, updates) => update(id, (f) => ({ config: { ...f.config, ...updates } })),
                setRecipeLock: (id, itemId, recipeId) =>
                    update(id, (f) => {
                        const recipeLocks = { ...(f.config.recipeLocks ?? {}) };
                        if (recipeId) recipeLocks[itemId] = recipeId;
                        else delete recipeLocks[itemId];
                        return { config: { ...f.config, recipeLocks } };
                    }),
                setViewMode: (id, viewMode) => patch(id, () => ({ viewMode })),
                setBuildLayout: (id, buildLayout) => patch(id, () => ({ buildLayout })),
                setLineOverride: (id, key, mode) => update(id, (f) => ({ lineOverrides: withOverride<LineOverride>(f.lineOverrides, key, mode) })),
                setRoundingOverride: (id, key, mode) => update(id, (f) => ({ roundingOverrides: withOverride<RoundingMode>(f.roundingOverrides, key, mode) })),
                setResearch: (field, value) => {
                    set((state) => ({ research: { ...state.research, [field]: Math.max(0, value) } }));
                    get().recalculate();
                },
                resetResearch: () => {
                    set({ research: DEFAULT_RESEARCH });
                    get().recalculate();
                },
                setBuildUnlocks: (buildUnlocks) => set({ buildUnlocks }),
                setResearchCollapsed: (researchCollapsed) => set({ researchCollapsed }),
                recalculate: () => set((state) => ({ factories: state.factories.map((f) => ({ ...f, ...compute(f, state.research) })) })),
            };
        },
        {
            name: "alchemy-factory-builder",
            version: 1,
            storage: createJSONStorage(() => localStorage),
            // Plans are derived: store only what the player entered
            partialize: (state) => ({
                activeFactoryId: state.activeFactoryId,
                research: state.research,
                buildUnlocks: state.buildUnlocks,
                researchCollapsed: state.researchCollapsed,
                factories: state.factories.map(({ productionTrees: _p, beltReport: _b, ...rest }) => rest),
            }),
            onRehydrateStorage: () => (state) => state?.recalculate(),
        },
    ),
);

/** The factory being edited (null before the first one exists) */
export function useActiveFactory(): FactoryData | null {
    return useFactoryStore((s) => s.factories.find((f) => f.id === s.activeFactoryId) ?? null);
}
