// Dumps DT_Buildings (footprints, ports, costs) from an Alchemy Factory install as JSON,
// with English display names, plus the tables that unlock buildings (research tree,
// workbench, quests). scripts/build-footprints.ts turns the dump into
// data/building-footprints.json, scripts/build-unlocks.ts into data/building-unlocks.json.
//
// Usage: dotnet run -- <paks dir> <mappings.usmap> <out.json>
//        dotnet run -- icons <paks dir> <mappings.usmap> <repo root>   (see Icons.cs)
// The game uses unversioned properties, so a .usmap is required (see README.md).
using CUE4Parse.Compression;
using CUE4Parse.FileProvider;
using CUE4Parse.MappingsProvider.Usmap;
using CUE4Parse.UE4.Assets.Exports.Engine;
using CUE4Parse.UE4.Localization;
using CUE4Parse.UE4.Versions;
using Newtonsoft.Json;

// English texts only (names, descriptions, tooltips): needs no mappings file
if (args.Length == 3 && args[0] == "strings")
{
    var oodle = Path.Combine(AppContext.BaseDirectory, "oo2core_9_win64.dll");
    if (!File.Exists(oodle)) OodleHelper.DownloadOodleDll(ref oodle);
    OodleHelper.Initialize(oodle);
    var files = new DefaultFileProvider(args[1], SearchOption.TopDirectoryOnly, new VersionContainer(EGame.GAME_UE5_7), StringComparer.OrdinalIgnoreCase);
    files.Initialize();
    files.Mount();
    var texts = new FTextLocalizationResource(files.CreateReader("AlchemyFactory/Content/Localization/Game/en/Game.locres"));
    var strings = new SortedDictionary<string, string>();
    foreach (var ns in texts.Entries)
        foreach (var entry in ns.Value)
            strings.TryAdd($"{ns.Key.Str}/{entry.Key.Str}", entry.Value.LocalizedString);
    File.WriteAllText(args[2], JsonConvert.SerializeObject(strings, Formatting.Indented));
    Console.WriteLine($"Wrote {strings.Count} strings to {args[2]}");
    return 0;
}

var iconsMode = args.Length > 0 && args[0] == "icons";
if (iconsMode) args = args[1..];
// Every data table, one JSON file each: dotnet run -- tables <paks dir> <mappings.usmap> <out dir>
var tablesMode = args.Length > 0 && args[0] == "tables";
if (tablesMode) args = args[1..];
// Any package as JSON (blueprint scripts included): dotnet run -- export <paks dir> <mappings.usmap> <out.json> <package path>
var exportMode = args.Length == 5 && args[0] == "export";
var exportPackage = exportMode ? args[4] : "";
if (exportMode) args = args[1..4];
if (args.Length < 3)
{
    Console.Error.WriteLine("Usage: dotnet run -- <paks dir> <mappings.usmap> <out.json>");
    Console.Error.WriteLine("       dotnet run -- icons <paks dir> <mappings.usmap> <repo root>");
    return 1;
}
var (paksDir, usmapPath, outPath) = (args[0], args[1], args[2]);

var oodlePath = Path.Combine(AppContext.BaseDirectory, "oo2core_9_win64.dll");
if (!File.Exists(oodlePath))
{
    var downloaded = oodlePath;
    OodleHelper.DownloadOodleDll(ref downloaded);
    oodlePath = downloaded;
}
OodleHelper.Initialize(oodlePath);

var provider = new DefaultFileProvider(paksDir, SearchOption.TopDirectoryOnly, new VersionContainer(EGame.GAME_UE5_7), StringComparer.OrdinalIgnoreCase)
{
    MappingsContainer = new FileUsmapTypeMappingsProvider(usmapPath, StringComparer.OrdinalIgnoreCase),
};
provider.Initialize();
provider.Mount();

if (exportMode)
{
    var exports = provider.LoadPackage(exportPackage).GetExports();
    File.WriteAllText(outPath, JsonConvert.SerializeObject(exports, Formatting.Indented));
    Console.WriteLine($"Wrote {exports.Count()} exports of {exportPackage} to {outPath}");
    return 0;
}

if (tablesMode)
{
    Directory.CreateDirectory(outPath);
    var tables = provider.Files.Keys.Where((k) => k.Contains("/DataTables/", StringComparison.OrdinalIgnoreCase) && k.EndsWith(".uasset", StringComparison.OrdinalIgnoreCase)).OrderBy((k) => k).ToList();
    foreach (var file in tables)
    {
        var name = Path.GetFileNameWithoutExtension(file);
        try
        {
            var table = provider.LoadPackageObject<UDataTable>($"{file[..^".uasset".Length]}.{name}");
            var map = table.RowMap.ToDictionary((kv) => kv.Key.Text, (kv) => kv.Value);
            File.WriteAllText(Path.Combine(outPath, $"{name}.json"), JsonConvert.SerializeObject(map, Formatting.Indented));
            Console.WriteLine($"{file}: {map.Count} rows");
        }
        catch (Exception e)
        {
            Console.WriteLine($"{file}: not a data table ({e.GetType().Name})");
        }
    }
    return 0;
}

Dictionary<string, CUE4Parse.UE4.Assets.Objects.FStructFallback> Rows(string name) =>
    provider.LoadPackageObject<UDataTable>($"AlchemyFactory/Content/DataTables/{name}.{name}").RowMap.ToDictionary(kv => kv.Key.Text, kv => kv.Value);
var rows = Rows("DT_Buildings");

if (iconsMode) return await Icons.Export(provider, rows, outPath);

// English strings, keyed by localization key (DisplayName.Key in the rows)
var locres = new FTextLocalizationResource(provider.CreateReader("AlchemyFactory/Content/Localization/Game/en/Game.locres"));
var english = new Dictionary<string, string>();
foreach (var ns in locres.Entries)
    foreach (var entry in ns.Value)
        english.TryAdd(entry.Key.Str, entry.Value.LocalizedString);

File.WriteAllText(outPath, JsonConvert.SerializeObject(new { buildings = rows, english, skillPoints = Rows("DT_SkillPoints"), workbench = Rows("DT_Workbench"), quests = Rows("DT_Quests") }, Formatting.Indented));
Console.WriteLine($"Wrote {rows.Count} buildings to {outPath}");
return 0;
