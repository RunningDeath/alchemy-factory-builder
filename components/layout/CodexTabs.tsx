"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { CODEX_LINKS } from "./nav";

/** Codex sections as a tab row (scrolls sideways on phones, where there is no hover menu) */
export function CodexTabs() {
    const path = usePathname();
    if (path === "/codex") return null;
    return (
        <nav aria-label="Codex" className="border-b border-[var(--border)] lg:hidden">
            <div className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 py-2 custom-scrollbar">
                {CODEX_LINKS.map((c) => {
                    const active = path.startsWith(c.href);
                    return (
                        <Link
                            key={c.href}
                            href={c.href}
                            aria-current={active ? "page" : undefined}
                            className={cn(
                                "flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm",
                                active ? "border-[var(--accent-gold)] text-[var(--accent-gold)]" : "border-[var(--border)] text-[var(--text-secondary)]",
                            )}
                        >
                            <c.icon className="h-4 w-4" />
                            {c.label}
                        </Link>
                    );
                })}
            </div>
        </nav>
    );
}
