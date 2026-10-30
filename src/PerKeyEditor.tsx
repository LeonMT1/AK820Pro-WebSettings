import { notify } from "./Toasts";
import { useCallback, useState, type CSSProperties } from "react";
import { keys, type Geometry, type Region } from "./layouts";
import {
  blankColors,
  experimentalAnsiMap,
  paint,
  parseColorLayout,
  type KeyColors,
  type ColorLayout,
  type ColorPreset,
} from "./per-key";
import { readLocal } from "./storage";
import type { Transport } from "./hid";
import { KeyboardArtwork } from "./KeyboardArtwork";
function savedPresets(): ColorPreset[] {
  const raw = readLocal<unknown>("ak820-key-presets", []);
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 100).flatMap((p) => {
    try {
      if (
        typeof p.id !== "string" ||
        typeof p.name !== "string" ||
        !p.name.trim() ||
        p.name.length > 80
      )
        return [];
      return [{ ...parseColorLayout(p), id: p.id, name: p.name }];
    } catch {
      return [];
    }
  });
}
function initialColors(geometry: Geometry) {
  try {
    const draft = parseColorLayout(
      readLocal(`ak820-key-draft-${geometry}`, null),
    );
    return draft.geometry === geometry ? draft.colors : blankColors(geometry);
  } catch {
    return blankColors(geometry);
  }
}
function contrast(hex: string) {
  const [r, g, b] = hex
    .slice(1)
    .match(/../g)!
    .map((v) => parseInt(v, 16));
  return (r * 299 + g * 587 + b * 114) / 1000 > 145 ? "#102018" : "#ffffff";
}
function exportLayout(value: ColorLayout) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = `ak820-per-key-${value.geometry}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function PerKeyEditor({
  geometry,
  region,
  ready,
  transport,
}: {
  geometry: Geometry;
  region: Region;
  ready: boolean;
  transport?: Transport;
}) {
  const [colors, setColors] = useState<KeyColors>(() =>
    initialColors(geometry),
  );
  const [selected, setSelected] = useState<string[]>([]),
    [color, setColor] = useState("#b3efce"),
    [brightness, setBrightness] = useState(1);
  const [presets, setPresets] = useState<ColorPreset[]>(savedPresets),
    [name, setName] = useState("My key colours");
  const [message, updateMessage] = useState(
      "Start with a black draft, or load a saved layout. No keyboard colours are read back.",
    ),
    [error, updateError] = useState("");
  const setMessage = useCallback(
    (message: string) => {
      updateMessage(message);
      if (
        !message.startsWith("Sending") &&
        !message.startsWith("Write stopped")
      )
        notify(message, "success");
    },
    [notify],
  );
  const setError = useCallback(
    (message: string) => {
      updateError(message);
      if (message) notify(message, "error");
    },
    [notify],
  );
  const [undo, setUndo] = useState<KeyColors>();
  const [applying, setApplying] = useState(false);
  const map = experimentalAnsiMap(geometry, region),
    canonical = keys(geometry, "us");
  const experimental = geometry === "ansi";
  const layout = (value = colors): ColorLayout => ({
    version: 1,
    geometry,
    colors: value,
  });
  function change(next: KeyColors) {
    setUndo(colors);
    setColors(next);
    setError("");
    try {
      localStorage.setItem(
        `ak820-key-draft-${geometry}`,
        JSON.stringify(layout(next)),
      );
      setMessage("Draft saved locally. Nothing sent to the keyboard.");
    } catch {
      setError(
        "Preview updated, but this browser could not save the draft. Export JSON to keep it.",
      );
    }
  }
  function store(next: ColorPreset[]) {
    localStorage.setItem("ak820-key-presets", JSON.stringify(next));
    setPresets(next);
  }
  function attempt(action: () => void) {
    setError("");
    try {
      action();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function group(labels: string[]) {
    setSelected(
      canonical.filter((k) => labels.includes(k.label)).map((k) => k.id),
    );
  }
  return (
    <section className="card per-key-editor" aria-label="Per-key color editor">
      <h2>Select keys to paint</h2>
      <p>
        Click keys to select or deselect them, then paint your selection. Tab
        between keys and press Space or Enter to select. Colours stay with
        physical positions when legends change.
      </p>
      {error && (
        <div className="notice error" role="alert">
          {error}
        </div>
      )}
      <div className="button-row" aria-label="Key selection">
        <button onClick={() => setSelected(map.map((k) => k.id))}>
          Select all keys
        </button>
        <button onClick={() => group(["W", "A", "S", "D"])}>Select WASD</button>
        <button onClick={() => group(["↑", "←", "↓", "→"])}>
          Select arrows
        </button>
        <button disabled={!selected.length} onClick={() => setSelected([])}>
          Deselect keys
        </button>
        <span className="muted selection-count" role="status">
          {selected.length} keys selected
        </span>
      </div>
      <div className="paint-scroll">
        {geometry === "ansi" ? (
          <KeyboardArtwork
            region={region}
            colors={colors}
            selected={selected}
            onSelect={(id) =>
              setSelected((ids) =>
                ids.includes(id) ? ids.filter((v) => v !== id) : [...ids, id],
              )
            }
          />
        ) : (
          <>
            <div
              className="paint-keyboard"
              role="group"
              aria-label={`${geometry.toUpperCase()} keys`}
            >
              {map.map((key) => (
                <button
                  key={key.id}
                  type="button"
                  aria-label={`${key.label} key, ${colors[key.id]}`}
                  aria-pressed={selected.includes(key.id)}
                  title={`${key.label} · ${colors[key.id]}`}
                  className="paint-key"
                  style={
                    {
                      left: `${(key.x / 16.5) * 100}%`,
                      top: `${(key.y / 6.4) * 100}%`,
                      width: `${((key.w - 0.1) / 16.5) * 100}%`,
                      height: `${(0.9 / 6.4) * 100}%`,
                      backgroundColor: colors[key.id],
                      color: contrast(colors[key.id]),
                    } as CSSProperties
                  }
                  onClick={() =>
                    setSelected((ids) =>
                      ids.includes(key.id)
                        ? ids.filter((id) => id !== key.id)
                        : [...ids, key.id],
                    )
                  }
                >
                  {key.label === "Space" ? "Space" : key.label}
                  <span aria-hidden="true" className="key-selection-mark">
                    {selected.includes(key.id) ? "✓" : ""}
                  </span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
      <div className="paint-controls">
        <div>
          <label className="field">
            <span>Paint color</span>
            <input
              type="color"
              aria-label="Paint color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
            />
          </label>
          <label className="field">
            <span>Hex color</span>
            <input
              aria-label="Hex color"
              value={color}
              maxLength={7}
              onChange={(e) => setColor(e.target.value)}
              onBlur={() => {
                if (!/^#[\da-f]{6}$/i.test(color)) setColor("#b3efce");
              }}
            />
          </label>
        </div>
        <div className="button-row">
          <button
            className="primary"
            disabled={!selected.length || !/^#[\da-f]{6}$/i.test(color)}
            onClick={() =>
              attempt(() => change(paint(colors, selected, color)))
            }
          >
            Paint selected keys
          </button>
          <button
            disabled={!selected.length}
            onClick={() => change(paint(colors, selected, "#000000"))}
          >
            Turn selected keys off
          </button>
          <button
            disabled={!undo}
            onClick={() => {
              if (undo) {
                const previous = undo;
                change(previous);
                setUndo(undefined);
              }
            }}
          >
            Undo color change
          </button>
        </div>
        <p className="fine">
          Black means LED off. Unpainted keys remain black. The preview shows
          colours with illustrative glow. Actual keycap colours and LED output
          may differ.
        </p>
      </div>
      <div className="grid">
        <div>
          <h3>Save your color layout</h3>
          <label className="field">
            <span>Color layout name</span>
            <input
              aria-label="Color layout name"
              maxLength={80}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <div className="button-row">
            <button
              disabled={!name.trim() || presets.length >= 100}
              onClick={() =>
                attempt(() => {
                  store([
                    ...presets,
                    { ...layout(), id: crypto.randomUUID(), name: name.trim() },
                  ]);
                  setMessage("Color layout saved in this browser.");
                })
              }
            >
              Save color layout
            </button>
            <button onClick={() => exportLayout(layout())}>
              Export color JSON
            </button>
            <label className="button">
              Import color JSON
              <input
                className="import"
                aria-label="Import color JSON"
                type="file"
                accept="application/json,.json"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (!f) return;
                  setError("");
                  try {
                    if (f.size > 100_000)
                      throw new Error("Color layout file too large");
                    const incoming = parseColorLayout(
                      JSON.parse(await f.text()),
                    );
                    if (incoming.geometry !== geometry)
                      throw new Error(
                        `Choose ${incoming.geometry.toUpperCase()} geometry before importing this layout.`,
                      );
                    change(incoming.colors);
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              />
            </label>
          </div>
          <p className="fine">
            ANSI and ISO drafts are stored separately. JSON contains colours and
            geometry only; importing never enables device writes.
          </p>
        </div>
        <div>
          <h3>Apply to your keyboard</h3>
          <label className="field">
            <span>Per-key brightness · {brightness}</span>
            <input
              aria-label="Per-key brightness"
              type="range"
              min={0}
              max={5}
              value={brightness}
              onChange={(e) => setBrightness(+e.target.value)}
            />
          </label>
          <div className="notice">
            {experimental
              ? "Experimental ANSI write: this community LED map is unverified on your unit. Apply replaces the entire color bank, including unpainted keys (black/off). The existing bank cannot be backed up. Start at low brightness and check W/A/S/D/E."
              : "ISO hardware mapping is unknown. Editing is available, but ISO writes remain disabled."}
          </div>
          <button
            className="primary"
            disabled={
              !ready ||
              !experimental ||
              applying ||
              transport?.fault ||
              transport?.disconnected
            }
            onClick={async () => {
              if (!transport || !experimental || applying) return;
              setApplying(true);
              setError("");
              setMessage("Sending experimental ANSI color layout…");
              try {
                await transport.perKey(map, colors, brightness, true);
                setMessage(
                  "Per-key transaction acknowledged. Check the physical keyboard; the mapping remains unverified.",
                );
              } catch (e) {
                setError((e as Error).message);
                setMessage(
                  "Write stopped. Reconnect before explicitly retrying.",
                );
              } finally {
                setApplying(false);
              }
            }}
          >
            Apply key colours
          </button>
        </div>
      </div>
      <div className="status" role="status" aria-live="polite">
        {message}
      </div>
      <h3>Saved color layouts</h3>
      {!presets.length && (
        <div className="empty">No color layouts saved yet.</div>
      )}
      {presets.map((p) => (
        <div className="saved-row" key={p.id}>
          <div>
            <b>{p.name}</b>
            <small>
              {p.geometry.toUpperCase()} · {Object.keys(p.colors).length} key
              colours
            </small>
          </div>
          <button
            disabled={p.geometry !== geometry}
            onClick={() => change({ ...p.colors })}
          >
            Load color draft
          </button>
          <button
            onClick={() =>
              attempt(() => {
                store(presets.filter((v) => v.id !== p.id));
                setMessage("Color layout deleted locally.");
              })
            }
          >
            Delete color layout
          </button>
        </div>
      ))}
    </section>
  );
}
