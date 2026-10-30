import { canPaint, keys, type Geometry, type Key } from "./layouts";
export type KeyColors = Record<string, string>;
export type ColorLayout = { version: 1; geometry: Geometry; colors: KeyColors };
export type ColorPreset = ColorLayout & { id: string; name: string };
// ANSI legacy indices from wsclx legacy_rgb.rs / vendor 1.0.0.5 XML.
// Community-tested on 800A; experimental on this user's 8009. Never infer ISO indices.
export function experimentalAnsiMap(
  geometry: Geometry,
  region: "us" | "uk" | "de",
): Key[] {
  const map = keys(geometry, region);
  if (geometry !== "ansi") return map;
  const rows = [
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 119],
    [19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 103],
    [37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 67],
    [55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 85],
    [73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 101],
    [91, 92, 93, 94, 95, 96, 98, 99, 100, 102],
  ];
  return map.map((k) => {
    const nav = /^nav-(\d)$/.exec(k.id);
    const [row, col] = k.id.split("-").map(Number);
    return { ...k, led: nav ? [117, 118, 121][+nav[1]] : rows[row]?.[col] };
  });
}
export const blankColors = (geometry: Geometry): KeyColors =>
  Object.fromEntries(keys(geometry, "us").map((k) => [k.id, "#000000"]));
export function parseColorLayout(value: unknown): ColorLayout {
  const v = value as ColorLayout;
  if (
    !v ||
    v.version !== 1 ||
    !["ansi", "iso"].includes(v.geometry) ||
    !v.colors ||
    typeof v.colors !== "object" ||
    Array.isArray(v.colors)
  )
    throw new Error("Invalid per-key layout file");
  const expected = keys(v.geometry, "us").map((k) => k.id);
  if (
    Object.keys(v.colors).length !== expected.length ||
    expected.some(
      (id) =>
        !Object.hasOwn(v.colors, id) ||
        typeof v.colors[id] !== "string" ||
        !/^#[\da-f]{6}$/i.test(v.colors[id]),
    )
  )
    throw new Error(
      "Every physical key must have exactly one valid hex color",
    );
  return {
    version: 1,
    geometry: v.geometry,
    colors: Object.fromEntries(
      expected.map((id) => [id, v.colors[id].toLowerCase()]),
    ),
  };
}
export function paint(
  colors: KeyColors,
  selected: string[],
  color: string,
): KeyColors {
  if (
    !/^#[\da-f]{6}$/i.test(color) ||
    selected.some((id) => !Object.hasOwn(colors, id))
  )
    throw new Error("Invalid color or key selection");
  return {
    ...colors,
    ...Object.fromEntries(selected.map((id) => [id, color.toLowerCase()])),
  };
}
// Adapted from legacy_rgb.rs (wsclx, MIT). The custom-mode delimiter differs from standard effects.
export function perKeyPackets(
  map: Key[],
  colors: KeyColors,
  brightness: number,
  writeAuthorized = false,
) {
  if (
    !map.length ||
    !canPaint(map, writeAuthorized) ||
    map.some((k) => k.led! < 1 || k.led! > 127)
  )
    throw new Error(
      "Per-key writes require a complete LED map and explicit write authorization",
    );
  if (
    new Set(map.map((k) => k.id)).size !== map.length ||
    Object.keys(colors).length !== map.length ||
    map.some((k) => !/^#[\da-f]{6}$/i.test(colors[k.id]))
  )
    throw new Error("Invalid per-key colours");
  if (!Number.isInteger(brightness) || brightness < 0 || brightness > 5)
    throw new Error("Brightness must be 0–5");
  const mode = new Uint8Array(64);
  mode[0] = 0x80;
  mode[9] = brightness;
  mode.set([0xaa, 0x55], 14);
  const bank = new Uint8Array(576);
  for (const key of map) {
    const id = key.led!;
    bank.set(
      [
        id,
        ...colors[key.id]
          .slice(1)
          .match(/../g)!
          .map((h) => parseInt(h, 16)),
      ],
      id * 4,
    );
  }
  bank.set([0xaa, 0x55], 574);
  return { mode, bank };
}
