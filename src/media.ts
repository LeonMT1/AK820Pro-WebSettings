import { rgb565, type Frame } from "./protocol";
export type SourceFrame = {
  rgba: Uint8ClampedArray;
  width: number;
  height: number;
  delay: number;
};
export type Edit = {
  fit: "cover" | "contain";
  zoom: number;
  rotation: number;
  x: number;
  y: number;
  start: number;
  end: number;
  speed: number;
};
export const editDefaults: Edit = {
  fit: "cover",
  zoom: 1,
  rotation: 0,
  x: 0,
  y: 0,
  start: 0,
  end: 29,
  speed: 1,
};
export function checkSize(width: number, height: number, count = 1) {
  if (
    !width ||
    !height ||
    width > 4096 ||
    height > 4096 ||
    count > 120 ||
    width * height * count > 32_000_000
  )
    throw new Error(
      "Media too large. Use at most 4096 px, 120 source frames and 32 million total pixels.",
    );
}
export async function loadMedia(file: File): Promise<SourceFrame[]> {
  if (file.size > 20 * 1024 * 1024)
    throw new Error("Maximum file size is 20 MB");
  if (
    !["image/png", "image/jpeg", "image/webp", "image/gif"].includes(file.type)
  )
    throw new Error("Choose PNG, JPEG, WebP or GIF");
  if (file.type === "image/gif")
    return new Promise((resolve, reject) => {
      const worker = new Worker(new URL("./gif.worker.ts", import.meta.url), {
        type: "module",
      });
      const timer = setTimeout(() => {
        worker.terminate();
        reject(new Error("GIF decoding timed out"));
      }, 10000);
      worker.onmessage = (e) => {
        clearTimeout(timer);
        worker.terminate();
        e.data.error ? reject(new Error(e.data.error)) : resolve(e.data.frames);
      };
      worker.onerror = () => {
        clearTimeout(timer);
        worker.terminate();
        reject(new Error("Malformed GIF"));
      };
      file
        .arrayBuffer()
        .then((b) => worker.postMessage(b, [b]))
        .catch(reject);
    });
  const bitmap = await createImageBitmap(file);
  try {
    checkSize(bitmap.width, bitmap.height);
    const c = document.createElement("canvas");
    c.width = bitmap.width;
    c.height = bitmap.height;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(bitmap, 0, 0);
    return [
      {
        rgba: ctx.getImageData(0, 0, c.width, c.height).data,
        width: c.width,
        height: c.height,
        delay: 100,
      },
    ];
  } finally {
    bitmap.close();
  }
}
export function convert(source: SourceFrame[], edit: Edit): Frame[] {
  if (edit.end < edit.start || edit.end - edit.start >= 30)
    throw new Error("Trim to 1–30 frames");
  if (edit.speed <= 0 || !Number.isFinite(edit.speed))
    throw new Error("Invalid playback speed");
  return source.slice(edit.start, edit.end + 1).map((f) => {
    const s = document.createElement("canvas");
    s.width = f.width;
    s.height = f.height;
    s.getContext("2d")!.putImageData(
      new ImageData(new Uint8ClampedArray(f.rgba), f.width, f.height),
      0,
      0,
    );
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "black";
    ctx.fillRect(0, 0, 128, 128);
    ctx.translate(64 + edit.x, 64 + edit.y);
    ctx.rotate((edit.rotation * Math.PI) / 180);
    const swap = edit.rotation % 180 !== 0;
    const w = swap ? f.height : f.width,
      h = swap ? f.width : f.height;
    const scale =
      (edit.fit === "cover"
        ? Math.max(128 / w, 128 / h)
        : Math.min(128 / w, 128 / h)) * edit.zoom;
    ctx.scale(scale, scale);
    ctx.drawImage(s, -f.width / 2, -f.height / 2);
    return {
      pixels: rgb565(ctx.getImageData(0, 0, 128, 128).data),
      delay: Math.max(
        2,
        Math.min(510, Math.floor(f.delay / edit.speed / 2) * 2),
      ),
    };
  });
}
export function drawFrame(canvas: HTMLCanvasElement, frame: Frame) {
  const ctx = canvas.getContext("2d")!,
    img = ctx.createImageData(128, 128);
  for (let i = 0, j = 0; i < frame.pixels.length; i += 2, j += 4) {
    const v = frame.pixels[i] | (frame.pixels[i + 1] << 8);
    img.data[j] = Math.round(((v >> 11) * 255) / 31);
    img.data[j + 1] = Math.round((((v >> 5) & 63) * 255) / 63);
    img.data[j + 2] = Math.round(((v & 31) * 255) / 31);
    img.data[j + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}
export function textSource(
  text: string,
  scroll: boolean,
  color: string,
): SourceFrame[] {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d")!;
  ctx.font = "bold 24px monospace";
  const width = ctx.measureText(text).width;
  return Array.from({ length: scroll ? 30 : 1 }, (_, i) => {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = color;
    ctx.textBaseline = "middle";
    ctx.fillText(
      text,
      scroll ? 128 - (i * (width + 128)) / 29 : Math.max(0, (128 - width) / 2),
      64,
    );
    return {
      rgba: ctx.getImageData(0, 0, 128, 128).data,
      width: 128,
      height: 128,
      delay: 100,
    };
  });
}
export function diagnosticSource(animated = false): SourceFrame[] {
  return Array.from({ length: animated ? 8 : 1 }, (_, i) => {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const ctx = c.getContext("2d")!;
    ["#f00", "#0f0", "#00f", "#fff"].forEach((color, n) => {
      ctx.fillStyle = color;
      ctx.fillRect((n % 2) * 64, Math.floor(n / 2) * 64, 64, 64);
    });
    ctx.fillStyle = "#000";
    ctx.fillRect(8 + i * 12, 52, 16, 24);
    return {
      rgba: ctx.getImageData(0, 0, 128, 128).data,
      width: 128,
      height: 128,
      delay: 160,
    };
  });
}
