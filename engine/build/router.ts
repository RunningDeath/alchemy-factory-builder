/**
 * Belt router: connects the blocks of a generated module so the factory actually runs.
 *
 * 1. Lane ends: every generated lane has one open end, where items enter (input
 *    lanes) or leave (output lanes) its block. Each carries known items and rates.
 * 2. Flow assignment, per item: producer exits are matched to consumer entries
 *    (northwest-corner over nearby lanes), so no belt carries more than its exit or
 *    entry. Items nobody in the module makes are imported at the module edge; output
 *    nobody consumes (final products, surplus) is exported there.
 * 3. Routing, per connection: A* over the cell grid. A path can start from the exit
 *    or split off a belt that already carries only this item from that exit, and end
 *    at the entry or merge into a belt that already leads only to that entry. It runs
 *    on fixed belt pieces, turns, and uses conveyor lifts to change height, which is
 *    also how belts cross each other. Raised belts get lab stands or wood blocks.
 */
import { beltPieceFor } from "./belt-pieces";
import { oppositeSide, rotateSide, SIDES, SIDE_OFFSET, type Rotation } from "./footprint";
import { cellKey, cellsCollide, placementCells, placementPorts, portConnections, portTarget, type Placement } from "./layout";
import { addToOccupancy, supportColumn, supportCost, type Occupancy } from "./supports";
import type { Side } from "./types";

type Cell = [number, number, number];

export interface LaneEnd {
    uid: string;
    kind: "in" | "out";
    items: { itemName: string; rate: number }[];
    /** The cell just outside the lane, where a connecting belt goes */
    port: Cell;
    /** in: direction from the port cell into the lane; out: direction from the lane into the port cell */
    dir: Side;
    block?: number;
    /** A fail product its own block takes again (see Placement.laneEnd) */
    loop?: boolean;
}

export interface RouteResult {
    itemName: string;
    from: string;
    to: string;
    rate: number;
    ok: boolean;
    /** Why a connection failed: no usable start cell, no way through free cells, the search ran out of steps, or the path found couldn't be built */
    reason?: "no-start" | "no-way" | "search-limit" | "commit";
    /** A fail product back into its block without a priority merger (no room): new items can crowd it out and stop the machines */
    unprioritized?: boolean;
    /** Identifies the connection across routing passes */
    key?: string;
}

export interface IoPoint {
    /** altar / trash / sell: an unneeded item ends in a knowledge altar, trash barrel or dispatch portal there */
    kind: "import" | "export" | "altar" | "trash" | "sell";
    /** An export that should end in a sink (left over past its export cap) */
    dispose?: boolean;
    itemName: string;
    cell: Cell;
    rate: number;
}

export interface RoutingOutput {
    placements: Placement[];
    routes: RouteResult[];
    io: IoPoint[];
    /** Output nobody in the module uses that isn't sent out at the edge (the line just runs slower) */
    surplus: { itemName: string; rate: number }[];
}

export interface RouterOptions {
    beltSpeed: number;
    /** Free cells kept around the module for routing, imports and exports */
    margin: number;
    maxHeight: number;
    /** Labels for blocks, by block index */
    blockNames: string[];
    /** Drawbridge conveyors may cross gaps without supports (needs the unlock and linen rope) */
    bridges?: boolean;
    /** Items whose unused output leaves the module (the rest stays in the line); default: all */
    exportable?: (itemName: string) => boolean;
    /** Most of an item that leaves for other modules; the rest goes to a sink (byproducts shared with other modules) */
    exportCaps?: Map<string, number>;
    /** Items whose consumers import them although the module makes them (bought fertilizer/fuel that is also a target) */
    bought?: (itemName: string) => boolean;
    /** Items started from a starter box (self-made fertilizer, heated fuel): every consumer fed by the same producers */
    primed?: (itemName: string) => boolean;
    /** Items that may also leave through the module's sides (leftovers for a sink), not only front and back */
    sideExit?: (itemName: string) => boolean;
    /** Conveyor lifts may change levels (default: yes) */
    lifts?: boolean;
    /** Items that come in through one belt for the whole module (another import only when that belt is full) */
    singleImport?: (itemName: string) => boolean;
    /** Priority splitters put consumers before the export (default: yes) */
    prioritySplitters?: boolean;
    /** Share of the routing done (0–1), reported as connections are routed */
    onProgress?: (fraction: number) => void;
}

const PRIORITY_SPLITTER = "splitter-vert";
/** Priority mergers, flat ones first: output, then the priority input (gold in game), then the other */
const PRIORITY_MERGERS = ["merger", "merger-sym", "merger-vert"];
/** Routing passes per layout: failed connections first in each next one */
const ROUTE_PASSES = 6;
/** Highest level a connection that failed before may climb to, stacking over other belts */
const STACK_LEVELS = 6;
/** Passes in a row without fewer failed connections than the best before giving up early */
const STALE_PASSES = 2;
/** Most cells a later pass adds to a connection's distance to vary the order */
const ORDER_SHUFFLE = 20;
/** How far from its exit a priority splitter may stand when it doesn't fit right there */
const SPLITTER_LEAD = 3;

/** Drawbridge conveyor: anchor post (3 high, needs support) and a 3-cell deck that needs none */
const BRIDGE_ID = "draw-bridge";
const BRIDGE_DECK = 3;
const BRIDGE_POST = 3;
/** Extra cost of a bridge over plain belts: 6 wood boards and 6 linen rope */
const BRIDGE_COST = 3;

const LIFT = {
    upBottom: "conveyer-lift-upwards", // in: left
    upTop: "conveyer-lift-end-upwards", // out: down
    downTop: "conveyer-lift-end-downwards", // in: down
    downBottom: "conveyer-lift-downwards", // out: left
    body: "conveyer-lift-body",
};

const BELT_LAYERS = 3; // bottom + middle
const MAX_EXPANSIONS = 1_000_000;
/** Cells a connection's search avoids, one by one, when its path takes a cell twice */
const CROSSING_RETRIES = 3;

/**
 * Search steps done so far, over all routing: the generator's measure of effort. Unlike a
 * clock it is the same on every machine, so the same plan always gives the same module.
 */
let searchSteps = 0;
export const routingWork = () => searchSteps;
/** Search steps after which every search gives up at once (see withWorkLimit) */
let workLimit = Infinity;
/** Run `fn` with searches cut off once `limit` more steps are spent; the rest fails as search-limit */
export function withWorkLimit<T>(limit: number, fn: () => T): T {
    const outer = workLimit;
    workLimit = Math.min(outer, searchSteps + limit);
    try {
        return fn();
    } finally {
        workLimit = outer;
    }
}
/** A lift costs as much as 8 belt cells: fewer lifts, but no long detours around blocks either */
const LIFT_COST = 8;
/** Per support cell under a raised belt or lift: tall columns turn into walls, so stay low and lift late */
const SUPPORT_WEIGHT = 1.5;

/** Rotation that turns a piece's port on \`base\` to face \`want\` */
function rotFor(base: Side, want: Side): Rotation {
    return ((SIDES.indexOf(want) - SIDES.indexOf(base) + 4) % 4) as Rotation;
}

const add = (c: Cell, s: Side): Cell => [c[0] + SIDE_OFFSET[s][0], c[1] + SIDE_OFFSET[s][1], c[2]];
const keyOf = (c: Cell) => cellKey(c[0], c[1], c[2]);
const SIDE_INDEX = Object.fromEntries(SIDES.map((side, i) => [side, i])) as Record<Side, number>;

