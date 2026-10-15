# Alchemy Factory: game rules as this project uses them

Reference for agents working on the planner (`engine/planner`) and the module generator (`engine/build`). Every rule names its source, so it's clear what is certain and what is assumed:

| Tag | Source |
|---|---|
| **[Player]** | Told by the player (in game observation or design wish), Oct 2026 sessions |
| **[Blueprint]** | Read from real player blueprints (`engine/build/blueprint/fixtures`, 18 blueprints for belts) |
| **[Data]** | Game files: `data/*.json` (items, recipes, devices from the AlchemyFactoryData export; footprints and unlocks from our own extractor `tools/extract-game-data`) |
| **[Calc]** | Community calculators (starfi5h/AlchemyFactoryCalculator, the cauldron tools): mechanics only, no code copied |
| **[Assumed]** | Our own assumption, not verified in game |

The human-readable version with diagrams is `docs/game-rules.html`. Open questions are at the end ("Unknown or unsure").

---

## 1. Research and rates

- **Machine speed (Factory Efficiency):** ×(1 + 0.25·level) up to level 12, then +0.05 per level (cap 92). `engine/game-constants.ts` **[Calc]**
- **Belt speed (Logistics Efficiency):** 60/min + 15 per level up to 12, then +3 per level. Level 7 = 165/min. **[Calc]**
- **Alchemy Skill:** extra output on Extractor, Thermal Extractor, Alembic and Advanced Alembic only: +6 % for levels 1–2, +8 % for 3–8, +10 % after. **[Calc]**
- **Fuel Efficiency:** +10 % heat per fuel item per level. **[Calc]**
- **Fertilizer Efficiency:** +10 % nutrients per fertilizer item per level. It does **not** make nurseries grow faster. **[Player]** (checked: a Growth Potion lasts 6480 × 1.1 / 1980 = 3.6 s in a belt-capped nursery; "my nutrient bonus is on 1")
- Throwing, Sales, Customer Management, Negotiation and Relic Knowledge are shown but not used by the planner. **[Calc]**

## 2. Planner rules

- **Recipes and rates are chosen by a linear program:** the cheapest raw materials plus machines, each weighted by how hard it is to build. A machine is worth 300 coins (1000 with the cauldron on), heated machines count 1 extra, cauldron slots without plants count 4 extra, a slot whose item another slot also takes counts 4 extra. `engine/planner/model.ts`
- **Raw materials:** items no recipe makes are bought at the purchasing portal at `cost` (or `base_cost`, else 1000). **[Data]**
- **Supplied resources** (from another factory) are free, up to the rate given.
- **A belt carries its speed in total**, no matter how many different items are on it; a machine whose outputs share one belt is throttled to it. **[Player]**
- **Every machine input takes at most one belt.** The exception is double-fed recipes (Linen takes Linen Thread in both inputs). `DOUBLE_FED_RECIPES` **[Data]**/**[Assumed]**
- **Fluids** (categories liquid, oil, essence, plus Steam) travel in pipes and have **no rate cap**. **[Player]**
- **Money** (coins for the purchasing portals) always comes in on **one line**; the player feeds it by hand. **[Player]**
- **Whole machines:** the plan works in fractions. Built machines are rounded (up by default). The extra a rounded-up machine could make is *spare capacity*: the belt backs up and the machine waits, nothing is lost. **[Player]**/**[Assumed]**
- **Recipe locks:** the player can pin a recipe per item; the planner uses only that one.
- **Second cauldron pass:** if the program blends several cauldron mixes for one material, the most used mix is kept and the plan solved again (one mix per material).

## 3. Nurseries and fertilizer

