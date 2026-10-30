import { parseGIF, decompressFrames } from "gifuct-js";
import { composite } from "./gif-composite";

self.onmessage = (e) => {
  try {
    const gif = parseGIF(e.data);
    const { width, height } = gif.lsd;
    const count = gif.frames.filter((f) => "image" in f).length;
    if (
      !width ||
      !height ||
      width > 4096 ||
      height > 4096 ||
      count < 1 ||
      count > 120 ||
      width * height * count > 32_000_000
    )
      throw new Error(
        "GIF exceeds dimensions, frame count or decoded pixel budget",
      );
    for (const f of gif.frames) {
      if ("image" in f) {
        const d = f.image.descriptor;
        if (
          d.width * d.height > width * height ||
          d.left + d.width > width ||
          d.top + d.height > height
        )
          throw new Error("Malformed GIF dimensions");
      }
    }
    const patches = decompressFrames(gif, true);
    const bg = gif.gct?.[gif.lsd.backgroundColorIndex];
    const transparent = patches.some((f) => f.transparentIndex !== undefined);
    const frames = composite(
      width,
      height,
      patches,
      !transparent && bg ? [...bg, 255] : [0, 0, 0, 0],
    );
    self.postMessage({ frames });
  } catch (err) {
    self.postMessage({
      error: err instanceof Error ? err.message : "Malformed GIF",
    });
  }
};
