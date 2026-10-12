"use client";

import { cn } from "@/lib/utils";
import { gameIconUrl, useGameIcons, type IconKind } from "@/lib/gameIcons";
import { itemGlyph } from "@/lib/itemGlyph";
import { getItem } from "@/engine/item-utils";

/** The game's icon when exported locally, else our own symbol for the kind of item */
export function ItemIcon({ item, kind = "items", size = 32, className }: { item: string; kind?: IconKind; size?: number; className?: string }) {
    const icons = useGameIcons();
    const known = kind === "items" ? getItem(item) : undefined;
    const url = gameIconUrl(icons, kind, known?.id ?? item);
    const glyph = itemGlyph(known, item);
    return (
        <span
            className={cn("inline-flex shrink-0 items-center justify-center overflow-hidden rounded-md border border-[var(--border-subtle)] bg-[var(--background-deep)]", className)}
            style={{ width: size, height: size, ...(url ? {} : { borderColor: `${glyph.color}55`, background: `${glyph.color}1a` }) }}
            aria-hidden
        >
            {url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={url} alt="" width={size} height={size} className="h-full w-full object-contain" loading="lazy" />
            ) : (
                <glyph.icon style={{ color: glyph.color, width: size * 0.6, height: size * 0.6 }} strokeWidth={1.75} />
            )}
        </span>
    );
}
