# Project notes

- Package manager: `bun` (`bun install`, `bun run dev`, `bun test`, `bun run typecheck`).
- Line endings: LF everywhere (`.gitattributes`).
- Mobile first: every page must work at 360 px width with a 16 px gutter and no horizontal page scroll. Desktop adds columns; it never needs them.
- No code copied from other Alchemy Factory projects (none of them has a license). Use them only as references for game mechanics and write our own implementation.
- Game icons (`public/game-icons/`) are exported from the game with tools/extract-game-data and published (fan project, credited in the README). Never copy icons from other projects. `lib/itemGlyph.ts` gives items without an icon our own symbol.

## Layout

```
app/          Next.js App Router pages (planner, build, codex)
components/   UI, grouped by feature (planner, build, codex, layout, ui)
engine/       Pure TypeScript, no React
  planner/    Linear program: context (research), recipes (flows per craft), model, graph
  build/      Module generator, router, pipes, blueprint encode/decode
lib/          Glue between engine and UI (catalogs, display helpers)
store/        Zustand stores (persisted)
data/         Game data JSON
scripts/      Bun scripts that regenerate data
tools/        C# game data extractor
```

## Planner

`calculatePlan(config)` (engine/planner) returns production nodes. Producer nodes are shared objects: each consumer lists them in `inputs` and records its share in `inputRates`. `collectPlanGraph` (engine/plan-graph.ts) flattens them into nodes and edges for the graph, belt analysis and generator.