/** Open ends of generated lanes */
export function findLaneEnds(placements: Placement[]): LaneEnd[] {
    const ends: LaneEnd[] = [];
    const status = portConnections(placements);
    const byUid = new Map(placements.map((p) => [p.uid, p]));
    for (const s of status) {
        const p = byUid.get(s.port.uid);
        if (!p?.laneEnd || s.connectedTo || s.port.medium !== "belt") continue;
        if (s.port.face === "top" || s.port.face === "base") continue;
        if (p.laneEnd.kind === "in" && s.port.dir !== "in") continue;
        if (p.laneEnd.kind === "out" && s.port.dir !== "out") continue;
        const port = portTarget(s.port) as Cell;
        const dir = p.laneEnd.kind === "in" ? oppositeSide(s.port.face) : s.port.face;
        ends.push({ uid: p.uid, kind: p.laneEnd.kind, items: p.laneEnd.items, port, dir, block: p.block, ...(p.laneEnd.loop && { loop: true }) });
    }
    return ends;
}

interface Connection {
    itemName: string;
    rate: number;
    from: LaneEnd | "import";
    to: LaneEnd | "export";
    /** Export of what is left over past an export cap: ends in a sink next to the module */
    dispose?: boolean;
    /** Surplus belted to a consumer that won't take it all: doesn't count against the belt's room */
    surplus?: boolean;
    /** A fail product back into its own block (see LaneEnd.loop) */
    loop?: boolean;
    /** That loop shares its entry without a priority merger */
    unprioritized?: boolean;
}

/** Match producers to consumers per item; the rest is imported or exported */
/**
 * `exportable`: items whose unused output leaves at the module edge (final products and
 * the surplus the player chose). Without it, all unused output is exported.
 */
/**
 * `bought`: items the module's machines get from outside although the module makes them
 * too (a target that is also the bought fertilizer or fuel): consumers import, producers export.
 */
export function assignFlows(
    ends: LaneEnd[],
    exportable?: (itemName: string) => boolean,
    surplus?: { itemName: string; rate: number }[],
    bought?: (itemName: string) => boolean,
    caps?: Map<string, number>,
    primed?: (itemName: string) => boolean,
): Connection[] {
    const items = new Set(ends.flatMap((e) => e.items.map((i) => i.itemName)));
    const connections: Connection[] = [];
    const byPosition = (a: LaneEnd, b: LaneEnd) => a.port[0] + a.port[1] * 0.01 - (b.port[0] + b.port[1] * 0.01);

    for (const itemName of items) {
        const rateOf = (e: LaneEnd) => e.items.find((i) => i.itemName === itemName)?.rate ?? 0;
        const producers = ends.filter((e) => e.kind === "out" && rateOf(e) > 1e-6).sort(byPosition);
        const consumers = ends.filter((e) => e.kind === "in" && rateOf(e) > 1e-6).sort(byPosition);
        const supply = producers.map(rateOf);
        const demand = consumers.map(rateOf);
        if (bought?.(itemName)) {
            consumers.forEach((c, k) => connections.push({ itemName, rate: demand[k], from: "import", to: c }));
            producers.forEach((p, k) => connections.push({ itemName, rate: supply[k], from: p, to: "export" }));
            continue;
        }
        // Rounded-up consumers could take more than the module makes: share what is made
        const totalSupply = supply.reduce((a, b) => a + b, 0);
        const totalDemand = demand.reduce((a, b) => a + b, 0);
        if (producers.length > 0 && totalDemand > totalSupply) demand.forEach((d, k) => (demand[k] = (d * totalSupply) / totalDemand));

        // Made here, used here and sent out too (self-made fertilizer): the module is fed first
        // (a priority splitter, only leftovers leave). As few producers as cover it feed every
        // consumer, so their back flows reach all of them: one starter box upstream starts every
        // nursery. Producers each feeding other nurseries deadlock: the box reaches only some
        // plants, and the potion needs all of them before any producer runs
        // (whether the rest leaves the module or stays on a consumer's belt: the module comes first)
        // Only for what a starter box primes: everything else is matched in order (every
        // producer feeding every consumer is a belt for each pair)
        const shared = !!primed?.(itemName) && producers.length > 1 && consumers.length > 0 && totalSupply > totalDemand + 1e-6;
        if (shared) {
            let needed = 0;
            let covered = 0;
            while (needed < producers.length && covered < totalDemand - 1e-6) covered += supply[needed++];
            const feeding = supply.slice(0, needed).reduce((a, b) => a + b, 0);
            for (let k = 0; k < needed; k++) {
                const part = supply[k] / feeding;
                consumers.forEach((c, n) => {
                    const f = demand[n] * part;
                    if (f > 1e-6) connections.push({ itemName, rate: f, from: producers[k], to: c });
                    supply[k] -= f;
                });
            }
            demand.fill(0);
        }
        const quota = [...supply];
        let i = 0;
        let j = 0;
        while (i < producers.length && j < consumers.length) {
            const f = Math.min(quota[i], demand[j]);
            if (f > 1e-6) connections.push({ itemName, rate: f, from: producers[i], to: consumers[j] });
            quota[i] -= f;
            supply[i] -= f;
            demand[j] -= f;
            if (quota[i] <= 1e-6) i++;
            if (demand[j] <= 1e-6) j++;
        }
        // What the producers have left goes on below
        i = 0;
        for (; j < consumers.length; j++) if (demand[j] > 1e-6) connections.push({ itemName, rate: demand[j], from: "import", to: consumers[j] });
        // Capped items: up to the cap leaves for whoever needs it, the rest goes to a sink
        let cap = caps?.get(itemName) ?? Infinity;
        for (; i < producers.length; i++) {
            if (supply[i] <= 1e-6) continue;
            if (exportable && !exportable(itemName)) {
                // Surplus that stays: belt it to a consumer anyway (what it doesn't take backs
                // up there), so no lane end is left open
                if (consumers.length) connections.push({ itemName, rate: supply[i], from: producers[i], to: consumers[consumers.length - 1], surplus: true });
                surplus?.push({ itemName, rate: supply[i] });
                continue;
            }
            const sent = Math.min(supply[i], cap);
            cap -= sent;
            if (sent > 1e-6) connections.push({ itemName, rate: sent, from: producers[i], to: "export" });
            if (supply[i] - sent > 1e-6) connections.push({ itemName, rate: supply[i] - sent, from: producers[i], to: "export", dispose: true });
        }
    }
    return connections;
}

/** A belt or lift the router built, linked to its neighbours along the flow */
interface RouteNode {
    key: number;
    uid: string;
    cell: Cell;
    ins: Side[];
    outs: Side[];
    lift: boolean;
    prev: number[];
    next: number[];
    items: Set<string>;
    sources: Set<string>;
    sinks: Set<string>;
    tree?: string;
}

type Step =
    | { kind: "belt"; cell: Cell; inSide: Side; outSide: Side }
    | { kind: "lift"; entry: Cell; exitZ: number; inSide: Side; outSide: Side }
    | { kind: "bridge"; anchor: Cell; heading: Side };

/** Cells of a bridge whose anchor is at `anchor` and whose deck runs toward `heading` */
function bridgeCells(anchor: Cell, heading: Side): Cell[] {
    const cells: Cell[] = [anchor];
    for (let i = 1; i <= BRIDGE_DECK; i++) cells.push(add(cells[i - 1], heading));
    return cells;
}

interface SearchNode {
    cell: Cell;
    heading: Side;
    g: number;
    f: number;
    parent: SearchNode | null;
    step: Step;
}