- **Growth time** = nutrients per cycle ÷ the fertilizer's `nutrients_per_seconds`. The nutrients count **every output** of the cycle (Gentian Nectar comes with 80 Gentian at 6000 each). **[Data]**/**[Player]**
- **Fertilizer per cycle** = nutrients ÷ (fertilizer `nutrient_value` × Fertilizer Efficiency). **[Data]**
- **One belt out:** all outputs of a nursery leave on the same belt, so a nursery puts out at most one belt (e.g. one Chamomile nursery: 165/min at level 7). **[Player]**
- **Seeds** sit in the nursery and are never used up. **[Data]**
- **Hungry plants:** Chamomile eats a lot; without enough fertilizer it runs dry. **[Player]**
- **Self-made fertilizer:**
  - The module's own nurseries get **full priority**; only leftovers leave. **[Player]**
  - A **reserve** (default 25 %) is planned on top. What isn't eaten leaves as product, so the delivered amount can exceed the target. **[Player]**
  - If one producer covers all nurseries, it feeds all of them and the others export; otherwise each producer used feeds every nursery. Producers feeding *different* nurseries deadlock: the starter box reaches only some plants, and the potion needs all of them. **[Player]** (Redcurrant case)
  - Fertilizer to several consumers must reach every plant type at once, so the loop needs few starting items. Plain belt splits share evenly, so this holds as long as no Priority Splitter sits between the nursery groups. **[Player]**
- **Grind at the nursery:** when a nursery's whole output goes into one grinder, the grinder sits right at the output port (a machine pair). **[Player]**

## 4. Heat

- **Heated machines must stand on a heating device** ("Can only be built on heating devices"). **[Data]**
- **Heating devices:**
  - Stone Stove: burns 1 heat/s itself and has 9 slots.
  - Steam Heating Pad: 9 slots.
  - Stone Furnace: 4 heat/s and 42 slots, not used by the generator.
  - `data/device-metadata.json` **[Data]**/**[Calc]**
- **Slots taken:**

  | Machine | Slots |
  |---|---|
  | Crucible, Stackable Crucible | 3 |
  | Kiln, Athanor, Advanced Athanor, Advanced Alembic, Thermal Extractor | 6 |
  | Iron Smelter, Paradox Crucible | 9 |
  | Alembic | 1 |

  **[Calc]**
- **Heat per craft:**
  - The machine burns `heat_consuming_speed` × its working time.
  - Its heater adds its own burn × (slots taken ÷ slots). That share does not speed up with research.
  - Fuel = heat ÷ (fuel `heat_value` × Fuel Efficiency).
  - **[Calc]** (starfi5h), **[Assumed]** for the heater part
- **Heater placement:** heaters cover the machines' own columns and rows, not a fixed grid (3 kilns need 3 stoves, not 6). **[Calc]**
- **Separated steam pads need a pipe between them** to stay heated. **[Player]**
- **Self-made fuel for heated chains** is primed by a starter box like fertilizer.

## 5. Cauldron, Advanced Cauldron, Paradox Crucible

- **Cauldron:**
  - **Mix rule:** three materials in. Their cauldron values are summed (×1 when all differ, ×0.65 when two are the same, ×0.5 when all three are), and out comes the material whose cauldron target is nearest. **[Calc]**
  - **Time and heat per craft** are interpolated by target value: 1 → 3 s/1 heat, 100 → 6 s/20, 1000 → 12 s/200, 10000 → 24 s/1500, 10⁶ → 60 s/10000. **[Calc]**
  - **Output:** the cauldron gives out only the **result**, never an input. **[Player]**
  - **Three different inputs:** with an item in two slots, the first slot fills completely before the second gets any, which delays the start. **[Player]**
  - **Prefer plant-based mixes:** they need only nurseries and grinders and save heating pads. Redcurrant + Sage + Sage Powder → Clay is the best Clay mix. **[Player]**
  - **Filters are set in the blueprint:** `CauldronFilterName`, an array of three item names. **[Blueprint]**
  - **Stacking:** cauldrons stack on each other and share the heat below. **[Player]** (Factory 4: Growth Potion)
  - **Spacing:** columns stand **7 cells apart**, so one cauldron's output doesn't run into its neighbour's input. A lift can't pass items across several stages. **[Player]**
- **Advanced Cauldron** (two inputs, level 8):
  - Two of the same item → the next target above the input.
  - Two different items → the target nearest |difference|, below the higher input's value.
  - **[Calc]**
- **Paradox Crucible:**
  - Brew time = clamp(1500 ÷ (stack × cauldron cost), 0.5 s, 1500 s).
  - Any item → Oblivion Essence; Oblivion Essence → Vitality Essence (5 s).
  - It burns 1200 heat/s.
  - **[Calc]**

## 6. Other machines

- **Iron Smelter:** its only input port is at the **top** (3 cells up), the output at the bottom; 1 ore → 100 ingots in 600 s. Such a raised-only input needs its own belt stub. **[Data]**
- **Enhanced (Advanced) Grinder:** twice as fast as a grinder; used where it saves space. **[Player]**
- **Brine:** large amounts (4000/min) come from rock salt, not athanors. Extractors and blenders have pipe ports; they may stack on other blocks (a suggestion, not a rule), and for brine coming from outside they behave the same as for brine made in the module. **[Player]**
- **Purchasing Portal:**
  - Each portal sells one item (`SupplyName`), paid in coins (1 silver = 1000 copper, 1 gold = 100 silver).
  - The portal's speed isn't in the data; it's assumed to deliver up to one belt.
  - **[Data]**/**[Assumed]**
