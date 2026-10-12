import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { CODEX_LINKS } from "@/components/layout/nav";

export const metadata: Metadata = {
    title: "Codex",
    description: "Items, devices, cauldron mixes and the Paradox Crucible.",
};


export default function CodexPage() {
    return (
        <div className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-6">
            <h1 className="font-cinzel text-2xl font-bold text-[var(--accent-gold)] sm:text-3xl">Codex</h1>
            <ul className="flex flex-col gap-2">
                {CODEX_LINKS.map((s) => (
                    <li key={s.href}>
                        <Link href={s.href} className="flex min-h-16 items-center gap-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 hover:border-[var(--accent-gold-dim)]">
                            <s.icon className="h-6 w-6 shrink-0 text-[var(--accent-gold)]" />
                            <span className="min-w-0 flex-1">
                                <span className="block font-semibold text-[var(--text-primary)]">{s.label}</span>
                                <span className="block text-sm text-[var(--text-muted)]">{s.text}</span>
                            </span>
                            <ChevronRight className="h-5 w-5 text-[var(--text-muted)]" />
                        </Link>
                    </li>
                ))}
            </ul>
        </div>
    );
}
