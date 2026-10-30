import type { CSSProperties } from "react";
import rectangles from "./vendor-keyboard.json";
import { experimentalAnsiMap, type KeyColors } from "./per-key";
import type { Region } from "./layouts";
export function artworkKeys(region: Region) {
  return experimentalAnsiMap("ansi", region).map((key) => {
    const rect = rectangles.keys.find((r) => r.led === key.led);
    if (!rect) throw new Error(`Missing vendor rectangle for ${key.id}`);
    return { ...key, rect };
  });
}
export function KeyboardArtwork({
  region,
  colors,
  color = "#000000",
  brightness = 5,
  selected = [],
  onSelect,
}: {
  region: Region;
  colors?: KeyColors;
  color?: string;
  brightness?: number;
  selected?: string[];
  onSelect?: (id: string) => void;
}) {
  return (
    <div
      className={`vendor-keyboard ${onSelect ? "interactive" : ""}`}
      role={onSelect ? "group" : "img"}
      aria-label={
        onSelect ? "ANSI keys" : "AK820 Pro ANSI keyboard lighting preview"
      }
    >
      <img
        src={`${import.meta.env.BASE_URL}keyboard.webp`}
        width={rectangles.width}
        height={rectangles.height}
        alt=""
        draggable={false}
        fetchPriority="high"
      />
      {artworkKeys(region).map((key) => {
        const paint = colors?.[key.id] ?? color;
        const lit = paint !== "#000000" && brightness > 0;
        const style = {
          left: `${(key.rect.x / rectangles.width) * 100}%`,
          top: `${(key.rect.y / rectangles.height) * 100}%`,
          width: `${(key.rect.w / rectangles.width) * 100}%`,
          height: `${(key.rect.h / rectangles.height) * 100}%`,
          "--led": paint,
          "--led-strength": String(
            lit ? Math.min(1, Math.max(0, brightness / 5)) : 0,
          ),
        } as CSSProperties;
        const content = (
          <>
            <span>{key.label}</span>
            {onSelect && (
              <span aria-hidden="true" className="key-selection-mark">
                {selected.includes(key.id) ? "✓" : ""}
              </span>
            )}
          </>
        );
        return onSelect ? (
          <button
            key={key.id}
            data-key-id={key.id}
            type="button"
            className="vendor-key"
            style={style}
            aria-label={`${key.label} key, ${paint}`}
            aria-pressed={selected.includes(key.id)}
            title={`${key.label} · ${paint}`}
            onClick={() => onSelect(key.id)}
          >
            {content}
          </button>
        ) : (
          <span
            key={key.id}
            data-key-id={key.id}
            className="vendor-key"
            style={style}
            aria-hidden="true"
          >
            {content}
          </span>
        );
      })}
    </div>
  );
}
