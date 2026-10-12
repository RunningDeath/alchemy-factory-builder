"use client";

import { cn } from "@/lib/utils";
import { gameIconUrl, initials, useGameIcons, type IconKind } from "@/lib/gameIcons";
import { getItem } from "@/engine/item-utils";

/** The game's icon when exported locally, else a badge with the initials */
export function ItemIcon({ item, kind = "items", size = 32, className }: { item: string; kind?: IconKind; size?: number; className?: string }) {
    const icons = useGameIcons();
    const known = kind === "items" ? getItem(item) : undefined;
    const id = known?.id ?? item;
    const url = gameIconUrl(icons, kind, id);
    return (
        <span
            className={cn("inline-flex shrink-0 items-center justify-center overflow-hidden rounded-md border border-[var(--border-subtle)] bg-[var(--background-deep)]", className)}
            style={{ width: size, height: size }}
            aria-hidden
        >
            {url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={url} alt="" width={size} height={size} className="h-full w-full object-contain" loading="lazy" />
            ) : (
                <span className="font-semibold text-[var(--accent-gold)]" style={{ fontSize: Math.max(9, size * 0.32) }}>
                    {initials(known?.name ?? item)}
                </span>
            )}
        </span>
    );
}
