"use client";

import { useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine, ChevronDown, Flame, Lock, Target } from "lucide-react";
import type { Step } from "@/lib/planView";
import { formatRate } from "@/lib/beltDisplay";
import { useFactoryStore } from "@/store/useFactoryStore";
import { ItemIcon } from "@/components/ui/ItemIcon";
import { NodeBeltDetails } from "@/components/graph/NodeBeltDetails";
import { cn } from "@/lib/utils";

const machinesText = (exact: number, built?: number) => {
    const whole = built ?? Math.ceil(exact - 1e-6);
    return Math.abs(whole - exact) < 0.01 ? `${whole}` : `${whole} (${exact.toFixed(2)})`;
};

/** One production step: what it makes on how many machines, from what, for whom */
export function StepCard({ step, factoryId, lockedRecipe }: { step: Step; factoryId: string; lockedRecipe?: string }) {
    const [open, setOpen] = useState(false);
    const setRecipeLock = useFactoryStore((s) => s.setRecipeLock);
    const { node, belt } = step;
    const short = belt && belt.demandRate - belt.realizedRate > 0.05;
    const out = step.isRaw ? step.outputs.reduce((n, o) => n + o.rate, 0) : node.rate;

    return (
        <li className={cn("rounded-xl border bg-[var(--surface)]", step.isTarget ? "border-[var(--accent-gold-dim)]" : "border-[var(--border)]")}>
            <button onClick={() => setOpen(!open)} className="flex w-full items-center gap-3 p-3 text-left" aria-expanded={open}>
                <ItemIcon item={step.itemId} size={40} />
                <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 font-semibold text-[var(--text-primary)]">
                        <span className="truncate">{step.itemName}</span>
                        {step.isTarget && <Target className="h-3.5 w-3.5 shrink-0 text-[var(--accent-gold)]" aria-label="Product" />}
                        {lockedRecipe && <Lock className="h-3.5 w-3.5 shrink-0 text-[var(--accent-purple)]" aria-label="Recipe picked" />}
                    </span>
                    <span className="block truncate text-xs text-[var(--text-muted)]">
                        {step.isRaw ? (node.suppliedRate ? "Supplied from outside" : "Comes in raw") : `${machinesText(node.deviceCount, belt?.machinesBuilt)} × ${step.deviceName}`}
                        {node.parentFurnaceCount ? ` · ${node.parentFurnaceCount} heater${node.parentFurnaceCount === 1 ? "" : "s"}` : ""}
                    </span>
                </span>
                <span className="text-right">
                    <span className={cn("block font-mono text-sm font-semibold", short ? "text-[var(--warning)]" : "text-[var(--text-primary)]")}>{formatRate(out)}</span>
                    <span className="block text-[10px] text-[var(--text-muted)]">/min</span>
                </span>
                <ChevronDown className={cn("h-4 w-4 shrink-0 text-[var(--text-muted)] transition-transform", open && "rotate-180")} />
            </button>
            {open && (
                <div className="flex flex-col gap-3 border-t border-[var(--border-subtle)] p-3 text-sm">
                    {step.inputs.length > 0 && (
                        <FlowList icon={<ArrowDownToLine className="h-3.5 w-3.5" />} title="Takes" flows={step.inputs.filter((f) => f.rate > 0 || f.demand)} />
                    )}
                    {step.outputs.length > 0 && <FlowList icon={<ArrowUpFromLine className="h-3.5 w-3.5" />} title="Sends" flows={step.outputs} />}
                    {node.byproducts.length > 0 && (
                        <p className="text-xs text-[var(--text-muted)]">Also makes {node.byproducts.map((b) => `${formatRate(b.rate)}/min ${b.itemName}`).join(", ")}</p>
                    )}
                    {node.heatConsumption > 0 && (
                        <p className="flex items-center gap-1 text-xs text-[var(--text-muted)]">
                            <Flame className="h-3 w-3 text-orange-400" /> {formatRate(node.heatConsumption / 60)} heat/s
                        </p>
                    )}
                    {step.alternatives.length > 0 && (
                        <label className="flex flex-col gap-1">
                            <span className="text-xs text-[var(--text-muted)]">Recipe</span>
                            <select
                                value={lockedRecipe ?? ""}
                                onChange={(e) => setRecipeLock(factoryId, step.itemId, e.target.value || null)}
                                className="h-10 rounded-lg border border-[var(--border)] bg-[var(--background)] px-2 text-sm text-[var(--text-primary)]"
                            >
                                <option value="">Best (planner picks)</option>
                                {step.alternatives.map((a) => (
                                    <option key={a.id} value={a.id}>
                                        {a.label}
                                    </option>
                                ))}
                            </select>
                        </label>
                    )}
                    {belt && !step.isRaw && <NodeBeltDetails belt={belt} />}
                </div>
            )}
        </li>
    );
}

function FlowList({ icon, title, flows }: { icon: React.ReactNode; title: string; flows: Step["inputs"] }) {
    return (
        <div>
            <h4 className="mb-1 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                {icon} {title}
            </h4>
            <ul className="flex flex-col gap-1">
                {flows.map((f) => (
                    <li key={f.key} className="flex items-center gap-2">
                        <ItemIcon item={f.itemName} size={20} />
                        <span className="min-w-0 flex-1 truncate">{f.label ?? f.itemName}</span>
                        <span className={cn("font-mono text-xs", f.demand ? "text-[var(--warning)]" : "text-[var(--text-secondary)]")}>
                            {formatRate(f.rate)}
                            {f.demand ? ` of ${formatRate(f.demand)}` : ""}/min
                        </span>
                    </li>
                ))}
            </ul>
        </div>
    );
}
