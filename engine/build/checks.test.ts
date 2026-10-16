import { describe, expect, test } from "bun:test";
import { beltIssues, fluidIssues } from "./checks";
import type { Placement } from "./layout";
import type { IoPoint } from "./router";

const heater = (uid: string, x: number, extra: Partial<Placement> = {}): Placement => ({ uid, id: "steam-heater", x, y: 0, z: 0, rot: 0, ...extra });
const pipe = (x: number, y: number, z: number, pipeSides: Placement["pipeSides"]): Placement => ({ uid: `p${x},${y},${z}`, id: "pipe", x, y, z, rot: 0, pipeSides, label: "Steam" });

describe("steam reaching the heaters", () => {
    test("a heater without a pipe at its ports gets no steam", () => {
        expect(fluidIssues([heater("a", 0)]).map((i) => i.kind)).toEqual(["no-fluid"]);
    });

    test("a pipe rising to the top from a heater's port supplies it", () => {
        // Port on the left side of the heater's back row (x 0, y 2), the pipe in front of it rises
        const placements = [heater("a", 1), pipe(0, 2, 0, ["right", "top"]), pipe(0, 2, 1, ["base"]), { uid: "m", id: "wood-block", x: 5, y: 0, z: 1, rot: 0 } as Placement];
        expect(fluidIssues(placements)).toEqual([]);
    });

    test("a pipe passing by without a side toward the port doesn't count", () => {
        const placements = [heater("a", 1), pipe(0, 2, 0, ["up", "top"]), pipe(0, 2, 1, ["base"])];
        expect(fluidIssues(placements).map((i) => i.uid)).toEqual(["a"]);
    });

    test("heaters back to back share the steam; one apart they don't", () => {
        const fed = [pipe(0, 2, 0, ["right", "top"]), pipe(0, 2, 1, ["base"])];
        expect(fluidIssues([heater("a", 1), heater("b", 4), ...fed])).toEqual([]);
        expect(fluidIssues([heater("a", 1), heater("b", 5), ...fed]).map((i) => i.uid)).toEqual(["b"]);
    });
});

describe("what the belts carry", () => {
    test("an item a machine can't use is reported where it arrives", () => {
        // A processor set to steel gears gets iron ingots on its belt
        const io: IoPoint[] = [{ kind: "import", itemName: "Iron Ingot", cell: [-1, 0, 0], rate: 10 }];
        const placements: Placement[] = [
            { uid: "b", id: "belt-fixed", x: -1, y: 0, z: 0, rot: 0 },
            { uid: "m", id: "processor", x: 0, y: 0, z: 0, rot: 0, nodeKey: "steelgear-prod-steel-gear" },
        ];
        const kinds = beltIssues(placements, io).map((i) => i.kind);
        expect(kinds).toContain("foreign-items");
    });

    test("a nursery the plan feeds misses its fertilizer when none reaches it", () => {
        const nursery: Placement = { uid: "n", id: "nursery", x: 0, y: 0, z: 0, rot: 0, nodeKey: "sage-prod-sage", fertilizer: "Growth Potion" };
        expect(beltIssues([nursery], []).map((i) => i.kind)).toContain("missing-input");
        // Without fertilizer in the plan nothing is missing
        expect(beltIssues([{ ...nursery, fertilizer: undefined }], []).map((i) => i.kind)).not.toContain("missing-input");
    });
});
