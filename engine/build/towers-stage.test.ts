import { describe, expect, test } from "bun:test";
import type { Placement } from "./layout";
import { buildTowers, type TowerBlock } from "./towers";

/** A floor of wood blocks: anything can stand on it */
const floor = (w: number, d: number): Placement[] =>
    Array.from({ length: w * d }, (_, k): Placement => ({ uid: `f${k}`, id: "wood-block", x: k % w, y: Math.floor(k / w), z: 0, rot: 0 }));
const base = (stage: number): TowerBlock => ({ placements: floor(10, 10), width: 10, depth: 10, canGoUp: false, stage });
const upper = (stage: number): TowerBlock => ({ placements: floor(4, 4), width: 4, depth: 4, canGoUp: true, canCarry: false, stage });
const options = { maxHeight: 15, related: () => false, makeUid: (() => { let n = 0; return () => `t${n++}`; })() };

describe("block towers and production stages", () => {
    test("a block stacks on one a stage or two away, not on one from the far end of the chain", () => {
        expect(buildTowers([base(0), upper(2)], options)).toHaveLength(1);
        expect(buildTowers([base(0), upper(5)], options)).toHaveLength(2);
    });

    test("blocks that exchange items stack whatever their stages", () => {
        expect(buildTowers([base(0), upper(5)], { ...options, related: () => true })).toHaveLength(1);
    });
});
