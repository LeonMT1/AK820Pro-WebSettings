// Legacy packet encoding adapted from wsclx/ak820pro-modder (MIT); see THIRD_PARTY.md.
export const modes = [
  "Off",
  "Static",
  "Single on",
  "Single off",
  "Glittering",
  "Falling",
  "Colourful",
  "Breath",
  "Spectrum",
  "Outward",
  "Scrolling",
  "Rolling",
  "Rotating",
  "Explode",
  "Launch",
  "Ripples",
  "Flowing",
  "Pulsating",
  "Tilt",
  "Shuttle",
];
export type Lighting = {
  mode: number;
  color: string;
  brightness: number;
  speed: number;
  direction: number;
  rainbow: boolean;
};
export const defaults: Lighting = {
  mode: 1,
  color: "#ff0000",
  brightness: 3,
  speed: 2,
  direction: 0,
  rainbow: false,
};
function integer(n: number, min: number, max: number) {
  if (!Number.isInteger(n) || n < min || n > max)
    throw new Error(`Value must be ${min}–${max}`);
}
export function validateLighting(c: Lighting) {
  if (!c || !/^#[0-9a-f]{6}$/i.test(c.color) || typeof c.rainbow !== "boolean")
    throw new Error("Invalid lighting preset");
  integer(c.mode, 0, 19);
  integer(c.brightness, 0, 5);
  integer(c.speed, 0, 5);
  integer(c.direction, 0, 3);
  return c;
}
export function command(op: number, sub = 0, value = 1) {
  integer(value, 0, 65535);
  const p = new Uint8Array(64);
  p.set([4, op, sub]);
  new DataView(p.buffer).setUint16(8, value, true);
  return p;
}
export function lightingPacket(c: Lighting) {
  validateLighting(c);
  const p = new Uint8Array(64);
  p.set([
    c.mode === 0 ? 2 : c.mode === 1 ? 7 : c.mode,
    ...c.color
      .slice(1)
      .match(/../g)!
      .map((h) => parseInt(h, 16)),
  ]);
  p.set(
    [
      +c.rainbow,
      c.mode === 0 ? 0 : c.brightness,
      c.mode <= 1 ? 0 : c.speed,
      c.direction,
    ],
    8,
  );
  p.set([0x55, 0xaa], 14);
  return p;
}
export function clockPacket(d = new Date()) {
  if (!Number.isFinite(+d) || d.getFullYear() < 2000 || d.getFullYear() > 2099)
    throw new Error("Clock year must be 2000–2099");
  const p = new Uint8Array(64);
  p.set([
    0,
    1,
    0x5a,
    d.getFullYear() - 2000,
    d.getMonth() + 1,
    d.getDate(),
    d.getHours(),
    d.getMinutes(),
    d.getSeconds(),
  ]);
  p[10] = 4;
  p.set([0xaa, 0x55], 62);
  return p;
}
export function payload(view: DataView, size = 64) {
  const b = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
  if (b.length === size) return b;
  if (b.length === size + 1 && b[0] === 0) return b.subarray(1);
  throw new Error("Unexpected report length");
}
export function validateAck(p: Uint8Array, op: number) {
  if (p.length !== 64 || p[0] !== 4 || p[1] !== op || p[3] !== 1)
    throw new Error(
      `Missing or refused acknowledgement for 0x${op.toString(16)}. Reconnect and explicitly retry.`,
    );
}
export function batteryPercent(p: Uint8Array) {
  return p.length === 64 && p[0] === 0x20 && p[1] === 1 && p[3] <= 100
    ? p[3]
    : null;
}
export type Frame = { pixels: Uint8Array; delay: number };
export function rgb565(rgba: Uint8ClampedArray) {
  if (rgba.length !== 128 * 128 * 4)
    throw new Error("Expected 128 × 128 pixels");
  const b = new Uint8Array(32768);
  for (let i = 0, j = 0; i < rgba.length; i += 4, j += 2) {
    const alpha = rgba[i + 3] / 255;
    const r = Math.round(rgba[i] * alpha),
      g = Math.round(rgba[i + 1] * alpha),
      bl = Math.round(rgba[i + 2] * alpha);
    const v = ((r >> 3) << 11) | ((g >> 2) << 5) | (bl >> 3);
    b[j] = v & 255;
    b[j + 1] = v >> 8;
  }
  return b;
}
export function encodeAnimation(frames: Frame[]) {
  if (!frames.length || frames.length > 30)
    throw new Error("Choose 1–30 frames");
  const b = new Uint8Array(
    Math.ceil((256 + frames.length * 32768) / 4096) * 4096,
  ).fill(255);
  b[0] = frames.length;
  frames.forEach((f, i) => {
    if (f.pixels.length !== 32768 || !Number.isFinite(f.delay) || f.delay < 0)
      throw new Error("Invalid frame");
    b[i + 1] =
      frames.length === 1
        ? 0
        : Math.max(1, Math.min(255, Math.floor(f.delay / 2)));
    b.set(f.pixels, 256 + i * 32768);
  });
  return b;
}
