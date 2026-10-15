# How the planner and the module generator work

State of `main` on 2026-10-15, including the changes from other contributors (TelosNox, PRs #1–#4). For the game rules these algorithms rely on, see `docs/game-rules.md`.

```
targets, research, settings
        │
        ▼
1. Planner (engine/planner)          linear program → production nodes
        │
        ▼
2. Belt analysis (engine/belt-analysis.ts)   whole machines, belts, real flow
        │
        ▼
3. Module steps (engine/build/module-steps.ts)   one step per machine type
        │
        ▼
4. Blocks (generator.ts: buildBlocks / buildTier / buildCauldronTier)
        │
        ▼
5. Towers (towers.ts)                small blocks stacked onto others
        │
        ▼
6. Floor layout (generator.ts: layOut, packing.ts)   several layout modes × corridor widths
        │
        ▼
7. Routing (router.ts)               belts, lifts, splitters between blocks and the edges
        │
        ▼
8. Finish (routeAndFinish)           pairs back, sinks, starter boxes, compaction, pipes, supports
        │
        ▼
9. Blueprint (engine/build/blueprint)   game file
```

---

## 1. Planner: `calculatePlan(config)`

- **`context.ts`:** research becomes multipliers (speed, belt, alchemy, fuel, fertilizer), plus settings such as the selected fuel and fertilizer, self-made or bought, reserve, cauldron and recipe locks.
- **`recipes.ts`: the candidate recipes.**
  - With the cauldron on, a material the cauldron makes in fewer steps loses its usual recipes and gets all cauldron mixes instead.
  - A recipe the player locked drops that item's other recipes.
  - `recipeFlows` computes what one craft moves: outputs (Alchemy bonus included) and inputs (seeds excluded).
  - Nurseries add fertilizer, with the reserve in the model only. Heated machines add fuel for the machine and its share of the heater.
  - Outside fuel and fertilizer get their own item key (`item#external`), so the factory never makes them for that use.
- **`model.ts`: the linear program, solved with yalps.**
  - Variables: crafts per recipe, `buy` per raw item, `supply` per supplied item (capped, free).
  - One row per item: made + bought + supplied − used ≥ target (0 for everything else).
  - Objective: raw cost + machine-minutes × machine weight × build weight (heated +1, cauldron slots without plants +4, shared slots +4).
- **`index.ts`: second pass.** If several cauldron mixes make one material, the most used mix is kept and the program solved again.
- **`graph.ts`: production nodes.**
  - One node per recipe in use and per raw item.
  - Every consumer links to the shared node of each source, in proportion to what each source puts out. Its share goes in `inputRates`.
  - Target nodes carry `netOutputRate` (output minus the factory's own use).
- **`plan-graph.ts`:** flattens the nodes into nodes and edges, visiting each node object once, so fertilizer loops terminate.

## 2. Belt analysis: `analyzeBelts`

- **Whole machines:** each node is rounded (up, down or exact, per factory or per node).
- **Belt checks:** belt lines per flow, per-machine input and output rates against the belt speed, and parallel lines where one belt isn't enough.
- **Flow simulation** (`engine/flow.ts`):
  - What the built machines really make, pushed downstream.
  - Then backpressure: what consumers really draw.
  - This gives the realized rate, input-limited nodes, spare capacity (`leftoverRate`) and what each target receives.

## 3. Module steps: `stepsFromReport`

- One `ModuleStep` per machine type in production order, with:
  - machines and per-machine input and output rates;
  - fluid inputs and outputs;
  - heating: kind (steam or stove), fuel item and rate. A minimum of 0.01/min keeps a fuel belt for very strong fuels (PR #4).
- **Fuel:** the plan's selected fuel. When that fuel is also an ingredient (coal for coke), the fuel share is what the edge carries beyond the recipe.

## 4. Blocks: `buildBlocks`

1. **Heating:** `withUnlockedHeating` swaps steam for stoves if steam pads aren't unlocked.
2. **Purchasing portals** for purchasable raw materials, if "buy raw materials" is on.
3. **Starter box mark** on the step that makes the nurseries' self-made fertilizer.
4. **Machine pairs** (`pairs.ts`): a machine whose whole output goes into one machine of the next step becomes one made-up building (nursery + grinder at its output).
5. **Enhanced grinders** where their block takes less floor.
   Machines face so their inputs are on the left and outputs on the right; on a tie, an output toward the end of the block wins over one toward the input header (the Shaper).
6. **Per step, one or more blocks:**
   - **`buildTier`:**
     - Machines in columns × rows × levels, with lanes along the machines (one belt per input item, stacked lanes with lifts between levels, a header in front).
     - Filters where outputs need sorting.
     - Raised outputs get their own belt stub (PR #4); raised inputs do too when the machine has no input at lane level (Iron Smelter fix, `3dd4b60`).
     - Heaters go under heated machines (`heatingPlatform`, aligned to the machine columns).
     - Supports under raised parts.
   - **`buildCauldronTier`:** cauldrons stacked up to the height, columns 7 apart, a stub per input port with ports taken from the footprint, steam pads or stoves below.
   - **`chooseShape`:** picks the block shape, weighing floor against the lifts and raised belts that upper levels need. `LEVEL_LANE_FLOORS` gives two weightings; `generateBlocks` tries both when they lead to different shapes.

## 5. Towers: `buildTowers`

- Small blocks go on top of other blocks, to use the storey's height instead of floor.
- **Rules:**
  - Heated blocks and portals stay on the ground.
  - Machines with pipes carry nothing and cost extra to put up.
  - Big machines of one kind stack together (nurseries on nurseries); small ones of different products don't.
  - Related blocks (feeder and consumer) get a bonus.
- The upper block rests on wood-block and lab-stand columns; lab stands let lane belts underneath keep running.
- **Retries:** if belts fail between blocks stacked in the same tower, those blocks are taken out of the common towers ("own": only with their own machine kind; then "alone").
- **PR #3 added, PR #4 reverted:** a stage limit and a side-by-side fallback. They cost 12 % more floor and more failed belts in the benchmark. Stacking first is the rule again.

## 6. Floor layout: `generateBlocksWith` → `layOut`

- **Stage:** each block's distance from the module's inputs. **Feeders:** which blocks feed it, weighted by belts' worth.
- **Attempts:** corridor widths 1–3 (room for belts between blocks), each with three modes:
  - `near`: next to its feeders;
  - `flow`: rows by stage;
  - `packed`: tight packing.
- Tower attempts come first, with up to 4 retries. `slideTowardFront` closes gaps.
- **Score:** failed belts × 100000 + lifts × 40 + route belts × 3 + floor area. The best attempt wins.
- **Effort:**
  - Counted in **router search steps**, not time (PR #4), so the same plan gives the same module on every machine.
  - `WORK_BUDGET` = 18 million steps: once a layout routes everything, no more layouts are tried past it.
  - `MAX_WORK` = 3 × budget: a hard cap per module.
- **Module groups** (`moduleGroupsOf`, `generateGrouped`): with "Build as modules", each group is laid out on its own and the modules are arranged side by side, front to back.

## 7. Routing: `routeModule` → `routeOnce`

1. **Lane ends** (`findLaneEnds`): every open belt end of the blocks (in or out, items and rates).
2. **`assignFlows`: which producer feeds which consumer.**
   - Bought items are imported.
   - Rounded-up consumers share what is made.
   - Starter-primed items (self-made fertilizer, fuel of heated chains): as few producers as cover the module feed **every** consumer, and the others export. This keeps the starter box upstream of all of them (Redcurrant fix). PR #4 limited it to primed items: for anything else it made a belt per pair (sand: 70 instead of 19).
   - Everything else is matched in order.
   - Leftovers: exported (final products, chosen surplus, byproducts), sent to a sink, or left on a consumer's belt.
3. **Priority splitters** at exits that feed consumers and export a surplus: the lower output feeds the module, the upper exports. Since PR #4 their outputs must stay free and they must stand on something.
4. **Search per connection** (A*-like over cells and headings):
   - Belt cells, lifts (8 cells' cost plus height), drawbridges.
   - Supports weigh in (raised belts cost per support cell), with a slight pull toward the middle.
   - A connection may branch off an existing belt of the same source (`branchFrom`) or merge into its target's belt.
   - Imports join one import per item while it has room; money always on one line.
5. **Commit:** builds the pieces. Branching turns a belt into a split, merging into a merge.
6. **Passes:** up to 6 (PR #4). Failed connections go first in the next pass, the rest in a deterministically shuffled order. Paths through themselves are retried while avoiding the doubled cell (up to 3 times). Failures carry a reason: `no-start`, `no-way`, `search-limit` or `commit`.

## 8. Finish: `routeAndFinish`

1. Pipe ports reserved before routing (`reservePipeCells`), so belts keep them free.
2. Machine pairs expanded back into two machines (`expandPairs`, `pairTiers`).
3. Sinks for byproducts nobody takes (`attachDisposal`: altar, trash barrel, dispatch portal).
4. **Starter boxes** (`placeStarterBox`): one per primed item, on a shared stretch of the feed at the outline, red. Since PR #4 also for self-made fuel of heated chains (consumer: stoves).
5. `removeStraightLines`: rows and columns that only pass straight belts are removed.
6. **`layPipes`:** one network per fluid through free cells, as low as possible; a riser to the top for fluids that come in from outside. Done before the supports, so they don't block it.
7. `finishSupports`: unneeded supports pruned, wood blocks where no belt shares the cell, beams under longer raised runs.

## 9. Checks

- **`validateLayout`:** collisions, unsupported cells, heated machines without a heater.
- **`simulateFlow`** (build simulator, optimistic): missing or foreign inputs per machine, open belt ends, blocked pipes.
- **`unsortableSteps`:** refuses plans that put two items on one belt before filters are unlocked (PR #4).

## 10. Benchmark (PR #4)

- **`bench/corpus.json`:** 128 seeded cases. Random products at a random level with that level's buildings, cauldron off and on, plus dense cases (120–220 machines) that stand in for high research. Fertilizer and steam come from outside; solid fuel is made in the module.
- **Commands:** `bun run benchmark run` writes `bench/results/*.json`; `bun run benchmark compare <before> <after>` shows the difference (failed belts with reason, layout issues, area, height, stacked blocks, lifts, belts, inventory slots, routing work).
- **Result of PR #4:** failed belts 48 → 10, broken cases 7 → 3. Still open: Philosopher's Stone, Sol and Diamond (over 100 machines, 3–4 belts each).

## Who changed what

| Change | Where | By |
|---|---|---|
| New planner (LP over recipe flows, shared producer graph) | engine/planner | RunningDeath (with Claude) |
| Module generator, router, pipes, starter box, blueprint encoder | engine/build | RunningDeath (with Claude), carried over from the old fork |
| One fertilizer network (Redcurrant deadlock) | router.ts assignFlows | RunningDeath (with Claude) |
| Stub lifts into machines on heating platforms get supports | generator.ts | TelosNox, PR #1 |
| Build commit in the header and at /version | next.config.ts, BuildBadge | TelosNox, PR #2 |
| Stage limit for towers, side-by-side fallback | towers.ts, generator.ts | TelosNox, PR #3, reverted in PR #4 |
| Deterministic effort, benchmark, 6 routing passes, crossing retries, splitter checks, raised output stubs, primed-only shared feeding, heated-fuel starter box, unsortable plans refused | router.ts, generator.ts, starter.ts, module-steps.ts, scripts/benchmark.ts | TelosNox, PR #4 |
| Raised-only inputs get a belt (Iron Smelter); bought fuel and fertilizer by name | generator.ts, BuildPlanner.tsx | RunningDeath (with Claude), `3dd4b60` |