- **Output sinks:**
  - Knowledge Altar: turns items into knowledge.
  - Trash Barrel: takes belts at height 3.
  - Dispatch Portal: sells.
  - Byproducts that can't stay on a belt go to one of them. **[Data]**
- **Shaper:** its front output still needs a belt laid by hand (not yet taught). **[Data]**

## 7. Logistics

- **Plain belts:** player blueprints only use the plain belt for straight runs, turns, splits and merges. `BaseActiveIndex` holds the connected sides relative to the front (front 1, right 2, back 4, left 8; outputs shifted by 4). **[Blueprint]** (429 belts in 18 blueprints)
- **Plain belt splits share evenly, whatever the shape:** straight + side, or left + right (a T). **[Player]** (an earlier note said "straight first"; that applies only to the Priority Splitter)
- **Merge:** the same belt shape with the branch running **into** the line is a merge (two belts in, one out), not a split. What decides split versus merge is the direction of the branch. **[Player]**
- **Priority Splitter (vertical, 2×1×2):** in on one side, two outputs on the other. The lower output gets **everything first**; the upper only gets items when the lower backs up. Used for "module first, overflow to export". **[Player]**/**[Blueprint]**
- **Filter Splitter:**
  - Tall version: the filtered item takes the **lower** output.
  - Flat version: the filtered item takes the **side** output, the rest runs straight.
  - **[Blueprint]**
- **Balanced Splitter:** in the files, but hidden and not unlockable, so not used. **[Data]**
- **Conveyor Lifter:** items enter at the bottom (upwards lift) and come out at the top end; a body cell between. **[Data]**
- **Drawbridge:** a 3-cell deck on posts, for belts across gaps. **[Data]**
- **Starter box:**
  - A small side container acts as a belt piece: items go in and out, and you can build on it. **[Player]**
  - Exactly **one** per primed item, in the fertilizer (or fuel) back flow, at the module's **outline** where the player reaches it. **[Player]**
  - Colored **red** in game (`CustomColor` BGRA 64, 64, 255, 255) and in the app. **[Player]**/**[Blueprint]**
