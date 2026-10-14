#!/usr/bin/env bun

/**
 * Module generator benchmark: a fixed corpus of plans, generated and measured, so a change
 * to the generator can be compared against the state before it.
 *
 *   bun run scripts/benchmark.ts corpus [--seed 1] [--count 60]
 *       Picks random target products (seeded: the same seed gives the same corpus) and a
 *       rate per product that needs a random number of machines, so later products in a
 *       chain get lower rates. Each product is built at a random level between the first
 *       that makes it and the last, with that level's buildings and its best fuel and
 *       fertilizer (highest heat and nutrient value the factory can make by then; raw
 *       materials are never fuel), with the cauldron off and (once unlocked) on. Products whose plan has the same structure as one already
 *       taken (same machines, connections and rates, other items) are skipped. A second,
 *       fixed group of dense cases (seed 2, 120–220 machines) stands in for high research.
 *       Writes bench/corpus.json; commit it, it is the reference.
 *   bun run scripts/benchmark.ts run [--out bench/results/<name>.json] [--jobs 8] [--only <item>]
 *       Generates a module for every corpus case (no research, fuel and fertilizer made in
 *       the factory) and records failed belts, layout issues, size, lifts, belts, routing
 *       effort and time. Generation is deterministic: the same code gives the same result.
 *   bun run scripts/benchmark.ts compare <before.json> <after.json>
 *       Cases that changed, and the totals.
 */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { dirname } from "node:path";
import itemsData from "../data/items.json";
import recipesData from "../data/recipes.json";
import unlocksData from "../data/building-unlocks.json";
import { analyzeBelts } from "../engine/belt-analysis";
import { DEFAULT_MODULE_OPTIONS, generateModule, moduleTooBig, unsortableSteps, type ModuleStep } from "../engine/build/generator";
import { validateLayout } from "../engine/build/layout";
import { stepsFromReport } from "../engine/build/module-steps";
import { MAX_LEVEL } from "../engine/build/unlocks";
import { calculatePlan } from "../engine/planner";
import type { PlannerConfig } from "../engine/types";

const CORPUS = "bench/corpus.json";
/** Machines a case asks for: from small lines to modules that take a while */
const MACHINES = { min: 8, max: 80 };
/**
 * Dense cases: many machines per product, as with high research (belts and machines get
 * faster by the same factor, so a high rate without research packs the same lines)
 */
const DENSE = { seed: 2, count: 15, machines: { min: 120, max: 220 } };

interface Case {
    item: string;
    rate: number;
    /** Player level: the buildings the generator may use, and the fuel and fertilizer */
    level: number;
    /** Cauldron mixes allowed (from its unlock level on; the advanced one from its own) */
    cauldron: boolean;
    /** Best fuel and fertilizer made at this level (item ids; "" for none), see suppliesAt */
    fuel: string;
    fertilizer: string;
}

const label = (c: Pick<Case, "item" | "rate" | "level" | "cauldron">) => `${c.item}@${c.rate} L${c.level}${c.cauldron ? " cauldron" : ""}`;
const unlockLevel = (id: string) => (unlocksData as Record<string, { level: number }>)[id]?.level ?? Infinity;
const CAULDRON_LEVEL = unlockLevel("cauldron");
const ADVANCED_CAULDRON_LEVEL = unlockLevel("advanced-cauldron");

interface Result extends Case {
    machines: number;
    steps: number;
    failed: number;
    /** Failed belts by reason (see RouteResult.reason) */
    failReasons?: Record<string, number>;
    issues: number;
    /** Layout issues by kind (collision, unsupported, unheated, ...) */
    issueKinds?: Record<string, number>;
    size: [number, number, number];
    area: number;
    /** Blocks standing on other blocks (towers): what the module stacks instead of spreading */
    stacked: number;
    lifts: number;
    belts: number;
    work: number;
    ms: number;
    /** Fingerprint of the layout: equal means the same buildings at the same places */
    hash: string;
    error?: string;
    /** The generator declined the plan (UnbuildableError): why */
    rejected?: string;
}

/** No research; fuel and fertilizer made in the factory */
const config = (c: Case): PlannerConfig => ({
    targets: [{ item: c.item, rate: c.rate }],
    availableResources: [],
    logisticsEfficiency: 0,
    throwingEfficiency: 0,
    factoryEfficiency: 0,
    alchemySkill: 0,
    fuelEfficiency: 0,
    fertilizerEfficiency: 0,
    salesAbility: 0,
    negotiationSkill: 0,
    customerMgmt: 0,
    relicKnowledge: 0,
    selectedFuel: c.fuel,
    selectedFertilizer: c.fertilizer,
    selfFuel: true,
    selfFertilizer: true,
    useCauldron: c.cauldron,
    useAdvancedCauldron: c.cauldron && c.level >= ADVANCED_CAULDRON_LEVEL,
    fertilizerReserve: 0.25,
    planParallelLines: true,
    machineRounding: "up",
});

