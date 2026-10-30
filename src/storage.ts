import { validateLighting, type Lighting, type Frame } from "./protocol";
import { validateSystemSettings, type SystemSettings } from "./system-settings";
export type Preset = {
  id: string;
  name: string;
  lighting: Lighting;
  sleep: number;
  system?: SystemSettings;
};
export function parsePresets(value: unknown): Preset[] {
  if (!Array.isArray(value) || value.length > 100)
    throw new Error("Expected up to 100 presets");
  return value.map((p) => {
    if (
      !p ||
      typeof p.name !== "string" ||
      !p.name.trim() ||
      p.name.length > 80 ||
      typeof p.id !== "string" ||
      ![0, 1, 5, 30].includes(p.sleep)
    )
      throw new Error("Invalid preset");
    const system =
      p.system === undefined ? undefined : validateSystemSettings(p.system);
    if (system && system.sleep !== p.sleep)
      throw new Error("Preset sleep settings disagree");
    return {
      id: p.id,
      name: p.name,
      lighting: validateLighting(p.lighting),
      sleep: p.sleep,
      ...(system ? { system } : {}),
    };
  });
}
export function readLocal<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) || "null") ?? fallback;
  } catch {
    return fallback;
  }
}
export type Upload = {
  id: string;
  name: string;
  date: string;
  frames: Frame[];
};
async function db() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open("ak820-studio", 1);
    r.onupgradeneeded = () =>
      r.result.createObjectStore("uploads", { keyPath: "id" });
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
export async function history(
  action: "list" | "save" | "delete",
  entry?: Upload | string,
): Promise<Upload[]> {
  const d = await db();
  try {
    return await new Promise((resolve, reject) => {
      const tx = d.transaction(
          "uploads",
          action === "list" ? "readonly" : "readwrite",
        ),
        store = tx.objectStore("uploads");
      if (action === "save") store.put(entry);
      if (action === "delete") store.delete(entry as string);
      const r = store.getAll();
      let all: Upload[] = [];
      r.onsuccess = () => {
        all = (r.result as Upload[]).sort((a, b) =>
          b.date.localeCompare(a.date),
        );
        if (action === "save") {
          all.slice(10).forEach((v) => store.delete(v.id));
          all = all.slice(0, 10);
        }
      };
      tx.oncomplete = () => resolve(all);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () =>
        reject(tx.error || new Error("Storage transaction aborted"));
    });
  } finally {
    d.close();
  }
}