- **Pipes:**
  - They need **free cells** (they can't pass through wood blocks) but **no support**. A lab stand may share a cell with a pipe only where the pipe runs **straight**, never at a bend or branch. **[Player]**
  - **One pipe input per resource:** the module's ports join at the **lowest possible line**, with one riser from the middle up to the top. **[Player]**
  - Pipes are colored per resource.
  - Plain pipe `BaseActiveIndex`: side bits like belts, plus 16 down, 32 up. **[Blueprint]**

## 8. Building, stacking, height

- **Storey:** 16 cells; the **top cell is taken by the ceiling**, so buildings and pipes stay below it. **[Player]** (a 16-high module stuck out by one)
- **Default module height** is 15 (the user's setting); width and depth 32. **[Player]**
- **What can carry what:**
  - Machines rest on grinder-sized machines, lab stands, beams, wood blocks and stoves, never on other machines. Cauldrons are the exception and stack on cauldrons.
  - Pipes carry nothing.
  - **[Blueprint]**
- **Raised belts** need supports down to the ground or a carrying cell: lab stands (a belt can share their cell) or wood blocks. **[Blueprint]**
- **Heated blocks** keep their heater platform on the ground. **[Data]**/**[Assumed]**
- **Module flow:** modules stand side by side; raw materials come in at the **front**, products leave at the **back**; leftovers for a sink may also leave at the sides.
- **Unlocks:** buildings become available by level (research, workbench, quests; `data/building-unlocks.json`, levels 1–10). A plan whose byproducts share a belt is refused until Filter Splitters are unlocked. **[Data]**

## 9. Generator design rules (player preferences)

- **Compact:** little free space between modules and portals; use the height instead of floor (towers), but a **flat** layout when it is simpler (grinder towers on the floor). **[Player]**
- **Same kinds together:** stacks don't mix machine kinds without need. **[Player]**
- **Termination:** generation must finish; effort is counted in routing steps (deterministic: the same plan gives the same module). **[Player]**/PR #4
- **Feed evenly** wherever several machines start from the same supply, above all for starter-primed items. **[Player]**
- **Splits at the end of a chain** (e.g. the Growth Potion output dividing into export and the fertilizer back flow) go where there is free room behind the module, not crammed right at the machines' outputs. **[Player]** (the router may place a priority splitter up to 3 cells away from its exit, `SPLITTER_LEAD`)

## 10. Blueprint file format

- **Container:** PNG preview, then after `IEND` a tagged-property header, the Oodle-compressed body and an 8-byte trailer (header+body length, magic `0x5042AFD5`). **[Blueprint]**
- **Body:** a list of buildings (`CloneBuildingData`) with `GridRotation`, pivot, `BaseActiveIndex`, recipe (`RecipeName`), supply (`SupplyName`), filters (`FilterName`, `CauldronFilterName`), `SeedName`, `CustomColor`. **[Blueprint]**
- **Templates:** fields the app doesn't set are copied from player blueprints (`template-data.ts`). **[Blueprint]**

---

## Unknown or unsure

What we don't know or haven't verified, roughly by how much it matters:

1. **3-way belt split** (in + three outputs): assumed to share evenly like the 2-way split, not verified.
2. **Cauldron line filling from the end:** one cauldron line once filled its last cauldron completely before the others. With even splits, the cause is unknown (perhaps how machines take items from a belt running past them).
3. **Plain belt merges and the Priority Merger:** which input goes first, and does a merge alternate fairly? Unknown; matters for back flows that join a main line.
4. **Machine input buffers:** how many items a machine (nursery, cauldron) holds before its input backs up. This decides how much a starter box must hold and how fast a line fills.
5. **Purchasing Portal speed:** assumed one belt per portal; the data has no rate.
6. **Heater burn with research:** we assume a heater's own burn doesn't speed up with Factory Efficiency (as starfi5h does). The old planner scaled it, a 5–9 % fuel difference.
7. **Lifts:** maximum height, throughput, whether a lift can take or give items at intermediate levels (assumed no), and why stacked cauldrons can't share one lift ("can't transport multiple stages").
8. **Stone Furnace** (42 slots, 4 heat/s): never placed by the generator; how it's built and fed is unclear.
9. **Steam Heating Pads:** exact rules for which pads are heated through neighbours versus need their own pipe.
10. **Pipes:** no known throughput or length limit (treated as unlimited); not verified for very long runs or large brine rates.
11. **Thermal Extractor:** starfi5h models output growing with build height (×1 at height 0 to ×3 at 255); not modelled here.
12. **Advanced Athanor catalysts** (Unstable, Fertile, Resonant, Eternal): change outputs or use charges; not modelled.
13. **Machines the generator hasn't been taught or checked:**
    - Shaper and Advanced Shaper (front output);
    - Aether Shaper, Arcane Processor (raised output), Omni Machine;
    - Refiner layouts with many outputs;
    - Paradox Crucible in modules.
14. **Catapults** (Throwing Efficiency): not used; their range and throughput are unknown to us.
15. **Coins on belts:** starfi5h lets coins pass 50× a belt's speed; we keep money on one line and don't cap it. Unclear in game.
16. **Seed counts:** seeds a nursery needs are taken from the recipe; unverified.
17. **Game data freshness:** items and recipes come from an external export and may lag behind game updates. Footprints and unlocks come from our own extractor; re-run both after a patch.
18. **Balanced Splitter:** present but hidden; if a future patch enables it, even splits get easier.
