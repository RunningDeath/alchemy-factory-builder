import { Atom, BookOpen, Box, CookingPot, Factory, FlaskConical, Sparkles, type LucideIcon } from "lucide-react";

export interface NavLink {
    href: string;
    label: string;
    icon: LucideIcon;
    /** Paths that count as this section */
    match: (path: string) => boolean;
    /** Sub-pages (hover menu on desktop) */
    children?: SubLink[];
}

export interface SubLink {
    href: string;
    label: string;
    text: string;
    icon: LucideIcon;
}

export const CODEX_LINKS: SubLink[] = [
    { href: "/codex/items", label: "Items", text: "Prices, recipes that make and use them", icon: Box },
    { href: "/codex/devices", label: "Devices", text: "Size, ports, heat, cost, unlock level", icon: Factory },
    { href: "/codex/cauldron", label: "Cauldron", text: "Every mix, ranked by how well it builds", icon: CookingPot },
    { href: "/codex/advanced-cauldron", label: "Advanced Cauldron", text: "Two-input mixes, ranked the same way", icon: Sparkles },
    { href: "/codex/paradox-crucible", label: "Paradox Crucible", text: "Brew time and output for any input", icon: Atom },
];

export const NAV_LINKS: NavLink[] = [
    { href: "/", label: "Planner", icon: FlaskConical, match: (p) => p === "/" },
    { href: "/codex", label: "Codex", icon: BookOpen, match: (p) => p.startsWith("/codex"), children: CODEX_LINKS },
];