function stepsFor(c: Case) {
    const cfg = config(c);
    const trees = calculatePlan(cfg);
    if (!trees.length) return null;
    const report = analyzeBelts(trees, cfg, { planParallelLines: true, machineRounding: "up" });
    return { report, steps: stepsFromReport(report, cfg.selectedFuel) };
}

/**
 * What the generator sees of a plan, without item names: machines, how steps feed each
 * other, the rates per machine (a nursery's fertilizer use), each step's share of the
 * machines, fluids and heating. Products with the same structure give the generator the
 * same problem, so the corpus keeps only one
 */
function structureOf(steps: ModuleStep[]): string {
    const ids = new Map<string, number>();
    const id = (item: string) => (ids.has(item) ? ids.get(item)! : (ids.set(item, ids.size), ids.size - 1));
    const flows = (fs: { itemName: string; perMachineRate: number }[]) => fs.map((f) => `${id(f.itemName)}@${f.perMachineRate.toPrecision(3)}`).join("+");
    const total = steps.reduce((sum, st) => sum + st.machines, 0);
    return steps
        .map((st) =>
            [
                st.deviceId,
                (st.machines / total).toFixed(2),
                st.heating ? `${st.heating.kind}@${st.heating.fuelRate.toPrecision(3)}` : "",
                flows(st.inputs),
                flows(st.outputs),
                flows(st.fluids?.inputs ?? []),
                flows(st.fluids?.outputs ?? []),
                st.starterBox ? "starter" : "",
            ].join("/"),
        )
        .join("|");
}

const machinesOf = (steps: { machines: number }[]) => steps.reduce((sum, st) => sum + Math.ceil(st.machines), 0);

/** Small seeded generator (mulberry32): the same seed gives the same corpus */
function random(seed: number) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** Two significant digits */
const roundRate = (r: number) => Number(r.toPrecision(2));

/** Level a plan needs: the highest unlock among its machines (null: it can't be made) */
function levelNeeded(c: Case): number | null {
    const planned = stepsFor(c);
    if (!planned?.steps.length) return null;
    return Math.max(1, ...planned.steps.map((st) => unlockLevel(st.deviceId)));
}

type Supplies = Pick<Case, "fuel" | "fertilizer">;

/**
 * Best fuel and fertilizer per level: the highest heat and nutrient value among those the
 * factory can make by then. Raw materials (bought or mined) are never fuel.
 */
function suppliesAt(): (level: number, cauldron: boolean) => Supplies {
    type Candidate = { id: string; heat: number; nutrients: number; level: number };
    const items = itemsData as { id: string; name: string; heat_value?: number; nutrient_value?: number; purchasable?: boolean }[];
    const table = new Map<boolean, Candidate[]>();
    for (const cauldron of [false, true]) {
        const candidates: Candidate[] = [];
        for (const i of items.filter((i) => (i.heat_value || i.nutrient_value) && !i.purchasable)) {
            // Its own heaters burn wooden boards (from bought wood): only the machines count here
            const level = levelNeeded({ item: i.name, rate: 1, level: MAX_LEVEL, cauldron, fuel: "woodboard", fertilizer: "" });
            if (level !== null) candidates.push({ id: i.id, heat: i.heat_value ?? 0, nutrients: i.nutrient_value ?? 0, level });
        }
        table.set(cauldron, candidates);
    }
    return (level, cauldron) => {
        const ready = table.get(cauldron && level >= CAULDRON_LEVEL)!.filter((c) => c.level <= level);
        const best = (value: (c: Candidate) => number) => ready.filter((c) => value(c) > 0).sort((a, b) => value(b) - value(a))[0]?.id ?? "";
        return { fuel: best((c) => c.heat), fertilizer: best((c) => c.nutrients) };
    };
}

