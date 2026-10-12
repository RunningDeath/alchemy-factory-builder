"use client";

import { useState } from "react";
import { Copy, Pencil, Plus, Trash2 } from "lucide-react";
import { useActiveFactory, useFactoryStore } from "@/store/useFactoryStore";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";

/** Pick, add, rename, copy and delete factories */
export function FactoryBar() {
    const factories = useFactoryStore((s) => s.factories);
    const factory = useActiveFactory();
    const { setActiveFactory, addFactory, renameFactory, duplicateFactory, removeFactory } = useFactoryStore.getState();
    const [renaming, setRenaming] = useState(false);
    const [name, setName] = useState("");
    if (!factory) return null;

    return (
        <div className="flex items-center gap-2">
            <select
                value={factory.id}
                onChange={(e) => setActiveFactory(e.target.value)}
                className="h-10 min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 font-cinzel text-base font-bold text-[var(--accent-gold)] sm:flex-none sm:min-w-56"
                aria-label="Factory"
            >
                {factories.map((f) => (
                    <option key={f.id} value={f.id}>
                        {f.name}
                    </option>
                ))}
            </select>
            <Button size="icon" variant="ghost" onClick={() => addFactory()} aria-label="New factory" title="New factory">
                <Plus className="h-5 w-5" />
            </Button>
            <Button
                size="icon"
                variant="ghost"
                onClick={() => {
                    setName(factory.name);
                    setRenaming(true);
                }}
                aria-label="Rename factory"
                title="Rename"
            >
                <Pencil className="h-4 w-4" />
            </Button>
            <Button size="icon" variant="ghost" onClick={() => duplicateFactory(factory.id)} aria-label="Copy factory" title="Copy">
                <Copy className="h-4 w-4" />
            </Button>
            <Button
                size="icon"
                variant="danger"
                onClick={() => window.confirm(`Delete “${factory.name}”?`) && removeFactory(factory.id)}
                aria-label="Delete factory"
                title="Delete"
            >
                <Trash2 className="h-4 w-4" />
            </Button>
            <Sheet open={renaming} onClose={() => setRenaming(false)} title="Rename factory">
                <form
                    className="flex flex-col gap-3 p-4"
                    onSubmit={(e) => {
                        e.preventDefault();
                        if (name.trim()) renameFactory(factory.id, name.trim());
                        setRenaming(false);
                    }}
                >
                    <input
                        autoFocus
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="h-11 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-base text-[var(--text-primary)]"
                        aria-label="Name"
                    />
                    <Button type="submit" variant="primary">
                        Save
                    </Button>
                </form>
            </Sheet>
        </div>
    );
}
