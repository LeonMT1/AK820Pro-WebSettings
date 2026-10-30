export type Geometry = "ansi" | "iso";
export type Region = "us" | "uk" | "de";
export type Key = {
  id: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  led?: number;
};
export function keys(geometry: Geometry, region: Region): Key[] {
  const rows = [
    [
      "Esc",
      "F1",
      "F2",
      "F3",
      "F4",
      "F5",
      "F6",
      "F7",
      "F8",
      "F9",
      "F10",
      "F11",
      "F12",
      "Del",
    ],
    ["`", "1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "-", "=", "Back"],
    ["Tab", "Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P", "[", "]", "\\"],
    ["Caps", "A", "S", "D", "F", "G", "H", "J", "K", "L", ";", "'", "Enter"],
    ["Shift", "Z", "X", "C", "V", "B", "N", "M", ",", ".", "/", "Shift R", "↑"],
    ["Ctrl", "Win", "Alt", "Space", "Alt R", "Fn", "Ctrl R", "←", "↓", "→"],
  ];
  const widths = [
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2],
    [1.5, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1.5],
    [1.75, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2.25],
    [2.25, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1.75, 1],
    [1.25, 1.25, 1.25, 6.25, 1, 1, 1, 1, 1, 1],
  ];
  if (geometry === "iso") {
    rows[2].pop();
    widths[2].pop();
    rows[3].splice(12, 0, "#");
    widths[3].splice(12, 0, 1);
    widths[3][13] = 1.25;
    widths[4][0] = 1.25;
    rows[4].splice(1, 0, "ISO");
    widths[4].splice(1, 0, 1);
  }
  const result: Key[] = [];
  rows.forEach((row, y) => {
    let x = 0;
    row.forEach((label, i) => {
      const id = `${y}-${i}`;
      let text = label;
      if (region === "de") {
        text =
          (
            {
              Y: "Z",
              Z: "Y",
              "[": "Ü",
              ";": "Ö",
              "'": "Ä",
              "-": "ß",
              Caps: "Fest",
            } as Record<string, string>
          )[label] || label;
      }
      if (region === "uk" && label === "3") text = "3 £";
      result.push({
        id,
        label: text,
        x,
        y: y === 0 ? 0 : y + 0.25,
        w: widths[y][i],
        h: 1,
      });
      x += widths[y][i];
    });
  });
  if (geometry === "iso")
    result.push({
      id: "iso-enter-top",
      label: "↵",
      x: 13.5,
      y: 2.25,
      w: 1.5,
      h: 1,
    });
  ["Home", "PgUp", "PgDn"].forEach((label, i) =>
    result.push({ id: `nav-${i}`, label, x: 15.25, y: i + 1.25, w: 1, h: 1 }),
  );
  return result;
}
export function canPaint(map: Key[], verified = false) {
  return (
    verified &&
    map.every((k) => Number.isInteger(k.led)) &&
    new Set(map.map((k) => k.led)).size === map.length
  );
}
