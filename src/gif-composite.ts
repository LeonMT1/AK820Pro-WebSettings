export type Patch = {
  dims: { width: number; height: number; left: number; top: number };
  patch: Uint8ClampedArray;
  disposalType: number;
  delay: number;
};
export function composite(
  width: number,
  height: number,
  patches: Patch[],
  background = [0, 0, 0, 0],
) {
  const screen = new Uint8ClampedArray(width * height * 4);
  const clear = (x: number, y: number, w: number, h: number) => {
    for (let j = y; j < y + h; j++)
      for (let i = x; i < x + w; i++)
        screen.set(background, (j * width + i) * 4);
  };
  clear(0, 0, width, height);
  return patches.map((f) => {
    const { left, top, width: w, height: h } = f.dims;
    if (
      left < 0 ||
      top < 0 ||
      left + w > width ||
      top + h > height ||
      f.patch.length !== w * h * 4
    )
      throw new Error("GIF frame outside canvas");
    const before = f.disposalType === 3 ? screen.slice() : null;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const si = (y * w + x) * 4;
        if (f.patch[si + 3])
          screen.set(
            f.patch.subarray(si, si + 4),
            ((y + top) * width + x + left) * 4,
          );
      }
    const result = {
      rgba: screen.slice(),
      width,
      height,
      delay: f.delay || 100,
    };
    if (f.disposalType === 2) clear(left, top, w, h);
    if (before) screen.set(before);
    return result;
  });
}
