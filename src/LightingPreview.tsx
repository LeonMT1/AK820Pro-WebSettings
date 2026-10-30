import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import { KeyboardArtwork } from "./KeyboardArtwork";
import { keys, type Geometry, type Region } from "./layouts";
import {
  effectColor,
  effectLevel,
  keyIdForCode,
  reactiveModes,
  type Hit,
} from "./lighting-effects";
import type { Lighting } from "./protocol";
export function LightingPreview({
  config,
  geometry,
  region,
}: {
  config: Lighting;
  geometry: Geometry;
  region: Region;
}) {
  const [paused, setPaused] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const board = useRef<HTMLDivElement>(null),
    hits = useRef<Hit[]>([]),
    clock = useRef(0),
    current = useRef(config);
  current.current = config;
  const press = (id: string) => {
    const key = keys(geometry, "us").find((k) => k.id === id);
    if (key) {
      hits.current.push({
        id,
        x: key.x + key.w / 2,
        y: key.y + 0.5,
        time: clock.current,
      });
      if (hits.current.length > 16) hits.current.shift();
    }
  };
  useEffect(() => {
    const query = matchMedia("(prefers-reduced-motion: reduce)");
    const changed = () => {
      if (query.matches) setPaused(true);
    };
    query.addEventListener("change", changed);
    return () => query.removeEventListener("change", changed);
  }, []);
  useEffect(() => {
    hits.current = [];
  }, [config.mode, geometry]);
  useEffect(() => {
    const map = keys(geometry, region),
      elements = board.current?.querySelectorAll<HTMLElement>("[data-key-id]");
    let raf = 0,
      last = 0,
      drawn = -Infinity,
      needsDraw = true;
    const draw = (now: number) => {
      const elapsed = last ? Math.min((now - last) / 1000, 0.1) : 0;
      last = now;
      if (!paused && !document.hidden) clock.current += elapsed;
      if (!document.hidden && (needsDraw || !paused) && now - drawn >= 33) {
        drawn = now;
        needsDraw = false;
        const cfg = current.current;
        while (hits.current.length && clock.current - hits.current[0].time > 12)
          hits.current.shift();
        if (elements)
          for (let i = 0; i < elements.length; i++) {
            const element = elements[i],
              key = map[i];
            element.style.setProperty(
              "--led",
              effectColor(cfg, key, i, clock.current),
            );
            element.style.setProperty(
              "--led-strength",
              String(effectLevel(cfg, key, i, clock.current, hits.current)),
            );
          }
      }
      if (!paused) raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [geometry, region, paused, config]);
  function keyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.repeat || e.metaKey || e.ctrlKey || e.altKey || e.code === "Tab")
      return;
    const target = e.target as HTMLElement;
    if (["Space", "Enter"].includes(e.code) && target.closest("button")) return;
    if (target.closest("input,select,textarea,button:not([data-key-id])"))
      return;
    const id = keyIdForCode(e.code, keys(geometry, "us"));
    if (id) {
      e.preventDefault();
      press(id);
    }
  }
  return (
    <section
      className="effect-preview"
      aria-label="Animated lighting preview"
      onKeyDown={keyDown}
    >
      <div
        ref={board}
        className="effect-board"
        tabIndex={0}
        aria-label="Focus to test lighting with your keyboard"
      >
        {geometry === "ansi" ? (
          <KeyboardArtwork
            region={region}
            color={config.color}
            brightness={config.brightness}
            onSelect={press}
          />
        ) : (
          <div
            className="effect-schematic"
            role="group"
            aria-label="ISO effect preview keys"
          >
            {keys(geometry, region).map((k) => (
              <button
                key={k.id}
                data-key-id={k.id}
                className="vendor-key"
                aria-label={`${k.label} preview key`}
                style={
                  {
                    left: `${(k.x / 16.5) * 100}%`,
                    top: `${(k.y / 6.4) * 100}%`,
                    width: `${((k.w - 0.12) / 16.5) * 100}%`,
                    height: `${(0.85 / 6.4) * 100}%`,
                    "--led": config.color,
                    "--led-strength": "0",
                  } as CSSProperties
                }
                onClick={() => press(k.id)}
              >
                {k.label}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="effect-caption">
        <div className="effect-copy">
          <p>
            {reactiveModes.has(config.mode)
              ? "Click a key or focus the preview and type to try this reactive effect."
              : "Preview updates with effect, color, speed, brightness and direction."}
          </p>
          <p>
            Illustrative simulation, not a frame-exact recording of the firmware.
            Clicking preview keys never sends a device command. Motion starts
            paused when reduced motion is requested.
          </p>
        </div>
        <button aria-pressed={paused} onClick={() => setPaused((v) => !v)}>
          {paused ? "Play effects" : "Pause effects"}
        </button>
      </div>
    </section>
  );
}
