// Adapted from allshouldbeready/ak820-pro-macos (MIT); see THIRD_PARTY.md.
const clamp = (value: number) => Math.max(0, Math.min(1, value));

export function reactionLevel(
  mode: string,
  x: number,
  y: number,
  originX: number,
  originY: number,
  age: number,
  speed: number,
): number {
  const time = age * (0.3 + speed * 0.3);
  const dx = Math.abs(x - originX);
  if (mode === "launch") {
    return clamp((0.65 - Math.abs(dx - time * 8)) / 0.15);
  }
  const horizontalReach = Math.max(originX, 16.5 - originX);
  const verticalReach = Math.max(originY, 5.5 - originY);
  const rowOnly = mode === "explode";
  if (rowOnly && Math.abs(y - originY) > 0.25) return 0;
  const distance = rowOnly ? dx : Math.hypot(dx, y - originY);
  const reach = rowOnly
    ? horizontalReach
    : Math.hypot(horizontalReach, verticalReach);
  if (mode === "ripples") {
    const bandWidth = 16.5 / 2;
    const edge = 0.4;
    const front = ((reach + bandWidth + edge) * time) / (0.8 * 1.2);
    const lightOn = clamp((front - distance) / edge);
    const lightOff = clamp((front - bandWidth - distance) / edge);
    return lightOn * (1 - lightOff);
  }
  const travel = time * 9;
  const spread = clamp((travel - distance) / 0.65 + 1);
  const fade = clamp(1 - Math.max(0, time - reach / 9 - 0.15) / 0.8);
  return spread * fade;
}