/** Binary min-heap on f */
class Heap {
    private items: SearchNode[] = [];
    get size() {
        return this.items.length;
    }
    push(n: SearchNode) {
        const a = this.items;
        a.push(n);
        let i = a.length - 1;
        while (i > 0) {
            const p = (i - 1) >> 1;
            if (a[p].f <= a[i].f) break;
            [a[p], a[i]] = [a[i], a[p]];
            i = p;
        }
    }
    pop(): SearchNode {
        const a = this.items;
        const top = a[0];
        const last = a.pop()!;
        if (a.length > 0) {
            a[0] = last;
            let i = 0;
            for (;;) {
                const l = i * 2 + 1;
                const r = l + 1;
                let m = i;
                if (l < a.length && a[l].f < a[m].f) m = l;
                if (r < a.length && a[r].f < a[m].f) m = r;
                if (m === i) break;
                [a[m], a[i]] = [a[i], a[m]];
                i = m;
            }
        }
        return top;
    }
}

interface Start {
    cell: Cell;
    inSide: Side;
    /** Route node to split off, if any */
    branchFrom?: RouteNode;
    /** Module edge import */
    edge?: boolean;
    /** Added to the path cost when starting here */
    extra?: number;
}

/** Starting a second import of an item that could branch off the first costs this much more */
const EXTRA_IMPORT_COST = 40;
/** The same for a single-import item: practically never while the first belt has room */
const SINGLE_IMPORT_COST = 100_000;

type Goal =
    | { kind: "entry"; end: LaneEnd }
    | { kind: "merge"; node: RouteNode; side: Side }
    | { kind: "edge" };

/**
 * Routes every connection; when some fail, routes the whole module again with the
 * failed connections first (they usually lost out to earlier paths) and the rest in a
 * slightly shuffled order (which belt goes first decides much in a dense module), and
 * keeps the best.
 */
export function routeModule(placements: Placement[], options: RouterOptions): RoutingOutput {
    let best: RoutingOutput | null = null;
    let priority: string[] = [];
    const failed = (r: RoutingOutput) => r.routes.filter((x) => !x.ok);
    const passes = ROUTE_PASSES;
    let stale = 0;
    for (let pass = 0; pass < passes; pass++) {
        const report = options.onProgress;
        const result = routeOnce(placements, { ...options, onProgress: report && ((f) => report((pass + f) / passes)) }, priority, pass);
        if (!best || failed(result).length < failed(best).length) {
            best = result;
            stale = 0;
        } else stale++;
        if (failed(best).length === 0) break;
        // Passes that don't beat the best: the order shuffle isn't finding a way, stop trying
        if (stale >= STALE_PASSES) break;
        priority = [...new Set([...failed(result).map((r) => r.key!), ...priority])];
    }
    best!.placements = trimDeadEnds(best!.placements, best!.io);
    return best!;
}

/**
 * Routed belts whose output leads nowhere (not into a belt, machine or the module edge):
 * a dead-end piece goes, a split loses the side that leads nowhere. Repeats until none is left.
 */
export function trimDeadEnds(placements: Placement[], io: IoPoint[]): Placement[] {
    const edge = new Set(io.map((p) => keyOf(p.cell)));
    let current = placements;
    for (let round = 0; round < 50; round++) {
        const routed = new Map(current.filter((p) => p.lane === "route" && p.id.startsWith("belt")).map((p) => [p.uid, p]));
        const dead = new Map<string, Side[]>();
        for (const s of portConnections(current)) {
            const p = routed.get(s.port.uid);
            if (!p || s.connectedTo || s.port.dir !== "out" || edge.has(keyOf([s.port.x, s.port.y, s.port.z]))) continue;
            if (s.port.face === "top" || s.port.face === "base") continue;
            dead.set(p.uid, [...(dead.get(p.uid) ?? []), s.port.face]);
        }
        if (dead.size === 0) return current;
        current = current.flatMap((p) => {
            const gone = dead.get(p.uid);
            if (!gone) return [p];
            const ports = placementPorts(p);
            const ins = ports.filter((q) => q.dir === "in").map((q) => q.face as Side);
            const outs = ports.filter((q) => q.dir === "out").map((q) => q.face as Side).filter((f) => !gone.includes(f));
            if (outs.length === 0) return [];
            const piece = beltPieceFor(ins, outs);
            return piece ? [{ ...p, id: piece.id, rot: piece.rot }] : [p];
        });
    }
    return current;
}

