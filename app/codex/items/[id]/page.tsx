import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Clock } from "lucide-react";
import { getAllItems } from "@/engine/item-utils";
import { itemDetail, type RecipeRow } from "@/lib/codex/items";
import { Panel, PanelHeader } from "@/components/ui/Panel";
import { ItemIcon } from "@/components/ui/ItemIcon";
import { PlanThisButton } from "@/components/codex/PlanThisButton";

interface PageProps {
    params: Promise<{ id: string }>;
}

export function generateStaticParams() {
    return getAllItems().map((i) => ({ id: i.id }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { id } = await params;
    const detail = itemDetail(id);
    return detail ? { title: detail.item.name, description: `${detail.item.name}: price, recipes that make it and recipes that use it.` } : { title: "Item not found" };
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
    return (
        <div>
            <div className="text-xs text-[var(--text-muted)]">{label}</div>
            <div className="font-semibold text-[var(--text-primary)]">{value}</div>
        </div>
    );
}

function Entry({ id, name, count, chance, highlight }: { id: string; name: string; count: number; chance?: number; highlight?: boolean }) {
    return (
        <Link href={`/codex/items/${id}`} className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-sm ${highlight ? "border-[var(--accent-gold-dim)] text-[var(--accent-gold)]" : "border-[var(--border)] text-[var(--text-primary)]"} hover:border-[var(--accent-gold)]`}>
            <ItemIcon item={id} size={20} />
            {count}× {name}
            {chance !== undefined && chance < 100 ? <span className="text-xs text-[var(--text-muted)]">({chance}%)</span> : null}
        </Link>
    );
}

function RecipeList({ title, rows, itemId }: { title: string; rows: RecipeRow[]; itemId: string }) {
    if (!rows.length) return null;
    return (
        <Panel>
            <PanelHeader title={`${title} (${rows.length})`} />
            <ul className="flex flex-col divide-y divide-[var(--border-subtle)] p-2">
                {rows.map((r) => (
                    <li key={r.id} className="flex flex-col gap-2 p-2">
                        <div className="flex items-center justify-between gap-2 text-xs text-[var(--text-muted)]">
                            <Link href={`/codex/devices/${r.deviceId}`} className="font-semibold text-[var(--text-secondary)] hover:text-[var(--accent-gold)]">
                                {r.device}
                            </Link>
                            <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" /> {r.time}s
                            </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                            {r.inputs.map((i) => (
                                <Entry key={i.id} {...i} highlight={i.id === itemId} />
                            ))}
                            <span className="px-1 text-[var(--text-muted)]">→</span>
                            {r.outputs.map((o) => (
                                <Entry key={o.id} {...o} highlight={o.id === itemId} />
                            ))}
                        </div>
                    </li>
                ))}
            </ul>
        </Panel>
    );
}

export default async function ItemPage({ params }: PageProps) {
    const { id } = await params;
    const detail = itemDetail(id);
    if (!detail) notFound();
    const { item } = detail;
    return (
        <div className="mx-auto flex max-w-4xl flex-col gap-4 px-4 py-6">
            <Link href="/codex/items" className="inline-flex h-10 items-center gap-2 self-start text-sm text-[var(--text-muted)] hover:text-[var(--accent-gold)]">
                <ArrowLeft className="h-4 w-4" /> All items
            </Link>
            <Panel className="flex flex-col gap-4 p-4 sm:p-6">
                <div className="flex items-center gap-4">
                    <ItemIcon item={item.id} size={64} />
                    <div className="min-w-0 flex-1">
                        <h1 className="font-cinzel text-2xl font-bold text-[var(--accent-gold)]">{item.name}</h1>
                        <p className="text-sm capitalize text-[var(--text-secondary)]">{detail.categories.join(", ")}</p>
                    </div>
                </div>
                <div className="grid grid-cols-2 gap-4 border-t border-[var(--border-subtle)] pt-4 sm:grid-cols-4">
                    {item.price ? <Stat label="Sells for" value={`${item.price.toLocaleString()}¢`} /> : null}
                    {item.cost ? <Stat label="Costs" value={`${item.cost.toLocaleString()}¢`} /> : null}
                    {item.heat_value ? <Stat label="Heat" value={item.heat_value.toLocaleString()} /> : null}
                    {item.nutrient_value ? <Stat label="Nutrients" value={`${item.nutrient_value.toLocaleString()} (${item.nutrients_per_seconds}/s)`} /> : null}
                    {item.required_nutrients ? <Stat label="Needs nutrients" value={item.required_nutrients.toLocaleString()} /> : null}
                    {item.cauldron_cost ? <Stat label="Cauldron value" value={item.cauldron_cost.toLocaleString()} /> : null}
                </div>
                <div className="flex flex-wrap gap-2">
                    <PlanThisButton itemId={item.id} />
                    {detail.mixes.basic > 0 && (
                        <Link href={`/codex/cauldron?q=${encodeURIComponent(item.name)}`} className="inline-flex h-10 items-center rounded-lg border border-[var(--border)] px-4 text-sm hover:border-[var(--accent-gold-dim)]">
                            {detail.mixes.basic} cauldron mixes
                        </Link>
                    )}
                    {detail.mixes.advanced > 0 && (
                        <Link href={`/codex/advanced-cauldron?q=${encodeURIComponent(item.name)}`} className="inline-flex h-10 items-center rounded-lg border border-[var(--border)] px-4 text-sm hover:border-[var(--accent-gold-dim)]">
                            {detail.mixes.advanced} advanced mixes
                        </Link>
                    )}
                </div>
            </Panel>
            <RecipeList title="Made by" rows={detail.madeBy} itemId={item.id} />
            <RecipeList title="Used in" rows={detail.usedIn} itemId={item.id} />
        </div>
    );
}
