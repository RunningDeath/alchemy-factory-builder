/**
 * Our own icon for an item when the game's icons aren't there (they are game assets and
 * never published): a symbol for what kind of thing it is, in that kind's colour.
 */
import {
    BrickWall,
    Cloud,
    Cog,
    Coins,
    Crown,
    Droplet,
    Flame,
    FlaskRound,
    Gem,
    Hexagon,
    Layers,
    Leaf,
    Mountain,
    Orbit,
    Package,
    Pickaxe,
    Shirt,
    Sparkles,
    Sprout,
    Star,
    TreePine,
    Wheat,
    type LucideIcon,
} from "lucide-react";
import type { Item } from "@/engine/types";

export interface ItemGlyph {
    icon: LucideIcon;
    color: string;
}

const COLORS = {
    plant: "#6fcf73",
    seed: "#a3d977",
    fuel: "#f08a3c",
    fluid: "#5fb0f0",
    potion: "#d77be0",
    magic: "#a78bfa",
    powder: "#d8c38a",
    stone: "#a8a29e",
    metal: "#c9cdd6",
    gem: "#4fd1c5",
    gold: "#e3b45a",
    wood: "#b08150",
    cloth: "#e8dcc4",
    clay: "#d08a5c",
    other: "#9a90b0",
};

/** Whole words only: "ring" must not match "bearing" or "whispering" */
const has = (name: string, words: string[]) => {
    const padded = ` ${name.replace(/[^a-z']+/g, " ")} `;
    return words.some((w) => padded.includes(` ${w} `) || padded.includes(` ${w}s `));
};

/** Rules in order: the first that fits decides */
export function itemGlyph(item: Item | undefined, fallbackName = ""): ItemGlyph {
    const name = (item?.name ?? fallbackName).toLowerCase();
    const cats = item ? [item.category].flat().map((c) => c.toLowerCase()) : [];
    const is = (c: string) => cats.includes(c);

    if (name.endsWith(" seeds") || name.endsWith(" seed")) return { icon: Sprout, color: COLORS.seed };
    if (name === "steam") return { icon: Cloud, color: COLORS.fluid };
    if (name === "black powder") return { icon: Flame, color: COLORS.fuel };
    if (has(name, ["catalyst", "sigil", "essence", "spores", "core", "philosopher's stone"])) return { icon: Sparkles, color: COLORS.magic };
    if (has(name, ["jupiter", "luna", "mars", "mercury", "saturn", "venus", "sol"])) return { icon: Orbit, color: COLORS.magic };
    if (has(name, ["coin", "money"])) return { icon: Coins, color: COLORS.gold };
    if (has(name, ["amulet", "crown", "ring", "necklace", "relic"])) return { icon: Crown, color: COLORS.gold };
    if (has(name, ["amethyst", "emerald", "topaz", "lapis", "malachite", "crystal", "ruby", "sapphire", "diamond", "quartz", "turquoise", "adamant", "shard"])) return { icon: Gem, color: COLORS.gem };
    if (is("liquid") || is("oil") || is("essence")) return { icon: Droplet, color: COLORS.fluid };
    if (has(name, ["gear", "pulley", "bearing", "rivet", "nail", "clockwork", "wagon", "spring", "cashier", "watch"])) return { icon: Cog, color: COLORS.metal };
    if (has(name, ["plank", "log", "wood"])) return { icon: TreePine, color: COLORS.wood };
    if (is("powder") || has(name, ["powder", "dust", "sand", "fiber", "ash", "quicklime"])) return { icon: Hexagon, color: COLORS.powder };
    if (is("potions") || has(name, ["potion", "soap", "salve"])) return { icon: FlaskRound, color: COLORS.potion };
    if (is("fertilizer")) return { icon: Wheat, color: COLORS.plant };
    if (is("herbs")) return { icon: Leaf, color: COLORS.plant };
    if (is("fuel")) return { icon: Flame, color: COLORS.fuel };
    if (has(name, ["ore"])) return { icon: Pickaxe, color: COLORS.stone };
    if (has(name, ["stone", "limestone", "salt", "gravel", "rock", "granite", "marble", "obsidian", "sulfur", "meteorite"])) return { icon: Mountain, color: COLORS.stone };
    if (has(name, ["ingot", "plate", "bar"])) return { icon: Layers, color: COLORS.metal };
    if (has(name, ["brick", "ceramics", "clay", "glass", "pottery", "mortar"])) return { icon: BrickWall, color: COLORS.clay };
    if (has(name, ["bandage", "linen", "thread", "cloth", "rope"])) return { icon: Shirt, color: COLORS.cloth };
    if (has(name, ["aloe", "fungus", "leaf", "flower", "berry", "paste", "nectar"])) return { icon: Leaf, color: COLORS.plant };
    if (is("raw materials")) return { icon: Mountain, color: COLORS.stone };
    if (is("magic") || has(name, ["fairy", "star"])) return { icon: Star, color: COLORS.magic };
    return { icon: Package, color: COLORS.other };
}