function routeOnce(placements: Placement[], options: RouterOptions, priority: string[], pass = 0): RoutingOutput {
    const all = [...placements];
    const occupancy: Occupancy = new Map();
    all.forEach((p) => addToOccupancy(occupancy, p));
    const byUid = new Map(all.map((p) => [p.uid, p]));

    let uidCounter = 0;
    const makeUid = (prefix: string) => `r${prefix}-${++uidCounter}`;

    // Routing area: the module plus a margin
    // (a loop: big modules have too many cells for Math.min(...cells))
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of all) {
        for (const c of placementCells(p)) {
            if (c.x < minX) minX = c.x;
            if (c.x > maxX) maxX = c.x;
            if (c.y < minY) minY = c.y;
            if (c.y > maxY) maxY = c.y;
        }
    }
    minX -= options.margin;
    maxX += options.margin;
    minY -= options.margin;
    maxY += options.margin;
    const maxZ = Math.max(1, options.maxHeight - 1);
    // Middle of the module: routes are pulled slightly inward, along the other belts
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const inBounds = (c: Cell) => c[0] >= minX && c[0] <= maxX && c[1] >= minY && c[1] <= maxY && c[2] >= 0 && c[2] <= maxZ;
    // Modules stand side by side in a line: belts come in at the front and leave at the back
    const onEdge = (c: Cell) => c[2] === 0 && (c[1] === minY || c[1] === maxY);

    const nodes = new Map<number, RouteNode>();
    const reserved = new Set<number>(); // lift columns and lane-end port cells of other connections

    const ends = findLaneEnds(all);
    // Keep each open lane end and the cell straight in front of it free until it is connected
    const approach = (e: LaneEnd): Cell => add(e.port, e.kind === "in" ? oppositeSide(e.dir) : e.dir);
    const reserveEnd = (e: LaneEnd) => [keyOf(e.port), keyOf(approach(e))].forEach((k) => reserved.add(k));
    ends.forEach(reserveEnd);
    // Heights worth lifting to: the ground and every lane level
    const liftLevels = [...new Set([0, 1, ...ends.map((e) => e.port[2])])].filter((z) => z <= Math.max(1, options.maxHeight - 1)).sort((a, b) => a - b);

    const beltFree = (c: Cell) => {
        if (!inBounds(c) || nodes.has(keyOf(c)) || reserved.has(keyOf(c))) return false;
        return (occupancy.get(keyOf(c)) ?? []).every((o) => (o.layers & BELT_LAYERS) === 0);
    };
    const liftFree = (c: Cell) => inBounds(c) && !nodes.has(keyOf(c)) && !reserved.has(keyOf(c)) && (occupancy.get(keyOf(c)) ?? []).length === 0;

    // Per-search caches over the routing area: nothing a search looks at changes while it
    // runs, so each cell is checked once, by number instead of "x,y,z" key. Stamped, so a new
    // search starts empty without clearing
    const sizeX = maxX - minX + 1;
    const sizeY = maxY - minY + 1;
    const cellCount = sizeX * sizeY * (maxZ + 1);
    const cellIndex = (c: Cell) => (c[2] * sizeY + (c[1] - minY)) * sizeX + (c[0] - minX);
    let searchStamp = 0;
    const cache = () => ({ stamp: new Int32Array(cellCount), value: new Float64Array(cellCount) });
    const beltFreeCache = cache();
    const liftFreeCache = cache();
    const supportCache = cache();
    const besideCache = cache();
    const bestStamp = new Int32Array(cellCount * 4);
    const bestCost = new Float64Array(cellCount * 4);
    /** A cell's cached value, computed on first use in this search (cells inside the area only) */
    const cached = (store: ReturnType<typeof cache>, c: Cell, compute: () => number) => {
        const i = cellIndex(c);
        if (store.stamp[i] === searchStamp) return store.value[i];
        const v = compute();
        store.stamp[i] = searchStamp;
        store.value[i] = v;
        return v;
    };
    const beltFreeNow = (c: Cell) => inBounds(c) && cached(beltFreeCache, c, () => (beltFree(c) ? 1 : 0)) === 1;
    const liftFreeNow = (c: Cell) => inBounds(c) && cached(liftFreeCache, c, () => (liftFree(c) ? 1 : 0)) === 1;

    const endName = (e: LaneEnd | "import" | "export") =>
        e === "import" ? "module edge (import)" : e === "export" ? "module edge (export)" : options.blockNames[e.block ?? -1] ?? "block";

    /** Can this node take one more output (split) or input (merge) on the given side? */
    const canAdd = (n: RouteNode, side: Side, as: "in" | "out") => {
        if (n.lift || n.ins.includes(side) || n.outs.includes(side)) return false;
        const ins = as === "in" ? [...n.ins, side] : n.ins;
        const outs = as === "out" ? [...n.outs, side] : n.outs;
        return beltPieceFor(ins, outs) !== null;
    };

    /** `levels`: heights a lift may go to (the ground, the starts and the goals of this connection) */
    let lastFailure: RouteResult["reason"];
    function search(starts: Start[], goal: (cell: Cell, heading: Side) => Goal | null, estimate: (c: Cell) => number, levels: number[]): { end: SearchNode; goal: Goal } | null {
        const open = new Heap();
        searchStamp++;
        lastFailure = "no-start";
        const h = (c: Cell) => estimate(c) * 1.5;
        // Lowest cost found per cell and heading
        const bestOutside = new Map<string, number>();
        const bestOf = (c: Cell, heading: Side) => {
            if (!inBounds(c)) return bestOutside.get(keyOf(c) + ":" + heading) ?? Infinity;
            const i = cellIndex(c) * 4 + SIDE_INDEX[heading];
            return bestStamp[i] === searchStamp ? bestCost[i] : Infinity;
        };
        const setBest = (c: Cell, heading: Side, g: number) => {
            if (!inBounds(c)) {
                bestOutside.set(keyOf(c) + ":" + heading, g);
                return;
            }
            const i = cellIndex(c) * 4 + SIDE_INDEX[heading];
            bestStamp[i] = searchStamp;
            bestCost[i] = g;
        };
        const supportOutside = new Map<number, number | null>();
        const supports = (c: Cell): number | null => {
            if (!inBounds(c)) {
                const k = keyOf(c);
                if (!supportOutside.has(k)) supportOutside.set(k, supportCost(occupancy, c[0], c[1], c[2]));
                return supportOutside.get(k)!;
            }
            const v = cached(supportCache, c, () => supportCost(occupancy, c[0], c[1], c[2]) ?? NaN);
            return Number.isNaN(v) ? null : v;
        };
        const besideBeltAt = (c: Cell) =>
            SIDES.some((side) => {
                const n = add(c, side);
                const routed = nodes.get(keyOf(n));
                if (routed) return !routed.lift;
                return (occupancy.get(keyOf(n)) ?? []).some((o) => o.id.startsWith("belt"));
            });
        const beltCost = (c: Cell, turned: boolean) => {
            const s = supports(c);
            if (s === null) return null;
            // Running next to another belt (routed or a block lane) keeps belts bundled instead of spread out
            const besideBelt = inBounds(c) ? cached(besideCache, c, () => (besideBeltAt(c) ? 1 : 0)) === 1 : besideBeltAt(c);
            const outward = (Math.abs(c[0] - centerX) + Math.abs(c[1] - centerY)) * 0.03;
            return 1 + (turned ? 0.3 : 0) + s * SUPPORT_WEIGHT + c[2] * 0.3 - (besideBelt ? 0.35 : 0) + outward;
        };

        for (const s of starts) {
            if (!s.branchFrom && !beltFreeNow(s.cell)) continue;
            if (s.branchFrom && !beltFreeNow(s.cell)) continue;
            for (const heading of SIDES) {
                if (heading === s.inSide) continue;
                const base = beltCost(s.cell, heading !== oppositeSide(s.inSide));
                const cost = base === null ? null : base + (s.extra ?? 0);
                if (cost === null) continue;
                const node: SearchNode = { cell: s.cell, heading, g: cost, f: cost + h(s.cell), parent: null, step: { kind: "belt", cell: s.cell, inSide: s.inSide, outSide: heading } };
                (node as SearchNode & { start?: Start }).start = s;
                const g = goal(s.cell, heading);
                if (g) return { end: node, goal: g };
                open.push(node);
                lastFailure = "no-way";
            }
        }

        let expansions = 0;
        while (open.size > 0 && expansions++ < MAX_EXPANSIONS) {
            if (searchSteps >= workLimit) break;
            searchSteps++;
            const cur = open.pop();
            if (bestOf(cur.cell, cur.heading) <= cur.g - 1e-9) continue;
            setBest(cur.cell, cur.heading, cur.g);

            const n = add(cur.cell, cur.heading);
            const inSide = oppositeSide(cur.heading);

            // Belt into the next cell, going straight or turning
            if (beltFreeNow(n)) {
                for (const heading of [cur.heading, rotateSide(cur.heading, 1), rotateSide(cur.heading, 3)]) {
                    const cost = beltCost(n, heading !== cur.heading);
                    if (cost === null) continue;
                    const node: SearchNode = { cell: n, heading, g: cur.g + cost, f: 0, parent: cur, step: { kind: "belt", cell: n, inSide, outSide: heading } };
                    node.f = node.g + h(n);
                    const g = goal(n, heading);
                    if (g) return { end: node, goal: g };
                    if (bestOf(n, heading) > node.g) open.push(node);
                }
            }

            // Bridge: anchor in the next cell, deck straight ahead over whatever is below
            if (options.bridges && cur.step.kind === "belt" && beltFreeNow(n)) {
                const cells = bridgeCells(n, cur.heading);
                const postFree = Array.from({ length: BRIDGE_POST }, (_, i): Cell => [n[0], n[1], n[2] + i]).every(
                    (c) => inBounds(c) && !reserved.has(keyOf(c)) && !nodes.has(keyOf(c)) && (occupancy.get(keyOf(c)) ?? []).every((o) => (o.layers & 7) === 0),
                );
                const support = supports(n);
                // A bridge only pays where plain belts would need supports under them (up in the air)
                const saves = n[2] > 0 && cells.slice(1).some((c) => (supports(c) ?? 1) > 0);
                if (saves && postFree && support !== null && cells.slice(1).every((c) => beltFreeNow(c))) {
                    const last = cells[cells.length - 1];
                    const node: SearchNode = {
                        cell: last,
                        heading: cur.heading,
                        g: cur.g + cells.length + BRIDGE_COST + support * 0.8 + n[2] * 0.3,
                        f: 0,
                        parent: cur,
                        step: { kind: "bridge", anchor: n, heading: cur.heading },
                    };
                    node.f = node.g + h(last);
                    if (bestOf(last, cur.heading) > node.g) open.push(node);
                }
            }

            // Lift up or down from the next cell
            if (options.lifts !== false && liftFreeNow(n) && cur.step.kind === "belt") {
                for (const z2 of levels) {
                    if (z2 === n[2]) continue;
                    const lo = Math.min(z2, n[2]);
                    const hi = Math.max(z2, n[2]);
                    let free = true;
                    for (let z = lo; z <= hi && free; z++) free = liftFreeNow([n[0], n[1], z]);
                    if (!free) continue;
                    const support = supports([n[0], n[1], lo]);
                    if (support === null) continue;
                    const top: Cell = [n[0], n[1], z2];
                    for (const heading of SIDES) {
                        const cost = LIFT_COST + (hi - lo) * 1.5 + support * SUPPORT_WEIGHT;
                        const node: SearchNode = { cell: top, heading, g: cur.g + cost, f: 0, parent: cur, step: { kind: "lift", entry: n, exitZ: z2, inSide, outSide: heading } };
                        node.f = node.g + h(top);
                        if (bestOf(top, heading) > node.g) open.push(node);
                    }
                }
            }
        }
        if (expansions > MAX_EXPANSIONS || searchSteps >= workLimit) lastFailure = "search-limit";
        return null;
    }

    /**
     * The first cell a path takes twice (a lift shaft through its own belt), or null. The
     * search knows cells and headings, not the path behind them, so it can find such a path
     */
    function crossing(endNode: SearchNode): number | null {
        const used = new Set<number>();
        const steps: SearchNode[] = [];
        for (let n: SearchNode | null = endNode; n; n = n.parent) steps.unshift(n);
        for (const s of steps) {
            const st = s.step;
            const keys =
                st.kind === "belt"
                    ? [keyOf(st.cell)]
                    : st.kind === "bridge"
                      ? bridgeCells(st.anchor, st.heading).map(keyOf)
                      : Array.from({ length: Math.abs(st.exitZ - st.entry[2]) + 1 }, (_, i) => keyOf([st.entry[0], st.entry[1], Math.min(st.exitZ, st.entry[2]) + i]));
            for (const k of keys) {
                if (used.has(k)) return k;
                used.add(k);
            }
        }
        return null;
    }

    function commit(endNode: SearchNode, goal: Goal, conn: Connection, sourceId: string, sinkId: string, tree?: string) {
        const steps: SearchNode[] = [];
        for (let n: SearchNode | null = endNode; n; n = n.parent) steps.unshift(n);
        const start = (steps[0] as SearchNode & { start?: Start }).start!;
        // Paths that cross themselves can't be built
        if (crossing(endNode)) return false;

        const created: RouteNode[] = [];
        for (const s of steps) {
            const st = s.step;
            if (st.kind === "belt") {
                const piece = beltPieceFor([st.inSide], [st.outSide])!;
                const p: Placement = { uid: makeUid("b"), id: piece.id, x: st.cell[0], y: st.cell[1], z: st.cell[2], rot: piece.rot, label: conn.itemName, lane: "route" };
                all.push(p);
                byUid.set(p.uid, p);
                addToOccupancy(occupancy, p);
                all.push(...supportColumn(occupancy, st.cell[0], st.cell[1], st.cell[2], 0, () => makeUid("s")));
                const node: RouteNode = { key: keyOf(st.cell), uid: p.uid, cell: st.cell, ins: [st.inSide], outs: [st.outSide], lift: false, prev: [], next: [], items: new Set([conn.itemName]), sources: new Set([sourceId]), sinks: new Set([sinkId]), tree };
                nodes.set(node.key, node);
                created.push(node);
            } else if (st.kind === "bridge") {
                const cells = bridgeCells(st.anchor, st.heading);
                const xs = cells.map((c) => c[0]);
                const ys = cells.map((c) => c[1]);
                // Unrotated, the deck runs "up" (-y) from the anchor at its bottom end
                const p: Placement = { uid: makeUid("g"), id: BRIDGE_ID, x: Math.min(...xs), y: Math.min(...ys), z: st.anchor[2], rot: rotFor("up", st.heading), label: conn.itemName, lane: "route" };
                all.push(p);
                byUid.set(p.uid, p);
                addToOccupancy(occupancy, p);
                cells.forEach((c) => reserved.add(keyOf(c)));
                all.push(...supportColumn(occupancy, st.anchor[0], st.anchor[1], st.anchor[2], 0, () => makeUid("s")));
                const last = cells[cells.length - 1];
                // Not a place to split off or merge into
                const node: RouteNode = { key: keyOf(last), uid: p.uid, cell: last, ins: [oppositeSide(st.heading)], outs: [st.heading], lift: true, prev: [], next: [], items: new Set([conn.itemName]), sources: new Set([sourceId]), sinks: new Set([sinkId]), tree };
                nodes.set(node.key, node);
                created.push(node);
            } else {
                const up = st.exitZ > st.entry[2];
                const [x, y, z1] = st.entry;
                const lo = Math.min(z1, st.exitZ);
                const hi = Math.max(z1, st.exitZ);
                const liftCells: Placement[] = [];
                for (let z = lo; z <= hi; z++) {
                    const isEntry = z === z1;
                    const isExit = z === st.exitZ;
                    let id = LIFT.body;
                    let rot: Rotation = 0;
                    if (up && isEntry) [id, rot] = [LIFT.upBottom, rotFor("left", st.inSide)];
                    else if (up && isExit) [id, rot] = [LIFT.upTop, rotFor("down", st.outSide)];
                    else if (!up && isEntry) [id, rot] = [LIFT.downTop, rotFor("down", st.inSide)];
                    else if (!up && isExit) [id, rot] = [LIFT.downBottom, rotFor("left", st.outSide)];
                    liftCells.push({ uid: makeUid("l"), id, x, y, z, rot, label: conn.itemName, lane: "route" });
                }
                liftCells.forEach((p) => {
                    all.push(p);
                    byUid.set(p.uid, p);
                    addToOccupancy(occupancy, p);
                    reserved.add(cellKey(p.x, p.y, p.z));
                });
                all.push(...supportColumn(occupancy, x, y, lo, 0, () => makeUid("s")));
                const exitCell: Cell = [x, y, st.exitZ];
                const node: RouteNode = { key: keyOf(exitCell), uid: liftCells[liftCells.length - 1].uid, cell: exitCell, ins: [st.inSide], outs: [st.outSide], lift: true, prev: [], next: [], items: new Set([conn.itemName]), sources: new Set([sourceId]), sinks: new Set([sinkId]), tree };
                nodes.set(node.key, node);
                created.push(node);
            }
        }
        for (let i = 1; i < created.length; i++) {
            created[i - 1].next.push(created[i].key);
            created[i].prev.push(created[i - 1].key);
        }

        // Split off an existing belt: it gets an extra output, everything upstream now also feeds this sink
        if (start.branchFrom) {
            const b = start.branchFrom;
            b.outs.push(oppositeSide(start.inSide));
            refreshPiece(b);
            b.next.push(created[0].key);
            created[0].prev.push(b.key);
            walk(b, "prev", (n) => n.sinks.add(sinkId));
        }
        // Merge into an existing belt: it gets an extra input, everything downstream now also carries this item
        if (goal.kind === "merge") {
            const m = goal.node;
            m.ins.push(goal.side);
            refreshPiece(m);
            m.prev.push(created[created.length - 1].key);
            created[created.length - 1].next.push(m.key);
            walk(m, "next", (n) => {
                n.items.add(conn.itemName);
                n.sources.add(sourceId);
                const p = byUid.get(n.uid);
                if (p) p.label = [...n.items].join(" + ");
            });
        }
        return true;
    }

    function refreshPiece(n: RouteNode) {
        const piece = beltPieceFor(n.ins, n.outs);
        const p = byUid.get(n.uid);
        if (!piece || !p) return;
        p.id = piece.id;
        p.rot = piece.rot;
    }

    function walk(from: RouteNode, dir: "prev" | "next", visit: (n: RouteNode) => void) {
        const seen = new Set<number>();
        const stack = [from];
        while (stack.length) {
            const n = stack.pop()!;
            if (seen.has(n.key)) continue;
            seen.add(n.key);
            visit(n);
            for (const k of n[dir]) {
                const m = nodes.get(k);
                if (m) stack.push(m);
            }
        }
    }

    /**
     * A priority splitter at an exit: its first output feeds the module, the second the edge.
     * Right at the exit if it fits, else a few cells on, a straight belt leading to it
     */
    function prioritySplitter(exit: LaneEnd, itemName: string) {
        const dir = exit.dir;
        // Not in the way of other lane ends: the cells in front of them stay free for their belts
        const own = new Set([keyOf(exit.port), keyOf(approach(exit))]);
        const othersEnds = new Set(ends.filter((e) => e !== exit).flatMap((e) => [keyOf(e.port), keyOf(approach(e))]));
        const free = (c: Cell) => inBounds(c) && !nodes.has(keyOf(c)) && (own.has(keyOf(c)) || (!reserved.has(keyOf(c)) && !othersEnds.has(keyOf(c)))) && (occupancy.get(keyOf(c)) ?? []).every((o) => (o.layers & 7) === 0);
        for (let lead = 0; lead <= SPLITTER_LEAD; lead++) {
            const leadCells: Cell[] = [];
            let start = exit.port;
            for (let i = 0; i < lead; i++) {
                leadCells.push(start);
                start = add(start, dir);
            }
            const cells: Cell[] = [start, add(start, dir)].flatMap((c) => [c, [c[0], c[1], c[2] + 1] as Cell]);
            if (![...leadCells, ...cells].every(free)) continue;
            // Its two outputs need room for their belts (another splitter may already stand there)
            const out = add(add(start, dir), dir);
            if (![out, [out[0], out[1], out[2] + 1] as Cell].every(free)) continue;
            // Its bottom cells and the belt leading to it need supports down to the ground (not
            // onto a machine that can't carry them)
            if (![...leadCells, start, add(start, dir)].every((c) => supportCost(occupancy, c[0], c[1], c[2]) !== null)) continue;
            const xs = cells.map((c) => c[0]);
            const ys = cells.map((c) => c[1]);
            // Unrotated: in on the left, both outputs on the right (lower first, upper second)
            const placement: Placement = { uid: makeUid("p"), id: PRIORITY_SPLITTER, x: Math.min(...xs), y: Math.min(...ys), z: exit.port[2], rot: rotFor("right", dir), label: itemName, lane: "route" };
            const piece = beltPieceFor([oppositeSide(dir)], [dir])!;
            const belts: Placement[] = leadCells.map((c) => ({ uid: makeUid("b"), id: piece.id, x: c[0], y: c[1], z: c[2], rot: piece.rot, label: itemName, lane: "route" }));
            const end = (z: number, suffix: string): LaneEnd => ({ uid: `${placement.uid}:${suffix}`, kind: "out", items: exit.items, port: [out[0], out[1], z], dir, block: exit.block });
            return { placement, belts, cells: [...leadCells, ...cells], base: [...leadCells, start, add(start, dir)], first: end(exit.port[2], "first"), overflow: end(exit.port[2] + 1, "overflow") };
        }
        return null;
    }

    /**
     * A priority merger in front of an entry: its priority input (gold in game) takes the
     * loop, the other one everything else. The flat merger first, in both mirror forms (it
     * stays on the entry's level, clear of a second input lane above), then the tall one.
     * Right at the entry if it fits, else a few cells back, a straight belt leading on
     */
    function priorityMerger(entry: LaneEnd, itemName: string) {
        const dir = entry.dir;
        const back = oppositeSide(dir);
        const own = new Set([keyOf(entry.port), keyOf(approach(entry))]);
        const othersEnds = new Set(ends.filter((e) => e !== entry).flatMap((e) => [keyOf(e.port), keyOf(approach(e))]));
        const free = (c: Cell) => inBounds(c) && !nodes.has(keyOf(c)) && (own.has(keyOf(c)) || (!reserved.has(keyOf(c)) && !othersEnds.has(keyOf(c)))) && (occupancy.get(keyOf(c)) ?? []).every((o) => (o.layers & 7) === 0);
        const rot = rotFor("left", dir);
        for (let lead = 0; lead <= SPLITTER_LEAD; lead++) {
            const leadCells: Cell[] = [];
            let out = entry.port;
            for (let i = 0; i < lead; i++) {
                leadCells.push(out);
                out = add(out, back);
            }
            for (const id of PRIORITY_MERGERS) {
                // Placed so its output port's cell is `out`, facing the entry
                const trial: Placement = { uid: "trial", id, x: 0, y: 0, z: 0, rot };
                const [outPort, priorityPort, otherPort] = placementPorts(trial);
                const at: Placement = { ...trial, x: out[0] - outPort.x, y: out[1] - outPort.y, z: out[2] - outPort.z };
                const cells = placementCells(at).map((c): Cell => [c.x, c.y, c.z]);
                if (![...leadCells, ...cells].every(free)) continue;
                const ports = placementPorts(at);
                const inputs = [ports[1], ports[2]];
                void priorityPort;
                void otherPort;
                // Room for the two belts coming in
                const feeds = inputs.map((q) => portTarget(q) as Cell);
                if (!feeds.every(free)) continue;
                const base = [...leadCells, ...cells.filter((c) => c[2] === out[2])];
                if (!base.every((c) => supportCost(occupancy, c[0], c[1], c[2]) !== null)) continue;
                const placement: Placement = { ...at, uid: makeUid("pm"), label: itemName, lane: "route" };
                const piece = beltPieceFor([back], [dir])!;
                const belts: Placement[] = leadCells.map((c) => ({ uid: makeUid("b"), id: piece.id, x: c[0], y: c[1], z: c[2], rot: piece.rot, label: itemName, lane: "route" }));
                const endAt = (k: number, suffix: string, items: LaneEnd["items"]): LaneEnd => ({
                    uid: `${placement.uid}:${suffix}`,
                    kind: "in",
                    items,
                    port: feeds[k],
                    dir: oppositeSide(inputs[k].face as Side),
                    block: entry.block,
                });
                const loopItems = entry.items.filter((i) => i.itemName === itemName);
                return { placement, belts, cells: [...leadCells, ...cells], base, loop: endAt(0, "loop", loopItems), rest: endAt(1, "rest", entry.items) };
            }
        }
        return null;
    }

    const treeTotals = new Map<string, number>();
    const routes: RouteResult[] = [];
    const io: IoPoint[] = [];
    const exitUsed = new Set<string>();
    const entryFed = new Set<string>();

    const surplusList: { itemName: string; rate: number }[] = [];
    // Fail products their own block takes again: each loop exit feeds an entry of its block
    // with that item, which needs that much less from elsewhere
    const loops: Connection[] = [];
    const loopTaken = new Map<string, number>();
    for (const exit of ends.filter((e) => e.kind === "out" && e.loop)) {
        for (const item of exit.items) {
            const left = (e: LaneEnd) => (e.items.find((i) => i.itemName === item.itemName)?.rate ?? 0) - (loopTaken.get(e.uid) ?? 0);
            const entry = ends
                .filter((e) => e.kind === "in" && e.block === exit.block && e.items.some((i) => i.itemName === item.itemName))
                .sort((a, b) => left(b) - left(a))[0];
            if (!entry) continue;
            loops.push({ itemName: item.itemName, rate: item.rate, from: exit, to: entry, loop: true });
            loopTaken.set(entry.uid, (loopTaken.get(entry.uid) ?? 0) + item.rate);
        }
    }
    const looped = new Set(loops.map((c) => (c.from as LaneEnd).uid));
    const flowEnds = ends
        .filter((e) => !looped.has(e.uid))
        .map((e) => (loopTaken.has(e.uid) ? { ...e, items: e.items.map((i) => ({ ...i, rate: Math.max(0, i.rate - (loops.find((c) => c.to === e && c.itemName === i.itemName) ? loopTaken.get(e.uid)! : 0)) })) } : e));
    const original = new Map(flowEnds.map((e, k) => [e, ends.find((x) => x.uid === flowEnds[k].uid)!]));
    const connections = [
        ...loops,
        ...assignFlows(flowEnds, options.exportable, surplusList, options.bought, options.exportCaps, options.primed).map((c) => ({
            ...c,
            from: c.from === "import" ? c.from : original.get(c.from) ?? c.from,
            to: c.to === "export" ? c.to : original.get(c.to) ?? c.to,
        })),
    ];
    // The loop enters through a priority merger: what comes back goes in before anything new,
    // so the fail products never back up into their machines and stop them
    for (const entry of new Set(loops.map((c) => c.to as LaneEnd))) {
        const mine = loops.filter((c) => c.to === entry);
        const others = connections.filter((c) => c.to === entry && !mine.includes(c));
        if (!others.length) continue;
        const merger = priorityMerger(entry, mine[0].itemName);
        if (!merger) {
            mine.forEach((c) => (c.unprioritized = true));
            continue;
        }
        for (const p of [...merger.belts, merger.placement]) {
            all.push(p);
            byUid.set(p.uid, p);
            addToOccupancy(occupancy, p);
        }
        for (const c of merger.base) all.push(...supportColumn(occupancy, c[0], c[1], c[2], 0, () => makeUid("s")));
        merger.cells.forEach((c) => reserved.add(keyOf(c)));
        // Every loop of the entry joins on the priority input
        for (const c of mine) c.to = merger.loop;
        for (const c of others) c.to = merger.rest;
        reserveEnd(merger.loop);
        reserveEnd(merger.rest);
    }

    // An exit that feeds consumers and also exports its surplus gets a priority splitter:
    // consumers first, only the overflow leaves at the edge (a plain split would halve them)
    for (const exit of ends.filter((e) => e.kind === "out")) {
        const mine = connections.filter((c) => c.from === exit);
        // The overflow is what goes to a sink when there is such an export, else the export
        const overflow = mine.find((c) => c.to === "export" && c.dispose) ?? mine.find((c) => c.to === "export");
        if (!overflow || mine.length < 2 || options.prioritySplitters === false) continue;
        const splitter = prioritySplitter(exit, overflow.itemName);
        if (!splitter) continue;
        for (const p of [...splitter.belts, splitter.placement]) {
            all.push(p);
            byUid.set(p.uid, p);
            addToOccupancy(occupancy, p);
        }
        // The splitter's bottom cells and the belt leading to it stand on something
        for (const c of splitter.base) all.push(...supportColumn(occupancy, c[0], c[1], c[2], 0, () => makeUid("s")));
        splitter.cells.forEach((c) => reserved.add(keyOf(c)));
        for (const c of mine) c.from = c === overflow ? splitter.overflow : splitter.first;
        reserveEnd(splitter.first);
        reserveEnd(splitter.overflow);
    }
    const distance = (c: Connection) => {
        if (c.from === "import" || c.to === "export") return 1e6;
        return Math.abs(c.from.port[0] - c.to.port[0]) + Math.abs(c.from.port[1] - c.to.port[1]) + Math.abs(c.from.port[2] - c.to.port[2]);
    };
    const connKey = (c: Connection) =>
        `${c.itemName}|${c.from === "import" ? "import" : c.from.uid}|${c.to === "export" ? "export" : c.to.uid}`;
    // Failed connections of an earlier pass first, then short ones before long ones
    const rank = (c: Connection) => {
        const i = priority.indexOf(connKey(c));
        return i >= 0 ? i - priority.length : 0;
    };
    // Later passes: up to ORDER_SHUFFLE cells added to each distance, the same for the same pass
    const shuffle = (c: Connection) => {
        if (pass === 0) return 0;
        let h = pass;
        for (const ch of connKey(c)) h = Math.imul(h ^ ch.charCodeAt(0), 2654435761) >>> 0;
        return (h / 4294967296) * ORDER_SHUFFLE;
    };
    connections.sort((a, b) => rank(a) - rank(b) || distance(a) + shuffle(a) - distance(b) - shuffle(b));

    let allowNewExit = false;
    for (const [done, conn] of connections.entries()) {
        options.onProgress?.(done / connections.length);
        const sourceId = conn.from === "import" ? `import:${conn.itemName}` : conn.from.uid;
        const sinkId = conn.to === "export" ? `export:${conn.itemName}` : conn.to.uid;
        const starts: Start[] = [];
        let tree: string | undefined;

        if (conn.from === "import") {
            // Join an import of this item that still has room (one input per item for the whole
            // module); a new import at the edge only when that's far cheaper or there is none
            let joinable = false;
            for (const n of nodes.values()) {
                if (n.lift || n.items.size !== 1 || !n.items.has(conn.itemName) || !n.tree?.startsWith("import:")) continue;
                // Money always comes in on one line (the player feeds it); other items while it has room
                if (!options.singleImport?.(conn.itemName) && (treeTotals.get(n.tree) ?? 0) + conn.rate > options.beltSpeed + 1e-6) continue;
                joinable = true;
                for (const side of SIDES) if (canAdd(n, side, "out")) starts.push({ cell: add(n.cell, side), inSide: oppositeSide(side), branchFrom: n });
            }
            const extra = joinable ? (options.singleImport?.(conn.itemName) ? SINGLE_IMPORT_COST : EXTRA_IMPORT_COST) : 0;
            for (let x = minX; x <= maxX; x++) {
                // Raw materials come in at the front only; products leave at the back
                starts.push({ cell: [x, minY, 0], inSide: "up", edge: true, extra });
            }
        } else {
            const from = conn.from;
            if (!exitUsed.has(from.uid)) starts.push({ cell: from.port, inSide: oppositeSide(from.dir) });
            for (const n of nodes.values()) {
                if (n.lift || !n.sources.has(from.uid) || n.items.size !== 1 || !n.items.has(conn.itemName)) continue;
                for (const side of SIDES) if (canAdd(n, side, "out")) starts.push({ cell: add(n.cell, side), inSide: oppositeSide(side), branchFrom: n });
            }
        }

        // The lane ends of this connection are reserved for it; free them for this search
        const own = [conn.from, conn.to].filter((e): e is LaneEnd => e !== "import" && e !== "export");
        const ownPorts = own.flatMap((e) => [keyOf(e.port), keyOf(approach(e))]);
        ownPorts.forEach((k) => reserved.delete(k));

        let goal: (cell: Cell, heading: Side) => Goal | null;
        let estimate: (c: Cell) => number;
        if (conn.to === "export") {
            // Leftovers for a sink gather on their own belt, everything else on the export belt
            const treeName = `${conn.dispose ? "dispose" : "export"}:${conn.itemName}`;
            const exportTrees = [...nodes.values()].filter((n) => n.tree === treeName && !n.lift && n.items.size === 1);
            // Leftovers for a sink may leave through the sides too; everything else front or back
            const sides = conn.dispose || (options.sideExit?.(conn.itemName) ?? false);
            estimate = (c) => (conn.dispose ? Math.min(c[0] - minX, maxX - c[0]) : sides ? Math.min(c[0] - minX, maxX - c[0], maxY - c[1]) : maxY - c[1]) + c[2];
            // One belt out per item: join the item's export belt while it has room, a new exit only otherwise
            const joinable = exportTrees.some((n) => (treeTotals.get(n.tree!) ?? 0) + conn.rate <= options.beltSpeed + 1e-6);
            goal = (cell, heading) => {
                const nextCell = add(cell, heading);
                if (joinable && !allowNewExit) {
                    const m = nodes.get(keyOf(nextCell));
                    if (m && exportTrees.includes(m) && (treeTotals.get(m.tree!) ?? 0) + conn.rate <= options.beltSpeed + 1e-6 && canAdd(m, oppositeSide(heading), "in")) {
                        return { kind: "merge", node: m, side: oppositeSide(heading) };
                    }
                    return null;
                }
                // Leftovers for a sink leave through a side: the back is where the next module's belts are
                if (!conn.dispose && onEdge(cell) && nextCell[1] > maxY) return { kind: "edge" };
                if (sides && cell[2] === 0 && (nextCell[0] < minX || nextCell[0] > maxX) && (cell[0] === minX || cell[0] === maxX)) return { kind: "edge" };
                const m = nodes.get(keyOf(nextCell));
                if (m && exportTrees.includes(m) && (treeTotals.get(m.tree!) ?? 0) + conn.rate <= options.beltSpeed + 1e-6 && canAdd(m, oppositeSide(heading), "in")) {
                    return { kind: "merge", node: m, side: oppositeSide(heading) };
                }
                return null;
            };
            tree = treeName;
        } else {
            const to = conn.to;
            estimate = (c) => Math.abs(to.port[0] - c[0]) + Math.abs(to.port[1] - c[1]) + Math.abs(to.port[2] - c[2]);
            goal = (cell, heading) => {
                if (!entryFed.has(to.uid) && cell[0] === to.port[0] && cell[1] === to.port[1] && cell[2] === to.port[2] && heading === to.dir) {
                    return { kind: "entry", end: to };
                }
                const m = nodes.get(keyOf(add(cell, heading)));
                if (m && !m.lift && m.sinks.size === 1 && m.sinks.has(to.uid) && canAdd(m, oppositeSide(heading), "in")) {
                    return { kind: "merge", node: m, side: oppositeSide(heading) };
                }
                return null;
            };
            if (conn.from === "import") tree = `import:${conn.itemName}:${io.length}`;
        }

        // Lifts only go where this connection starts or ends: fewer branches in tall modules
        const goalZs = conn.to === "export"
            ? [...nodes.values()].filter((n) => n.tree === `export:${conn.itemName}`).map((n) => n.cell[2])
            : [conn.to.port[2], ...[...nodes.values()].filter((n) => conn.to !== "export" && n.sinks.has(conn.to.uid)).map((n) => n.cell[2])];
        // A connection that failed in an earlier pass may also climb over the other belts:
        // corridor belts stacked on lifts and lab stands instead of a wider corridor
        const retried = pass > 0 && priority.includes(connKey(conn));
        const stack = retried ? Array.from({ length: Math.min(STACK_LEVELS, maxZ) + 1 }, (_, z) => z) : [];
        const levels = [...new Set([0, 1, ...starts.map((st) => st.cell[2]), ...goalZs, ...stack])].filter((z) => liftLevels.includes(z) || z <= 1 || stack.includes(z)).sort((a, b) => a - b);
        const single = conn.from === "import" && (options.singleImport?.(conn.itemName) ?? false);
        // A single input (coins): branch off the one belt first, a new input only if that fails
        let found = search(single ? starts.filter((st) => !st.edge || !st.extra) : starts, goal, estimate, levels);
        if (!found && single) found = search(starts.map((st) => (st.edge ? { ...st, extra: 0 } : st)), goal, estimate, levels);
        // Couldn't reach the item's export belt: a second exit after all
        if (!found && conn.to === "export" && !allowNewExit) {
            allowNewExit = true;
            found = search(starts, goal, estimate, levels);
        }
        // A path through itself: search again without the cell it takes twice
        const avoided: number[] = [];
        for (let k = found ? crossing(found.end) : null; found && k && avoided.length < CROSSING_RETRIES; k = found ? crossing(found.end) : null) {
            avoided.push(k);
            reserved.add(k);
            found = search(starts, goal, estimate, levels);
        }
        avoided.forEach((k) => reserved.delete(k));
        allowNewExit = false;
        let ok = false;
        if (found) {
            const startNode = (() => {
                let n: SearchNode = found.end;
                while (n.parent) n = n.parent;
                return n as SearchNode & { start?: Start };
            })();
            // Branching from an existing import keeps that import's tree
            if (startNode.start?.branchFrom?.tree) tree = startNode.start.branchFrom.tree;
            if (found.goal.kind === "merge" && found.goal.node.tree) tree = found.goal.node.tree;
            ok = commit(found.end, found.goal, conn, sourceId, sinkId, tree);
            if (ok) {
                if (conn.from !== "import" && !startNode.start?.branchFrom) exitUsed.add(conn.from.uid);
                if (found.goal.kind === "entry") entryFed.add(found.goal.end.uid);
                if (tree) treeTotals.set(tree, (treeTotals.get(tree) ?? 0) + conn.rate);
                if (startNode.start?.edge) io.push({ kind: "import", itemName: conn.itemName, cell: startNode.cell, rate: conn.rate });
                if (found.goal.kind === "edge") io.push({ kind: "export", itemName: conn.itemName, cell: found.end.cell, rate: conn.rate, ...(conn.dispose && { dispose: true }) });
                else if (found.goal.kind === "merge" && conn.to === "export") {
                    const point = io.find((p) => p.kind === "export" && p.itemName === conn.itemName);
                    if (point) point.rate += conn.rate;
                }
                if (startNode.start?.branchFrom && conn.from === "import") {
                    const point = io.find((p) => p.kind === "import" && p.itemName === conn.itemName);
                    if (point) point.rate += conn.rate;
                }
            }
        }
        // Keep still-unconnected lane ends reserved so later paths don't block them
        for (const e of own) {
            const connected = e.kind === "in" ? entryFed.has(e.uid) : exitUsed.has(e.uid);
            if (!connected) reserveEnd(e);
        }
        // Surplus that finds no way to a consumer just stays where it is (it was optional)
        if (ok || !conn.surplus) routes.push({ itemName: conn.itemName, from: endName(conn.from), to: endName(conn.to), rate: conn.rate, ok, key: connKey(conn), ...(!ok && { reason: found ? "commit" : lastFailure }), ...(conn.unprioritized && { unprioritized: true }) });
    }

    // Merge surplus per item
    const surplus = [...surplusList.reduce((m, x) => m.set(x.itemName, (m.get(x.itemName) ?? 0) + x.rate), new Map<string, number>())].map(([itemName, rate]) => ({ itemName, rate }));
    return { placements: all, routes, io, surplus };
}

/** For tests and checks: does any router belt overlap something it shouldn't? */
export function routeCollisions(placements: Placement[]): number {
    const occupancy: Occupancy = new Map();
    let collisions = 0;
    for (const p of placements) {
        for (const c of placementCells(p)) {
            for (const o of occupancy.get(cellKey(c.x, c.y, c.z)) ?? []) if (cellsCollide(c, o)) collisions++;
        }
        addToOccupancy(occupancy, p);
    }
    return collisions;
}
