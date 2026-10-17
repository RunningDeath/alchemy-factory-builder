/**
 * Saving blueprints straight into the game's blueprint folder (File System Access API,
 * Chrome and Edge). The player picks the folder once; its handle is kept in IndexedDB, and
 * the browser asks again for write access when a new session saves the first time.
 */

/** Where the game keeps blueprints, shown to the player when picking the folder */
export const GAME_BLUEPRINT_FOLDER = "%LOCALAPPDATA%\\AlchemyFactory\\Saved\\Blueprints";

type PermissionMode = { mode: "read" | "readwrite" };
interface FolderHandle extends FileSystemDirectoryHandle {
    queryPermission(options: PermissionMode): Promise<PermissionState>;
    requestPermission(options: PermissionMode): Promise<PermissionState>;
}
type PickerWindow = Window & { showDirectoryPicker?: (options?: { id?: string; mode?: "readwrite"; startIn?: string }) => Promise<FolderHandle> };

const DB = "alchemy-factory-builder";
const STORE = "handles";
const KEY = "blueprint-folder";

export const canSaveToFolder = () => typeof window !== "undefined" && typeof (window as PickerWindow).showDirectoryPicker === "function";

function openDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await openDb();
    try {
        return await new Promise<T>((resolve, reject) => {
            const req = run(db.transaction(STORE, mode).objectStore(STORE));
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    } finally {
        db.close();
    }
}

/** The folder picked before, if any (no permission check) */
export async function savedFolder(): Promise<FolderHandle | null> {
    try {
        return ((await withStore("readonly", (s) => s.get(KEY))) as FolderHandle | undefined) ?? null;
    } catch {
        return null;
    }
}

/** Lets the player pick the blueprint folder and remembers it */
export async function pickFolder(): Promise<FolderHandle> {
    const handle = await (window as PickerWindow).showDirectoryPicker!({ id: "blueprints", mode: "readwrite" });
    try {
        await withStore("readwrite", (s) => s.put(handle, KEY));
    } catch {
        // Not remembered (private window): this session still works
    }
    return handle;
}

export async function forgetFolder(): Promise<void> {
    try {
        await withStore("readwrite", (s) => s.delete(KEY));
    } catch {
        // nothing kept
    }
}

/** Write access to the folder; asks the player when the browser hasn't granted it yet this session */
async function writable(handle: FolderHandle): Promise<boolean> {
    if ((await handle.queryPermission({ mode: "readwrite" })) === "granted") return true;
    return (await handle.requestPermission({ mode: "readwrite" })) === "granted";
}

/**
 * Writes the blueprint into the folder under a name not taken yet (never replaces a file).
 * Returns the file name.
 */
export async function saveToFolder(handle: FolderHandle, name: string, bytes: Uint8Array): Promise<string> {
    if (!(await writable(handle))) throw new Error("The browser didn't allow writing to the folder.");
    try {
        await handle.getFileHandle(name);
        throw new Error(`${name} already exists in the folder.`);
    } catch (e) {
        if (!(e instanceof DOMException && e.name === "NotFoundError")) throw e;
    }
    const file = await handle.getFileHandle(name, { create: true });
    const out = await file.createWritable();
    await out.write(bytes as BufferSource);
    await out.close();
    return name;
}
