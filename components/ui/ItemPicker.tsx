"use client";

import { useMemo, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import { getAllItems, getItem } from "@/engine/item-utils";
import type { Item } from "@/engine/types";
import { cn } from "@/lib/utils";
import { ItemIcon } from "./ItemIcon";
import { Sheet } from "./Sheet";

const firstCategory = (item: Item) => (Array.isArray(item.category) ? item.category[0] : item.category) || "other";

/** Opens a searchable list of items in a sheet; shows the chosen item as a button */
export function ItemPicker({
    value,
    onChange,
    placeholder = "Choose an item",
    filter,
    allowNone,
    title = "Choose an item",
    className,
}: {
    value: string | undefined;
    onChange: (itemId: string) => void;
    placeholder?: string;
    filter?: (item: Item) => boolean;
    /** Offer an empty choice (onChange gets "") */
    allowNone?: string;
    title?: string;
    className?: string;
}) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const items = useMemo(() => getAllItems().filter((i) => !filter || filter(i)), [filter]);
    const groups = useMemo(() => {
        const q = query.trim().toLowerCase();
        const map = new Map<string, Item[]>();
        for (const item of items) {
            if (q && !item.name.toLowerCase().includes(q)) continue;
            const cat = firstCategory(item);
            map.set(cat, [...(map.get(cat) ?? []), item]);
        }
        return [...map].sort(([a], [b]) => a.localeCompare(b)).map(([cat, list]) => [cat, list.sort((a, b) => a.name.localeCompare(b.name))] as const);
    }, [items, query]);
    const chosen = value ? getItem(value) : undefined;
    const pick = (id: string) => {
        onChange(id);
        setOpen(false);
        setQuery("");
    };

    return (
        <>
            <button
                type="button"
                onClick={() => setOpen(true)}
                className={cn("flex h-10 min-w-0 items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--background)] px-2 text-left text-sm hover:border-[var(--accent-gold-dim)]", className)}
            >
                {chosen && <ItemIcon item={chosen.id} size={26} />}
                <span className={cn("min-w-0 flex-1 truncate", chosen ? "text-[var(--text-primary)]" : "text-[var(--text-muted)]")}>{chosen?.name ?? (value === "" && allowNone ? allowNone : placeholder)}</span>
                <ChevronDown className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
            </button>
            <Sheet open={open} onClose={() => setOpen(false)} title={title} className="sm:max-w-xl">
                <div className="sticky top-0 z-10 border-b border-[var(--border)] bg-[var(--surface)] p-3">
                    <div className="flex h-10 items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3">
                        <Search className="h-4 w-4 text-[var(--text-muted)]" />
                        <input
                            autoFocus
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Search"
                            className="w-full bg-transparent text-base text-[var(--text-primary)] outline-none sm:text-sm"
                            aria-label="Search items"
                        />
                    </div>
                </div>
                <div className="p-2">
                    {allowNone && (
                        <button onClick={() => pick("")} className="flex min-h-11 w-full items-center rounded-lg px-3 text-left text-sm text-[var(--text-secondary)] hover:bg-[var(--surface-elevated)]">
                            {allowNone}
                        </button>
                    )}
                    {groups.map(([cat, list]) => (
                        <section key={cat} className="mb-2">
                            <h3 className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">{cat}</h3>
                            {list.map((item) => (
                                <button
                                    key={item.id}
                                    onClick={() => pick(item.id)}
                                    className={cn(
                                        "flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-1 text-left text-sm hover:bg-[var(--surface-elevated)]",
                                        item.id === chosen?.id && "bg-[var(--surface-elevated)] text-[var(--accent-gold)]",
                                    )}
                                >
                                    <ItemIcon item={item.id} size={28} />
                                    <span className="truncate">{item.name}</span>
                                </button>
                            ))}
                        </section>
                    ))}
                    {groups.length === 0 && <p className="p-6 text-center text-sm text-[var(--text-muted)]">Nothing matches “{query}”.</p>}
                </div>
            </Sheet>
        </>
    );
}
