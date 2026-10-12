"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { NAV_LINKS } from "./nav";
import { BuildBadge } from "./BuildBadge";
import { ThemeToggle } from "./ThemeToggle";

/** Header with the sections on desktop; a bottom tab bar on phones */
export function AppShell({ children }: { children: React.ReactNode }) {
    const path = usePathname();
    return (
        <>
            <header className="sticky top-0 z-30 border-b border-[var(--border)] bg-[var(--background)]/90 backdrop-blur pt-[env(safe-area-inset-top)]">
                <div className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-4">
                    <Link href="/" className="font-cinzel text-lg font-bold text-[var(--accent-gold)] whitespace-nowrap">
                        Alchemy Builder
                    </Link>
                    <nav className="hidden lg:flex items-center gap-1" aria-label="Sections">
                        {NAV_LINKS.map((l) => (
                            <div key={l.href} className="group relative">
                                <Link
                                    href={l.href}
                                    className={cn(
                                        "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                                        l.match(path) ? "bg-[var(--surface-elevated)] text-[var(--accent-gold)]" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
                                    )}
                                >
                                    <l.icon className="h-4 w-4" />
                                    {l.label}
                                    {l.children && <ChevronDown className="h-3.5 w-3.5 opacity-60 transition-transform group-hover:rotate-180" />}
                                </Link>
                                {l.children && (
                                    // Opens on hover and on keyboard focus; the top padding bridges the gap so it stays open
                                    <div className="invisible absolute left-0 top-full z-40 pt-2 opacity-0 transition-opacity group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
                                        <div className="w-80 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-2 shadow-2xl">
                                            {l.children.map((c) => (
                                                <Link
                                                    key={c.href}
                                                    href={c.href}
                                                    className={cn("flex items-start gap-3 rounded-lg p-2 hover:bg-[var(--surface-elevated)]", path.startsWith(c.href) && "bg-[var(--surface-elevated)]")}
                                                >
                                                    <c.icon className="mt-0.5 h-5 w-5 shrink-0 text-[var(--accent-gold)]" />
                                                    <span>
                                                        <span className="block text-sm font-semibold text-[var(--text-primary)]">{c.label}</span>
                                                        <span className="block text-xs text-[var(--text-muted)]">{c.text}</span>
                                                    </span>
                                                </Link>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                    </nav>
                    <div className="ml-auto flex items-center gap-3">
                        <BuildBadge />
                        <ThemeToggle />
                    </div>
                </div>
            </header>
            <main className="pb-nav">{children}</main>
            <nav
                className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--border)] bg-[var(--surface)]/95 backdrop-blur lg:hidden pb-[env(safe-area-inset-bottom)]"
                aria-label="Sections"
            >
                <div className="grid h-[var(--nav-height)] grid-cols-2">
                    {NAV_LINKS.map((l) => {
                        const active = l.match(path);
                        return (
                            <Link
                                key={l.href}
                                href={l.href}
                                aria-current={active ? "page" : undefined}
                                className={cn("flex flex-col items-center justify-center gap-1 text-[11px] font-medium", active ? "text-[var(--accent-gold)]" : "text-[var(--text-muted)]")}
                            >
                                <l.icon className="h-5 w-5" />
                                {l.label}
                            </Link>
                        );
                    })}
                </div>
            </nav>
        </>
    );
}
