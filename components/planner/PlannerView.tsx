"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { GitBranch, Hammer, List, PanelLeftClose, PanelLeftOpen, Waypoints } from "lucide-react";
import { useActiveFactory, useFactoryStore } from "@/store/useFactoryStore";
import { useEnsureFactory, useHydrated } from "@/store/useHydrated";
import { buildPlanView } from "@/lib/planView";
import { Panel, PanelHeader } from "@/components/ui/Panel";
import { Segmented } from "@/components/ui/Segmented";
import { BeltSummaryPanel } from "@/components/dashboard/BeltSummaryPanel";
import { FactoryBar } from "./FactoryBar";
import { RateList } from "./RateList";
import { SettingsPanel } from "./SettingsPanel";
import { PlanSummary } from "./PlanSummary";
import { StepCard } from "./StepCard";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

// The flow chart pulls in React Flow and dagre: only load it when it is shown
// The module generator (three.js, workers) likewise
const BuildPlanner = dynamic(() => import("@/components/build/BuildPlanner").then((m) => m.BuildPlanner), { ssr: false, loading: () => <div className="h-[70dvh] animate-pulse rounded-xl bg-[var(--surface)]" /> });
const PlanGraph = dynamic(() => import("./PlanGraph").then((m) => m.PlanGraph), { ssr: false, loading: () => <div className="h-[70dvh] animate-pulse rounded-xl bg-[var(--surface)]" /> });

type ResultTab = "list" | "graph" | "belts" | "build";

export function PlannerView() {
    const hydrated = useHydrated();
    useEnsureFactory(hydrated);
    const factory = useActiveFactory();
    const setTargets = useFactoryStore((s) => s.setTargets);
    const setResources = useFactoryStore((s) => s.setResources);
    const setViewMode = useFactoryStore((s) => s.setViewMode);
    // Build tab on wide screens: the inputs column can fold away for room
    const [inputsHidden, setInputsHidden] = useState(false);
    const view = useMemo(() => (factory ? buildPlanView(factory.productionTrees, factory.beltReport) : null), [factory]);

    if (!hydrated || !factory || !view) return <div className="mx-auto h-64 max-w-7xl animate-pulse px-4 py-6" />;
    const tab: ResultTab = factory.viewMode === "graph" || factory.viewMode === "belts" || factory.viewMode === "build" ? factory.viewMode : "list";
    const building = tab === "build";
    const folded = building && inputsHidden;
    const hasPlan = view.steps.length > 0;
    const asked = factory.targets.filter((t) => t.item && t.rate > 0);

    return (
        <div className={cn("mx-auto flex flex-col gap-4 px-4 py-4 lg:py-6", building ? "max-w-[1920px]" : "max-w-7xl")}>
            <FactoryBar />
            <div className={cn("grid items-start gap-4", !folded && "lg:grid-cols-[minmax(340px,400px)_1fr]")}>
                <div className={cn("flex flex-col gap-4 lg:sticky lg:top-20 lg:max-h-[calc(100dvh-6rem)] lg:overflow-y-auto custom-scrollbar", folded && "lg:hidden")}>
                    <Panel>
                        <PanelHeader title="Make" subtitle="What the factory should put out" />
                        <div className="p-4">
                            <RateList rates={factory.targets} onChange={(t) => setTargets(factory.id, t)} addLabel="Add product" empty="Add the products you want." />
                        </div>
                    </Panel>
                    <Panel>
                        <PanelHeader title="Supplied" subtitle="Comes in from another factory or a mine (free)" />
                        <div className="p-4">
                            <RateList rates={factory.availableResources} onChange={(r) => setResources(factory.id, r)} addLabel="Add supply" defaultRate={60} />
                        </div>
                    </Panel>
                    <SettingsPanel factory={factory} />
                </div>

                <div className="flex min-w-0 flex-col gap-4">
                    {!hasPlan ? (
                        <Panel className="p-8 text-center text-sm text-[var(--text-muted)]">
                            {asked.length ? "These products can’t be made with the current settings." : "Pick a product to see the plan."}
                        </Panel>
                    ) : (
                        <>
                            <div className="flex items-center gap-2">
                                {building && (
                                    <Button size="icon" variant="ghost" className="hidden lg:inline-flex" onClick={() => setInputsHidden(!inputsHidden)} aria-label={inputsHidden ? "Show inputs" : "Hide inputs"} title={inputsHidden ? "Show inputs" : "Hide inputs"}>
                                        {inputsHidden ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
                                    </Button>
                                )}
                                <Segmented<ResultTab>
                                    label="Plan view"
                                    className="flex-1"
                                    value={tab}
                                    onChange={(t) => setViewMode(factory.id, t)}
                                    options={[
                                        { value: "list", label: <><List className="h-4 w-4" /> Steps</> },
                                        { value: "graph", label: <><GitBranch className="h-4 w-4" /> Chart</> },
                                        { value: "belts", label: <><Waypoints className="h-4 w-4" /> Belts</> },
                                        { value: "build", label: <><Hammer className="h-4 w-4" /> Build</> },
                                    ]}
                                />
                            </div>
                            {!building && <PlanSummary view={view} />}
                            {tab === "list" && (
                                <ol className="flex flex-col gap-2">
                                    {view.steps.map((s) => (
                                        <StepCard key={s.key} step={s} factoryId={factory.id} lockedRecipe={factory.config.recipeLocks?.[s.itemId]} />
                                    ))}
                                </ol>
                            )}
                            {tab === "graph" && <PlanGraph view={view} beltSpeed={factory.beltReport?.beltSpeed ?? 60} />}
                            {tab === "belts" && factory.beltReport && <BeltSummaryPanel report={factory.beltReport} />}
                            {building && <BuildPlanner />}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
