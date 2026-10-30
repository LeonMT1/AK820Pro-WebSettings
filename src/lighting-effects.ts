// Visual approximations adapted from allshouldbeready/ak820-pro-macos (MIT).
import { reactionLevel } from "./lighting-reactions";
import type { Lighting } from "./protocol";
export type Point = { id: string; x: number; y: number; w: number };
export type Hit = { id: string; x: number; y: number; time: number };
export const reactiveModes = new Set([2, 3, 13, 14, 15]);
const clamp = (n: number) => Math.max(0, Math.min(1, n));
const wave = (n: number) => (Math.sin(n) + 1) / 2;
export function effectLevel(
  c: Lighting,
  key: Point,
  index: number,
  time: number,
  hits: Hit[],
): number {
  const x = key.x + key.w / 2,
    y = key.y + 0.5,
    t = time * (0.3 + c.speed * 0.3),
    axis = [-x, y, -y, x][c.direction],
    radius = Math.hypot(x - 8, (y - 2.7) * 1.5);
  let reaction = 0;
  if (reactiveModes.has(c.mode))
    for (const hit of hits) {
      const age = time - hit.time;
      if (age < 0) continue;
      if (c.mode === 2 || c.mode === 3) {
        if (hit.id === key.id)
          reaction = Math.max(
            reaction,
            clamp(1 - (age * (0.3 + c.speed * 0.3)) / 1.5),
          );
      } else
        reaction = Math.max(
          reaction,
          reactionLevel(
            c.mode === 13 ? "explode" : c.mode === 14 ? "launch" : "ripples",
            x,
            y,
            hit.x,
            hit.y,
            age,
            c.speed,
          ),
        );
    }
  let level = 1;
  switch (c.mode) {
    case 0:
      level = 0;
      break;
    case 2:
    case 13:
    case 14:
    case 15:
      level = reaction;
      break;
    case 3:
      level = 1 - reaction;
      break;
    case 4:
      level = Math.pow(wave(t * 3 + index * 2.399), 12);
      break;
    case 5:
      level = Math.pow(wave(y * 1.6 - t * 4 + Math.sin(x * 7)), 5);
      break;
    case 7:
      level = c.speed === 0 ? 1 : 0.05 + 0.95 * wave(t * 2);
      break;
    case 9:
      level = Math.pow(wave(radius * 1.4 - t * 4), 3);
      break;
    case 10:
      level = 0.08 + 0.92 * Math.pow(wave(axis * 0.75 - t * 3), 3);
      break;
    case 11:
      level = 0.1 + 0.9 * wave(axis * 0.65 - t * 3 + y);
      break;
    case 12:
      level = Math.pow(
        wave(Math.atan2(y - 2.7, x - 8) - t * 3 * (c.direction === 0 ? -1 : 1)),
        5,
      );
      break;
    case 16:
      level = 0.15 + 0.85 * wave(axis * 0.7 + y * 1.2 - t * 3);
      break;
    case 17:
      level = Math.pow(wave(radius - t * 3), 2);
      break;
    case 18:
      level = Math.pow(wave(axis * 0.9 + y * 1.5 - t * 3), 3);
      break;
    case 19:
      level = clamp(1 - Math.abs(x - wave(t * 2) * 16) / 2);
      break;
  }
  return clamp((level * c.brightness) / 5);
}
export function effectColor(
  c: Lighting,
  key: Point,
  index: number,
  time: number,
) {
  if (!c.rainbow && c.mode !== 6 && c.mode !== 8) return c.color;
  const t = time * (0.3 + c.speed * 0.3);
  const hue =
    c.mode === 8
      ? t * 60
      : c.mode === 6
        ? index * 137.5 + Math.floor(t * 2) * 47
        : (key.x + key.w / 2) * 22 + key.y * 30 + t * 80;
  return `hsl(${((hue % 360) + 360) % 360} 95% 62%)`;
}
export function keyIdForCode(
  code: string,
  labels: { id: string; label: string }[],
): string | undefined {
  const named: Record<string, string> = {
    Escape: "Esc",
    Backspace: "Back",
    Space: "Space",
    CapsLock: "Caps",
    ControlLeft: "Ctrl",
    ControlRight: "Ctrl R",
    ShiftLeft: "Shift",
    ShiftRight: "Shift R",
    AltLeft: "Alt",
    AltRight: "Alt R",
    MetaLeft: "Win",
    ArrowUp: "↑",
    ArrowLeft: "←",
    ArrowDown: "↓",
    ArrowRight: "→",
    PageUp: "PgUp",
    PageDown: "PgDn",
    Home: "Home",
    Delete: "Del",
    Backquote: "`",
    Minus: "-",
    Equal: "=",
    BracketLeft: "[",
    BracketRight: "]",
    Backslash: "\\",
    Semicolon: ";",
    Quote: "'",
    Comma: ",",
    Period: ".",
    Slash: "/",
  };
  const label =
    named[code] ??
    (/^Key[A-Z]$/.test(code)
      ? code.slice(3)
      : /^Digit\d$/.test(code)
        ? code.slice(5)
        : code);
  return labels.find((k) => k.label === label)?.id;
}
