"use client";

import { Plus, X } from "lucide-react";
import type { Rate } from "@/engine/types";
import type { Item } from "@/engine/types";
import { ItemPicker } from "@/components/ui/ItemPicker";
import { NumberField } from "@/components/ui/NumberField";
import { Button } from "@/components/ui/Button";

/** Rows of item + rate a minute, with add and remove */
export function RateList({
    rates,
    onChange,
    addLabel,
    defaultRate = 10,
    filter,
    empty,
}: {
    rates: Rate[];
    onChange: (rates: Rate[]) => void;
    addLabel: string;
    defaultRate?: number;
    filter?: (item: Item) => boolean;
    empty?: string;
}) {
    const set = (index: number, change: Partial<Rate>) => onChange(rates.map((r, i) => (i === index ? { ...r, ...change } : r)));
    return (
        <div className="flex flex-col gap-2">
            {rates.length === 0 && empty && <p className="text-sm text-[var(--text-muted)]">{empty}</p>}
            {rates.map((r, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
                    <ItemPicker value={r.item} onChange={(item) => set(i, { item })} filter={filter} className="min-w-0 flex-1 basis-full sm:basis-auto" />
                    <NumberField value={r.rate} onChange={(rate) => set(i, { rate })} step={5} label="Rate a minute" suffix="/min" className="flex-1 sm:w-40 sm:flex-none" />
                    <Button size="icon" variant="ghost" onClick={() => onChange(rates.filter((_, j) => j !== i))} aria-label="Remove">
                        <X className="h-4 w-4" />
                    </Button>
                </div>
            ))}
            <Button variant="ghost" size="sm" className="self-start text-[var(--accent-gold)]" onClick={() => onChange([...rates, { item: "", rate: defaultRate }])}>
                <Plus className="h-4 w-4" />
                {addLabel}
            </Button>
        </div>
    );
}
