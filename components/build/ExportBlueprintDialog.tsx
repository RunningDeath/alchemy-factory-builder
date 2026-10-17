"use client";

import { Download, FolderInput, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import itemsData from "../../data/items.json";
import { exportBlueprint, randomBlueprintId } from "../../engine/build/blueprint";
import { getFootprint } from "../../engine/build/footprint";
import { placementCells, type Placement } from "../../engine/build/layout";
import type { Item } from "../../engine/types";
import { canSaveToFolder, forgetFolder, GAME_BLUEPRINT_FOLDER, pickFolder, savedFolder, saveToFolder } from "../../lib/blueprintFolder";
import { placementColor } from "../../lib/buildCatalog";

interface ExportBlueprintDialogProps {
    placements: Placement[];
    itemColors: Map<string, string>;
    defaultTitle: string;
    /** Main product, used for the blueprint's icon in game */
    mainItem?: string;
    /** Buildings the player hasn't unlocked: the game refuses the blueprint with them */
    locked: string[];
    onClose: () => void;
}

const PREVIEW_SIZE = 512;
/** A normal folder the game's blueprint folder is linked to: Chrome and Edge refuse anything under AppData */
const LINKED_FOLDER = "C:\\AlchemyFactory\\Blueprints";
const JUNCTION_COMMAND = `$src="$env:LOCALAPPDATA\\AlchemyFactory\\Saved\\Blueprints"; $dst="${LINKED_FOLDER}"; Copy-Item $src "$src-backup" -Recurse; New-Item -ItemType Directory -Force (Split-Path $dst) | Out-Null; Move-Item $src $dst; New-Item -ItemType Junction -Path $src -Target $dst`;
const itemIdByName = new Map((itemsData as unknown as Item[]).map((i) => [i.name, i.id]));

/** Top-down picture of the module: each cell shows its highest building, higher is brighter */
function drawPreview(canvas: HTMLCanvasElement, placements: Placement[], itemColors: Map<string, string>) {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const top = new Map<string, { z: number; color: string }>();
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = 1;
    for (const p of placements) {
        if (getFootprint(p.id)?.category === "floor") continue;
        const color = placementColor(p, itemColors);
        for (const c of placementCells(p)) {
            const key = `${c.x},${c.y}`;
            const prev = top.get(key);
            if (!prev || c.z >= prev.z) top.set(key, { z: c.z, color });
            minX = Math.min(minX, c.x);
            minY = Math.min(minY, c.y);
            maxX = Math.max(maxX, c.x);
            maxY = Math.max(maxY, c.y);
            maxZ = Math.max(maxZ, c.z);
        }
    }
    ctx.fillStyle = "#1a1325";
    ctx.fillRect(0, 0, PREVIEW_SIZE, PREVIEW_SIZE);
    if (top.size === 0) return;
    const span = Math.max(maxX - minX + 1, maxY - minY + 1);
    const cell = Math.floor((PREVIEW_SIZE - 32) / span);
    const ox = (PREVIEW_SIZE - (maxX - minX + 1) * cell) / 2;
    const oy = (PREVIEW_SIZE - (maxY - minY + 1) * cell) / 2;
    top.forEach(({ z, color }, key) => {
        const [x, y] = key.split(",").map(Number);
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.55 + 0.45 * (z / maxZ);
        ctx.fillRect(ox + (x - minX) * cell, oy + (y - minY) * cell, Math.max(1, cell - 1), Math.max(1, cell - 1));
    });
    ctx.globalAlpha = 1;
}

async function canvasPng(canvas: HTMLCanvasElement): Promise<Uint8Array> {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("Could not draw the preview");
    return new Uint8Array(await blob.arrayBuffer());
}

/**
 * Exports the layout as an Alchemy Factory blueprint: a PNG preview with the blueprint
 * data appended, named like the game's own blueprint files.
 */
export function ExportBlueprintDialog({ placements, itemColors, defaultTitle, mainItem, locked, onClose }: ExportBlueprintDialogProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [title, setTitle] = useState(defaultTitle);
    const [description, setDescription] = useState("");
    const [result, setResult] = useState<{ file: string; buildings: number; warnings: string[]; folder?: string } | null>(null);
    const [error, setError] = useState<string | null>(null);
    /** The browser can write into a folder (Chrome, Edge), and the game folder picked before */
    // The dialog only opens on a click, in the browser, so the check can run at once
    const [direct] = useState(canSaveToFolder);
    const [folder, setFolder] = useState<string | null>(null);

    useEffect(() => {
        if (canvasRef.current) drawPreview(canvasRef.current, placements, itemColors);
    }, [placements, itemColors]);

    useEffect(() => {
        savedFolder().then((h) => setFolder(h?.name ?? null));
    }, []);

    const build = async () => {
        const png = await canvasPng(canvasRef.current!);
        return exportBlueprint(
            placements,
            { title: title.trim() || defaultTitle, description: description.trim(), itemName: mainItem ? itemIdByName.get(mainItem) : undefined },
            png,
        );
    };

    /** Straight into the game's blueprint folder (picked once, remembered) */
    const handleSaveToGame = async (choose: boolean) => {
        setError(null);
        try {
            const exported = await build();
            const handle = (!choose && (await savedFolder())) || (await pickFolder());
            setFolder(handle.name);
            const file = await saveToFolder(handle, `${randomBlueprintId()}.png`, exported.bytes);
            setResult({ file, buildings: exported.buildingCount, warnings: exported.warnings, folder: handle.name });
        } catch (e) {
            // Closing the folder picker isn't an error
            if (e instanceof DOMException && e.name === "AbortError") return;
            setError(e instanceof Error ? e.message : String(e));
        }
    };

    const handleExport = async () => {
        setError(null);
        try {
            const exported = await build();
            const file = `${randomBlueprintId()}.png`;
            const url = URL.createObjectURL(new Blob([exported.bytes as BlobPart], { type: "image/png" }));
            const a = document.createElement("a");
            a.href = url;
            a.download = file;
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            setResult({ file, buildings: exported.buildingCount, warnings: exported.warnings });
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
            <div
                className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 flex flex-col gap-3 text-sm"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between">
                    <h3 className="font-cinzel text-[var(--accent-gold)] text-base">Export as game blueprint</h3>
                    <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer" title="Close">
                        <X size={16} />
                    </button>
                </div>

                <canvas ref={canvasRef} width={PREVIEW_SIZE} height={PREVIEW_SIZE} className="w-48 h-48 self-center rounded border border-[var(--border)]" />

                <label className="flex flex-col gap-1 text-[var(--text-secondary)]">
                    Title
                    <input value={title} onChange={(e) => setTitle(e.target.value)} className="bg-[var(--background)] border border-[var(--border)] rounded px-2 py-1 text-[var(--text-primary)]" />
                </label>
                <label className="flex flex-col gap-1 text-[var(--text-secondary)]">
                    Description
                    <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="bg-[var(--background)] border border-[var(--border)] rounded px-2 py-1 text-[var(--text-primary)]" />
                </label>

                {locked.length > 0 && (
                    <p className="text-[var(--warning)]">
                        Not unlocked at your level: {locked.join(", ")}. The game will refuse to place this blueprint until you unlock them.
                    </p>
                )}

                <div className="flex flex-wrap items-center gap-2">
                    {direct && (
                        <button
                            onClick={() => handleSaveToGame(false)}
                            className="px-3 py-1.5 rounded-md flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider cursor-pointer border border-[var(--accent-gold-dim)] text-[var(--accent-gold)] hover:bg-[var(--accent-gold)]/10"
                            title={folder ? `Save into ${folder}` : "Pick the game's blueprint folder, then save into it"}
                        >
                            <FolderInput size={13} /> Save to game
                        </button>
                    )}
                    <button
                        onClick={handleExport}
                        className={`px-3 py-1.5 rounded-md flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider cursor-pointer border ${direct ? "border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]" : "border-[var(--accent-gold-dim)] text-[var(--accent-gold)] hover:bg-[var(--accent-gold)]/10"}`}
                    >
                        <Download size={13} /> Download
                    </button>
                </div>
                {direct && folder && (
                    <p className="text-[11px] text-[var(--text-muted)]">
                        Saving into folder <code className="text-[var(--text-secondary)]">{folder}</code> ·{" "}
                        <button onClick={() => handleSaveToGame(true)} className="underline cursor-pointer hover:text-[var(--text-primary)]">
                            change
                        </button>{" "}
                        ·{" "}
                        <button onClick={() => forgetFolder().then(() => setFolder(null))} className="underline cursor-pointer hover:text-[var(--text-primary)]">
                            forget
                        </button>
                    </p>
                )}

                {error && <p className="text-[var(--error)]">{error}</p>}
                {result && (
                    <div className="flex flex-col gap-1 text-[var(--text-secondary)]">
                        <p className="text-[var(--success)]">
                            Saved {result.file} ({result.buildings} buildings){result.folder ? ` into ${result.folder}` : ""}.
                        </p>
                        {result.folder && result.folder !== "Blueprints" && (
                            <p className="text-[var(--warning)]">That folder isn&apos;t named Blueprints: the game only reads {GAME_BLUEPRINT_FOLDER}.</p>
                        )}
                        {result.warnings.map((w, i) => (
                            <p key={i} className="text-[var(--warning)]">
                                {w}
                            </p>
                        ))}
                    </div>
                )}

                <div className="text-[11px] text-[var(--text-muted)] flex flex-col gap-1 border-t border-[var(--border)] pt-2">
                    {direct ? (
                        <>
                            <p>
                                <b>Save to game</b> asks once for a folder and saves there from then on. Restart the game; the blueprint then
                                shows up in your list.
                            </p>
                            <p>
                                The browser refuses the game&apos;s own folder (<code className="text-[var(--text-secondary)]">{GAME_BLUEPRINT_FOLDER}</code>,
                                under AppData). Link it once to a normal folder: with the game closed, run in PowerShell
                            </p>
                            <code className="block whitespace-pre-wrap break-all rounded bg-[var(--background)] p-1.5 text-[var(--text-secondary)] select-all">
                                {JUNCTION_COMMAND}
                            </code>
                            <p>
                                (it keeps a backup copy next to it), then pick <code className="text-[var(--text-secondary)]">{LINKED_FOLDER}</code> here. The game
                                reads its blueprints through the link as before.
                            </p>
                        </>
                    ) : (
                        <p>
                            Put the file into <code className="text-[var(--text-secondary)]">{GAME_BLUEPRINT_FOLDER}\</code> and restart the
                            game; it then shows up in your blueprint list. Chrome and Edge can save it there directly. In Firefox, turn on
                            Settings → Downloads → &quot;Always ask you where to save files&quot; and pick that folder once: Firefox opens the
                            save dialog there from then on.
                        </p>
                    )}
                    <p>Keep a copy of that folder first. Exported blueprints are new; tell us if one doesn&apos;t load.</p>
                </div>
            </div>
        </div>
    );
}
