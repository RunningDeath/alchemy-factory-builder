/**
 * Checks over the whole module, beyond single buildings (layout.ts): does every steam heater
 * and pipe-fed machine reach its fluid, and does every belt carry only what its machine takes?
 * A heater cut off by a belt or a lane carrying a second item (an athanor's failed iron next
 * to its steel) stops the line in game, so these count as broken, not as a warning.
 */
import { getFootprint, oppositeSide } from "./footprint";
import { cellKey, placementCells, placementPorts, portTarget, type Placement, type WorldPort } from "./layout";
import { simulateFlow, type RecipeOf, recipeFromNode } from "./simulate";
import type { IoPoint } from "./router";
import type { Side, VerticalFace } from "./types";

export type ModuleIssue =
    /** A steam heater or a machine taking a fluid whose pipe ports reach no supply */
    | { kind: "no-fluid"; uid: string; fluid?: string }
    /** Items reach a machine that it can't use: they sit in its input and block it */
    | { kind: "foreign-items"; uid: string; items: string[] }
    /** A machine gets none of one of its inputs */
    | { kind: "missing-input"; uid: string; items: string[] }
    /** A belt leaving the module carries more than the item it is meant for */
    | { kind: "mixed-export"; uid: string; items: string[]; itemName: string };

const STEAM_HEATER = "steam-heater";
const opposite = (side: Side | VerticalFace): Side | VerticalFace => (side === "top" ? "base" : side === "base" ? "top" : oppositeSide(side));

/**
 * Steam heaters and machines taking a fluid by pipe without a way to a supply. Pipes join
 * through the sides they are laid with; a machine joins a pipe only at its own pipe ports
 * (a steam heater has two, on opposite sides, turning with it), and heaters back to back
 * pass steam through their touching ports. A network is supplied by a machine making the
 * fluid or by the pipe that rises to the module's top, where the player connects it.
 */
export function fluidIssues(placements: Placement[]): ModuleIssue[] {
    const pipes = new Map<string, Placement>();
    for (const p of placements) if (p.id === "pipe") pipes.set(cellKey(p.x, p.y, p.z), p);
    const ports = new Map<string, WorldPort[]>();
    for (const p of placements) {
        if (p.id === "pipe") continue;
        const own = placementPorts(p).filter((q) => q.medium === "pipe");
        if (own.length) ports.set(p.uid, own);
    }
    if (!ports.size) return [];
    const top = Math.max(0, ...placements.flatMap((p) => placementCells(p).map((c) => c.z)));

    // Union-find over pipe cells ("c:x,y,z") and machines ("m:uid")
    const parent = new Map<string, string>();
    const find = (a: string): string => {
        let r = a;
        while (parent.has(r) && parent.get(r) !== r) r = parent.get(r)!;
        parent.set(a, r);
        return r;
    };
    const join = (a: string, b: string) => {
        const [ra, rb] = [find(a), find(b)];
        if (ra !== rb) parent.set(ra, rb);
    };
    const step = (x: number, y: number, z: number, side: Side | VerticalFace): [number, number, number] =>
        side === "top" ? [x, y, z + 1] : side === "base" ? [x, y, z - 1] : portTarget({ x, y, z, face: side, dir: "both", medium: "pipe" });
    for (const [key, p] of pipes) {
        find(`c:${key}`);
        for (const side of p.pipeSides ?? []) {
            const n = step(p.x, p.y, p.z, side);
            const other = pipes.get(cellKey(...n));
            if (other?.pipeSides?.includes(opposite(side))) join(`c:${key}`, `c:${cellKey(...n)}`);
        }
    }
    const portAt = new Map<string, { uid: string; face: Side | VerticalFace }[]>();
    for (const [uid, list] of ports) for (const q of list) portAt.set(cellKey(q.x, q.y, q.z), [...(portAt.get(cellKey(q.x, q.y, q.z)) ?? []), { uid, face: q.face }]);
    for (const [uid, list] of ports) {
        find(`m:${uid}`);
        for (const q of list) {
            const n = step(q.x, q.y, q.z, q.face);
            const pipe = pipes.get(cellKey(...n));
            if (pipe?.pipeSides?.includes(opposite(q.face))) join(`m:${uid}`, `c:${cellKey(...n)}`);
            // Back to back: the neighbour's port faces this one
            for (const o of portAt.get(cellKey(...n)) ?? []) if (o.uid !== uid && o.face === opposite(q.face)) join(`m:${uid}`, `m:${o.uid}`);
        }
    }

    const supplied = new Set<string>();
    for (const [key, p] of pipes) if (p.z >= top) supplied.add(find(`c:${key}`));
    const byUid = new Map(placements.map((p) => [p.uid, p]));
    for (const uid of ports.keys()) if (byUid.get(uid)!.pipeEnd?.kind === "out") supplied.add(find(`m:${uid}`));

    const issues: ModuleIssue[] = [];
    for (const uid of ports.keys()) {
        const p = byUid.get(uid)!;
        const needs = p.id === STEAM_HEATER || p.pipeEnd?.kind === "in";
        if (needs && !supplied.has(find(`m:${uid}`))) issues.push({ kind: "no-fluid", uid, fluid: p.pipeEnd?.items[0]?.itemName ?? (p.id === STEAM_HEATER ? "Steam" : undefined) });
    }
    return issues;
}

/**
 * What the belts deliver, from the build simulator: machines that get items they can't use
 * (blocked), machines missing an input, and edge exits carrying more than their item. Items
 * coming in at the module edge enter at their import cells.
 */
export function beltIssues(placements: Placement[], io: IoPoint[], recipeOf: RecipeOf = recipeFromNode): ModuleIssue[] {
    const inject = new Map<string, string[]>();
    for (const p of io.filter((x) => x.kind === "import")) inject.set(p.cell.join(","), [...(inject.get(p.cell.join(",")) ?? []), p.itemName]);
    const sim = simulateFlow(placements, recipeOf, inject);
    const issues: ModuleIssue[] = [];
    for (const m of sim.machines) {
        if (m.foreign.length) issues.push({ kind: "foreign-items", uid: m.uid, items: m.foreign });
        // Fertilizer counts only once one is chosen (the plan then names it)
        const missing = m.missing.filter((i) => i !== "(fertilizer)");
        if (missing.length) issues.push({ kind: "missing-input", uid: m.uid, items: missing });
    }
    const exports = new Map(io.filter((x) => x.kind === "export").map((x) => [x.cell.join(","), x.itemName]));
    const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
    for (const end of sim.openEnds) {
        const itemName = exports.get(end.at.join(","));
        if (!itemName) continue;
        const others = end.items.filter((i) => key(i) !== key(itemName));
        if (others.length) issues.push({ kind: "mixed-export", uid: end.uid, items: others, itemName });
    }
    return issues;
}

/** Every module-wide problem */
export function moduleIssues(placements: Placement[], io: IoPoint[]): ModuleIssue[] {
    return [...fluidIssues(placements), ...beltIssues(placements, io)];
}

/** Buildings these checks look at, to tell a machine from the belts around it */
export const isCheckedMachine = (p: Placement) => getFootprint(p.id)?.category === "production";