function makeCorpus(seed: number, count: number, machines = MACHINES): Case[] {
    const rand = random(seed);
    const supplies = suppliesAt();
    for (let level = 1; level <= MAX_LEVEL; level++)
        console.log(`Level ${level}: ${JSON.stringify(supplies(level, false))}${level >= CAULDRON_LEVEL ? `, cauldron ${JSON.stringify(supplies(level, true))}` : ""}`);
    const made = new Set((recipesData as { outputs: { id: string }[] }[]).flatMap((r) => r.outputs.map((o) => o.id)));
    const items = (itemsData as { id: string; name: string }[]).filter((i) => made.has(i.id));
    // Shuffle (Fisher-Yates), then take products until there are enough that plan
    for (let i = items.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [items[i], items[j]] = [items[j], items[i]];
    }
    const cases: Case[] = [];
    const structures = new Map<string, string>();
    let products = 0;
    for (const item of items) {
        if (products >= count) break;
        const want = machines.min + Math.floor(rand() * (machines.max - machines.min + 1));
        // Where between the first level that makes it and the last the product is built
        const progress = rand();
        // One rate per product (from the first variant), so its variants compare
        let rate = 0;
        let taken = 0;
        for (const cauldron of [false, true]) {
            try {
                // The first level that makes the product with that level's own fuel and fertilizer
                let first = 0;
                for (let level = cauldron ? CAULDRON_LEVEL : 1; level <= MAX_LEVEL && !first; level++) {
                    const needed = levelNeeded({ item: item.name, rate: 1, level, cauldron, ...supplies(level, cauldron) });
                    if (needed !== null && needed <= level) first = level;
                }
                if (!first) continue;
                const level = first + Math.floor(progress * (MAX_LEVEL - first + 1));
                const base = { item: item.name, level, cauldron, ...supplies(level, cauldron) };
                // Machines per 1/min, then the rate that needs about `want` machines
                const unit = stepsFor({ ...base, rate: 1 });
                if (!unit?.steps.length) continue;
                // The level counts too: it decides which buildings the generator has
                const structure = `L${level}|${structureOf(unit.steps)}`;
                if (structures.has(structure)) {
                    console.log(`${label({ ...base, rate: 1 })}: same structure as ${structures.get(structure)}, skipped`);
                    continue;
                }
                const perUnit = unit.steps.reduce((sum, st) => sum + st.machines, 0);
                if (!(perUnit > 0)) continue;
                rate ||= roundRate(Math.max(0.1, want / perUnit));
                const planned = stepsFor({ ...base, rate });
                if (!planned?.steps.length || moduleTooBig(planned.steps)) continue;
                cases.push({ ...base, rate });
                structures.set(structure, label({ ...base, rate }));
                taken++;
            } catch {
                // Products the planner can't make (only bought, missing recipes) aren't cases
            }
        }
        if (taken) products++;
    }
    return cases;
}

function runCase(c: Case): Result {
    const planned = stepsFor(c)!;
    const reasons = unsortableSteps(planned.steps, { level: c.level });
    if (reasons.length) return { ...c, rejected: reasons.map((st) => st.itemName).join(", ") } as Result;
    const started = performance.now();
    const mod = generateModule(planned.steps, { ...DEFAULT_MODULE_OPTIONS, beltSpeed: planned.report.beltSpeed, finalProducts: [c.item], unlocks: { level: c.level } });
    const ms = Math.round(performance.now() - started);
    const issues = validateLayout(mod.placements);
    const shape = mod.placements.map((p) => [p.id, p.x, p.y, p.z, p.rot].join(",")).sort().join(";");
    return {
        ...c,
        machines: machinesOf(planned.steps),
        steps: planned.steps.length,
        failed: mod.routes.filter((r) => !r.ok).length,
        failReasons: mod.routes.filter((r) => !r.ok).reduce<Record<string, number>>((m, r) => ((m[r.reason ?? "?"] = (m[r.reason ?? "?"] ?? 0) + 1), m), {}),
        issues: issues.length,
        issueKinds: issues.reduce<Record<string, number>>((m, i) => ((m[i.kind] = (m[i.kind] ?? 0) + 1), m), {}),
        size: mod.size,
        area: mod.size[0] * mod.size[1],
        // Heated blocks stand on their heaters (z 1) but never on other blocks
        stacked: mod.tiers.filter((t) => t.z > 0 && !t.heating).length,
        lifts: mod.placements.filter((p) => p.id === "conveyer-lift-upwards" || p.id === "conveyer-lift-downwards").length,
        belts: mod.placements.filter((p) => p.uid.startsWith("rb-")).length,
        work: mod.work ?? 0,
        ms,
        hash: createHash("sha1").update(shape).digest("hex").slice(0, 10),
    };
}

/** Each case in its own process, several at once (results don't depend on timing) */
function runAll(cases: Case[], jobs: number): Promise<Result[]> {
    const results: Result[] = new Array(cases.length);
    let next = 0;
    let done = 0;
    const worker = async (): Promise<void> => {
        while (next < cases.length) {
            const k = next++;
            const c = cases[k];
            results[k] = await new Promise<Result>((resolve) => {
                const child = spawn(process.execPath, [import.meta.path, "case", JSON.stringify(c)], { stdio: ["ignore", "pipe", "pipe"] });
                let out = "";
                let err = "";
                child.stdout.on("data", (d) => (out += d));
                child.stderr.on("data", (d) => (err += d));
                child.on("close", () => {
                    const line = out.trim().split("\n").pop() ?? "";
                    try {
                        resolve(JSON.parse(line));
                    } catch {
                        resolve({ ...c, error: (err || out).trim().split("\n").slice(-3).join(" ") } as Result);
                    }
                });
            });
            done++;
            const r = results[k];
            console.log(`[${done}/${cases.length}] ${label(c)}: ${r.error ? `error ${r.error}` : r.rejected ? `rejected (${r.rejected})` : `${r.failed} failed, ${r.size.join("×")}, ${r.ms} ms`}`);
        }
    };
    return Promise.all(Array.from({ length: jobs }, worker)).then(() => results);
}

