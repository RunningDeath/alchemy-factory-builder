"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { allCategories, allItemsSorted, categoriesOf } from "@/lib/codex/item-list";
import { ItemIcon } from "@/components/ui/ItemIcon";
import { cn } from "@/lib/utils";

/** Searchable item list with category chips (they scroll sideways on phones) */
export function ItemBrowser() {
    const items = useMemo(() => allItemsSorted(), []);
    const categories = useMemo(() => allCategories(), []);
    const [query, setQuery] = useState("");
    const [category, setCategory] = useState<string | null>(null);
    const shown = items.filter((i) => (!query || i.name.toLowerCase().includes(query.toLowerCase())) && (!category || categoriesOf(i).includes(category)));

    return (
        <div className="flex flex-col gap-4">
            <div className="flex h-11 items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3">
                <Search className="h-4 w-4 text-[var(--text-muted)]" />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Search ${items.length} items`} className="w-full bg-transparent text-base text-[var(--text-primary)] outline-none sm:text-sm" aria-label="Search items" />
            </div>
            <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 custom-scrollbar sm:mx-0 sm:flex-wrap sm:px-0">
                {[null, ...categories].map((c) => (
                    <button
                        key={c ?? "all"}
                        onClick={() => setCategory(c)}
                        className={cn(
                            "h-9 shrink-0 rounded-full border px-3 text-sm capitalize",
                            category === c ? "border-[var(--accent-gold)] bg-[var(--surface-elevated)] text-[var(--accent-gold)]" : "border-[var(--border)] text-[var(--text-secondary)]",
                        )}
                    >
                        {c ?? "All"}
                    </button>
                ))}
            </div>
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {shown.map((i) => (
                    <li key={i.id}>
                        <Link href={`/codex/items/${i.id}`} className="flex min-h-14 items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-2 hover:border-[var(--accent-gold-dim)]">
                            <ItemIcon item={i.id} size={40} />
                            <span className="min-w-0 flex-1">
                                <span className="block truncate font-semibold text-[var(--text-primary)]">{i.name}</span>
                                <span className="block truncate text-xs capitalize text-[var(--text-muted)]">{categoriesOf(i).join(", ")}</span>
                            </span>
                            {i.price ? <span className="font-mono text-xs text-[var(--accent-gold)]">{i.price.toLocaleString()}¢</span> : null}
                        </Link>
                    </li>
                ))}
            </ul>
            {shown.length === 0 && <p className="py-8 text-center text-sm text-[var(--text-muted)]">No items match.</p>}
        </div>
    );
}
