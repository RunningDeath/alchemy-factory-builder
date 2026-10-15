# extract-game-data

Dumps the building table (`DT_Buildings`) from an Alchemy Factory install. The dump has footprints, belt/pipe ports, stacking flags and build costs, plus English names. `scripts/build-footprints.ts` turns it into `data/building-footprints.json`, which the build planner uses.

You only need this when the game updates. The generated JSON is committed.

## Requirements

- [.NET 10 SDK](https://dotnet.microsoft.com/download)
- A mappings file (`.usmap`) for the current game version. The game is UE 5.7 with unversioned properties, so assets can't be read without one.

### Getting a mappings file

1. Download the UE4SS experimental build: [RE-UE4SS releases](https://github.com/UE4SS-RE/RE-UE4SS/releases/tag/experimental-latest), `UE4SS_v3.0.1-*.zip`.
2. Extract `dwmapi.dll` and the `ue4ss` folder into `Alchemy Factory/AlchemyFactory/Binaries/Win64`.
3. Start the game. Once it has loaded, press `Ctrl+Numpad 6`. This writes `ue4ss/AlchemyFactory-<version>.usmap`.
4. Copy the `.usmap` somewhere else. Then delete `dwmapi.dll` and the `ue4ss` folder to remove UE4SS again.

## Run

```bash
cd tools/extract-game-data
dotnet run -c Release -- "<Steam>/steamapps/common/Alchemy Factory/AlchemyFactory/Content/Paks" path/to/mappings.usmap ../../dt_buildings.json
cd ../..
bun run build-footprints dt_buildings.json
bun run build-unlocks dt_buildings.json
```

The dump also holds the research tree, workbench recipes and quests; `build-unlocks` turns them into `data/building-unlocks.json` (the level each building becomes available at).

The first run downloads the Oodle decompression library that CUE4Parse needs.

## Icons (optional, local only)

The 3D build view draws the produced item's icon and the machine's icon on each machine. The icons are the game's own art, so they are not in the repo (`public/game-icons/` is gitignored). Without them the view draws generated badges instead. To use the real icons, export them from your install:

```bash
cd tools/extract-game-data
dotnet run -c Release -- icons "<Steam>/steamapps/common/Alchemy Factory/AlchemyFactory/Content/Paks" path/to/mappings.usmap ../..
```

This writes 64×64 PNGs to `public/game-icons/buildings/<building id>.png` (from `DT_Buildings.DisplayIcon`) and `public/game-icons/items/<item id>.png`, plus a `manifest.json` that lists them (the app reads it first, so it only requests icons that exist). The ids come from `data/building-footprints.json` and `data/items.json`. The paks have no item table, so the item icon paths are read from the [AlchemyFactoryData](https://github.com/faultyd3v/AlchemyFactoryData) `items.json`. That step needs internet access.

## Game texts only

The English names, descriptions and manuals (`Game.locres`) can be read without a mappings file:

```bash
cd tools/extract-game-data
dotnet run -c Release -- strings "<Steam>/steamapps/common/Alchemy Factory/AlchemyFactory/Content/Paks" path/to/strings.json
```

Useful for checking how buildings behave (docs/game-rules.md cites them as [Text]).

## All data tables

With a mappings file, every data table can be dumped as JSON (one file per table):

```bash
dotnet run -c Release -- tables "<Steam>/steamapps/common/Alchemy Factory/AlchemyFactory/Content/Paks" path/to/mappings.usmap path/to/out-dir
```

The useful ones: `DT_Enemies` (items, despite the name), `DT_EnemyCrafting` (recipes; `CraftType` names the machine, `FractionNum` says how many crafts one input lasts), `DT_PlantSeedConfig` (growth), `DT_Improvements` and `DT_Attributes` (research effects), `DT_Buildings`. Keep the mappings file outside the repo (it is made from the game).

## One asset as JSON

`dotnet run -c Release -- export <paks dir> <mappings.usmap> <out.json> <package path>` writes any package (e.g. `AlchemyFactory/Content/Blueprints/Buildings/BP_ThermalExtractor`) with its exports and properties. Logic written in C++ (like the Thermal Extractor height bonus) isn't in there.