function compare(before: Result[], after: Result[]) {
    const key = label;
    const old = new Map(before.map((r) => [key(r), r]));
    const rows: string[] = [];
    let better = 0;
    let worse = 0;
    let same = 0;
    for (const r of after) {
        const b = old.get(key(r));
        if (!b || b.error || r.error) continue;
        if (b.rejected || r.rejected) {
            if (b.rejected !== r.rejected) rows.push(`${key(r).padEnd(44)} ${b.rejected ? `rejected (${b.rejected})` : "built"} → ${r.rejected ? `rejected (${r.rejected})` : "built"}`);
            continue;
        }
        if (b.hash === r.hash) {
            same++;
            continue;
        }
        // Failed belts and layout issues first, then floor, then lifts and belts
        const rank = (x: Result) => [x.failed + x.issues, x.area, x.lifts * 8 + x.belts];
        const [rb, ra] = [rank(b), rank(r)];
        const sign = rb.findIndex((v, i) => v !== ra[i]);
        if (sign >= 0 && ra[sign] < rb[sign]) better++;
        else if (sign >= 0) worse++;
        const d = (field: keyof Result) => (b[field] === r[field] ? `${r[field]}` : `${b[field]}→${r[field]}`);
        rows.push(`${key(r).padEnd(44)} failed ${d("failed").padEnd(7)} issues ${d("issues").padEnd(7)} area ${d("area").padEnd(11)} lifts ${d("lifts").padEnd(9)} belts ${d("belts").padEnd(11)} work ${d("work")}`);
    }
    const sum = (rs: Result[], f: (r: Result) => number) => rs.filter((r) => !r.error && !r.rejected).reduce((s, r) => s + f(r), 0);
    const total = (label: string, f: (r: Result) => number) => console.log(`${label.padEnd(16)} ${sum(before, f)} → ${sum(after, f)}`);
    rows.forEach((row) => console.log(row));
    console.log(`\n${after.length} cases: ${same} unchanged, ${better} better, ${worse} worse`);
    console.log(`${"Rejected".padEnd(16)} ${before.filter((r) => r.rejected).length} → ${after.filter((r) => r.rejected).length}`);
    total("Failed belts", (r) => r.failed);
    total("Layout issues", (r) => r.issues);
    total("Cases broken", (r) => (r.failed + r.issues > 0 ? 1 : 0));
    total("Area", (r) => r.area);
    total("Height", (r) => r.size[2]);
    total("Stacked blocks", (r) => r.stacked ?? 0);
    total("Lifts", (r) => r.lifts);
    total("Belt cells", (r) => r.belts);
    total("Routing work", (r) => r.work);
    total("Time (ms)", (r) => r.ms);
}

const args = process.argv.slice(2);
const flag = (name: string, fallback: string) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const command = args[0];

if (command === "case") {
    console.log(JSON.stringify(runCase(JSON.parse(args[1]))));
} else if (command === "corpus") {
    const cases = makeCorpus(Number(flag("seed", "1")), Number(flag("count", "60")));
    cases.push(...makeCorpus(DENSE.seed, DENSE.count, DENSE.machines));
    mkdirSync(dirname(CORPUS), { recursive: true });
    writeFileSync(CORPUS, JSON.stringify(cases, null, 2) + "\n");
    console.log(`${cases.length} cases: ${CORPUS}`);
} else if (command === "run") {
    const only = flag("only", "");
    const cases = (JSON.parse(readFileSync(CORPUS, "utf8")) as Case[]).filter((c) => !only || c.item === only);
    const out = flag("out", `bench/results/${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
    const results = await runAll(cases, Number(flag("jobs", String(Math.max(1, availableParallelism() - 2)))));
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify(results, null, 2) + "\n");
    const broken = results.filter((r) => r.error || (!r.rejected && r.failed + r.issues > 0)).length;
    const rejected = results.filter((r) => r.rejected).length;
    console.log(`\n${results.length} cases, ${broken} broken, ${rejected} rejected: ${out}`);
} else if (command === "compare" && args[1] && args[2]) {
    compare(JSON.parse(readFileSync(args[1], "utf8")), JSON.parse(readFileSync(args[2], "utf8")));
} else {
    console.error("Usage: bun run scripts/benchmark.ts corpus [--seed 1] [--count 60] | run [--out file] [--jobs n] [--only item] | compare <before.json> <after.json>");
    process.exit(1);
}
