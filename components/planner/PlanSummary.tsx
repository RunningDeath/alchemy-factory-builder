import { AlertTriangle, Flame } from "lucide-react";
import type { PlanView } from "@/lib/planView";
import { formatRate } from "@/lib/beltDisplay";
import { Panel, PanelHeader } from "@/components/ui/Panel";
import { ItemIcon } from "@/components/ui/ItemIcon";

function Row({ item, label, value, tone }: { item?: string; label: string; value: string; tone?: "warn" | "muted" }) {
    return (
        <li className="flex min-h-9 items-center gap-2 text-sm">
            {item && <ItemIcon item={item} size={24} />}
            <span className="min-w-0 flex-1 truncate text-[var(--text-primary)]">{label}</span>
            <span className={tone === "warn" ? "font-mono font-semibold text-[var(--warning)]" : tone === "muted" ? "font-mono text-[var(--text-muted)]" : "font-mono font-semibold text-[var(--text-secondary)]"}>{value}</span>
        </li>
    );
}

/** Targets delivered, raw materials in, machines to build, leftovers */
export function PlanSummary({ view }: { view: PlanView }) {
    const built = view.machines.reduce((n, m) => n + m.built, 0);
    return (
        <Panel>
            <PanelHeader title="Summary" subtitle={`${built} buildings · ${view.steps.filter((s) => !s.isRaw).length} steps`} />
            <div className="grid gap-x-6 gap-y-4 p-4 sm:grid-cols-2">
                <section>
                    <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Products</h3>
                    <ul>
                        {view.targets.map((t) => (
                            <Row
                                key={t.itemName}
                                item={t.itemName}
                                label={t.itemName}
                                value={t.delivered + 0.05 < t.demand ? `${formatRate(t.delivered)} of ${formatRate(t.demand)}/min` : `${formatRate(t.delivered)}/min`}
                                tone={t.delivered + 0.05 < t.demand ? "warn" : undefined}
                            />
                        ))}
                    </ul>
                </section>
                <section>
                    <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Comes in</h3>
                    <ul>
                        {view.raw.length === 0 && <li className="text-sm text-[var(--text-muted)]">Nothing</li>}
                        {view.raw.map((r) => (
                            <Row key={r.itemName} item={r.itemName} label={r.supplied ? `${r.itemName} (supplied)` : r.itemName} value={`${formatRate(r.rate)}/min`} />
                        ))}
                    </ul>
                </section>
                <section>
                    <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Buildings</h3>
                    <ul>
                        {view.machines.map((m) => (
                            <Row key={m.deviceId} label={m.name} value={`${m.built}×`} />
                        ))}
                    </ul>
                    {view.heatPerMinute > 0 && (
                        <p className="mt-1 flex items-center gap-1 text-xs text-[var(--text-muted)]">
                            <Flame className="h-3 w-3 text-orange-400" /> {formatRate(view.heatPerMinute / 60)} heat/s
                        </p>
                    )}
                </section>
                {view.unused.length > 0 && (
                    <section>
                        <h3 className="mb-1 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                            <AlertTriangle className="h-3 w-3" /> Byproducts nobody uses
                        </h3>
                        <p className="mb-1 text-xs text-[var(--text-muted)]">Need a sink: altar, trash barrel or dispatch portal.</p>
                        <ul>
                            {view.unused.map((l, i) => (
                                <Row key={`${l.itemName}-${i}`} item={l.itemName} label={l.itemName} value={`${formatRate(l.rate)}/min`} tone="warn" />
                            ))}
                        </ul>
                    </section>
                )}
                {view.spare.length > 0 && (
                    <section>
                        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Spare capacity</h3>
                        <p className="mb-1 text-xs text-[var(--text-muted)]">Whole machines could make this much more. The belt backs up and they wait; nothing is lost.</p>
                        <ul>
                            {view.spare.map((l, i) => (
                                <Row key={`${l.itemName}-${i}`} item={l.itemName} label={l.itemName} value={`+${formatRate(l.rate)}/min`} tone="muted" />
                            ))}
                        </ul>
                    </section>
                )}
            </div>
        </Panel>
    );
}
