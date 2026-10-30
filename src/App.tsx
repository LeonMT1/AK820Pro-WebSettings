import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useId,
  cloneElement,
  type ReactElement,
  type ReactNode,
} from "react";
import { hid, classify, flatten, Transport, type Device } from "./hid";
const PerKeyEditor = lazy(() =>
  import("./PerKeyEditor").then((module) => ({ default: module.PerKeyEditor })),
);
import { KeyboardArtwork } from "./KeyboardArtwork";
const LightingPreview = lazy(() =>
  import("./LightingPreview").then((module) => ({
    default: module.LightingPreview,
  })),
);
import { SystemControls } from "./SystemControls";
import {
  systemDefaults,
  validateSystemSettings,
  type SystemSettings,
} from "./system-settings";
import {
  defaults,
  modes,
  lightingPacket,
  clockPacket,
  batteryPercent,
  type Frame,
  type Lighting,
} from "./protocol";
import { keys, type Geometry, type Region } from "./layouts";
import {
  loadMedia,
  convert,
  drawFrame,
  textSource,
  diagnosticSource,
  editDefaults,
  type SourceFrame,
  type Edit,
} from "./media";
import {
  history,
  readLocal,
  parsePresets,
  type Upload,
  type Preset,
} from "./storage";
import { sections, useRoute } from "./routing";
import { notify } from "./Toasts";
function Field({ label, children }: { label: string; children: ReactNode }) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {cloneElement(children as ReactElement<{ id: string }>, { id })}
    </div>
  );
}
function Range({
  label,
  value,
  min = 0,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  return (
    <Field label={`${label} · ${value}`}>
      <input
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(+e.target.value)}
      />
    </Field>
  );
}
function download(name: string, data: unknown) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function App() {
  const { section, lightingView, navigate } = useRoute();
  const setSection = navigate;
  const setLightingView = (view: "effects" | "keys") =>
    navigate("Lighting", view);
  const [transport, setTransport] = useState<Transport>();
  const transportRef = useRef<Transport | undefined>(undefined);
  const [busy, setBusy] = useState(false),
    [status, updateStatus] = useState("Connect your keyboard to begin."),
    [error, updateError] = useState(""),
    [logs, setLogs] = useState<string[]>([]);
  const setStatus = useCallback(
    (message: string) => {
      updateStatus(message);
      notify(message, /disconnect|cancel/i.test(message) ? "info" : "success");
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
  const [caps, setCaps] = useState<ReturnType<typeof classify>>();
  const [tested, setTested] = useState(false);
  const [battery, setBattery] = useState<number | null>(null);
  const [layout, setLayout] = useState<Geometry>(() =>
    readLocal<string>("ak820-layout", "ansi") === "iso" ? "iso" : "ansi",
  );
  const [region, setRegion] = useState<Region>(() => {
    const r = readLocal<string>("ak820-region", "us");
    return r === "uk" || r === "de" ? r : "us";
  });
  const [lighting, setLighting] = useState<Lighting>({ ...defaults });
  const [system, setSystem] = useState<SystemSettings>(() => {
    try {
      return validateSystemSettings(
        readLocal("ak820-system-draft", systemDefaults),
      );
    } catch {
      return { ...systemDefaults };
    }
  });
  const sleep = system.sleep;
  useEffect(() => {
    try {
      localStorage.setItem("ak820-system-draft", JSON.stringify(system));
    } catch {
      setError("Keyboard settings draft could not be saved locally.");
    }
  }, [system]);
  const [source, setSource] = useState<SourceFrame[]>([]),
    [mediaName, setMediaName] = useState("Untitled display"),
    [edit, setEdit] = useState<Edit>({ ...editDefaults }),
    [text, setText] = useState("HELLO"),
    [scroll, setScroll] = useState(false);
  const [playing, setPlaying] = useState(true),
    [frameIndex, setFrameIndex] = useState(0),
    [progress, setProgress] = useState(0),
    [replace, setReplace] = useState(false),
    [historyItems, setHistory] = useState<Upload[]>([]);
  const [presets, setPresets] = useState<Preset[]>(() => {
      try {
        return parsePresets(readLocal("ak820-presets", []));
      } catch {
        return [];
      }
    }),
    [presetName, setPresetName] = useState("My setup");
  const canvas = useRef<HTMLCanvasElement>(null),
    cancel = useRef<AbortController | undefined>(undefined);
  const log = (s: string) =>
    setLogs((v) => [
      ...v.slice(-199),
      `${new Date().toLocaleTimeString()}  ${s}`,
    ]);
  const supported = !!hid && window.isSecureContext;
  useEffect(() => {
    transportRef.current = transport;
  }, [transport]);
  useEffect(() => {
    history("list")
      .then(setHistory)
      .catch((e) => setError(`Upload history unavailable: ${e.message}`));
    const disconnected = (e: Event) => {
      const d = (e as Event & { device: Device }).device;
      const t = transportRef.current;
      if (t && !t.disconnected && (d === t.control || d === t.display)) {
        t.disconnect();
        setTested(false);
        setStatus("Keyboard disconnected. Reconnect to retry.");
      }
    };
    hid?.addEventListener("disconnect", disconnected);
    return () => {
      hid?.removeEventListener("disconnect", disconnected);
      void transportRef.current?.close();
    };
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem("ak820-layout", JSON.stringify(layout));
      localStorage.setItem("ak820-region", JSON.stringify(region));
    } catch {
      setError("Layout could not be saved in this browser.");
    }
  }, [layout, region]);
  const converted = useMemo(() => {
    try {
      return { frames: source.length ? convert(source, edit) : [], error: "" };
    } catch (e) {
      return { frames: [], error: (e as Error).message };
    }
  }, [source, edit]);
  const frames = converted.frames;
  useEffect(() => {
    if (converted.error) notify(converted.error, "error");
  }, [converted.error, notify]);
  useEffect(() => {
    setFrameIndex(0);
  }, [frames]);
  useEffect(() => {
    if (canvas.current && frames.length)
      drawFrame(canvas.current, frames[frameIndex % frames.length]);
    if (!playing || frames.length < 2) return;
    const timer = setTimeout(
      () => setFrameIndex((i) => (i + 1) % frames.length),
      frames[frameIndex % frames.length].delay,
    );
    return () => clearTimeout(timer);
  }, [frames, frameIndex, playing]);
  const run = async (work: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
      log(`ERROR ${message}`);
    } finally {
      setBusy(false);
    }
  };
  const connect = () =>
    run(async () => {
      if (!hid || !supported)
        throw new Error("Use desktop Chrome or Edge on HTTPS or localhost.");
      if (transport) await transport.close();
      setTransport(undefined);
      setCaps(undefined);
      setTested(false);
      setBattery(null);
      const devices = await hid.requestDevice({
        filters: [
          { vendorId: 0x0c45, usagePage: 0xff13 },
          { vendorId: 0x0c45, usagePage: 0xff68 },
        ],
      });
      if (!devices.length) {
        setStatus("Device selection cancelled.");
        return;
      }
      const c = classify(devices);
      const opened: Device[] = [];
      try {
        for (const d of new Set(
          [c.control, c.display].filter(Boolean) as Device[],
        )) {
          if (d.opened)
            throw new Error("Interface already open in another session.");
          await d.open();
          opened.push(d);
        }
        const t = new Transport(c.control, c.display, log);
        await t.read();
        setTransport(t);
        setCaps(c);
        setTested(true);
        log(
          JSON.stringify(
            devices.map((d) => ({
              name: d.productName,
              vendor: d.vendorId,
              product: d.productId,
              collections: flatten(d.collections),
            })),
          ),
        );
        setStatus(
          "Keyboard connected. Browser read-only proof passed. Hardware writes remain unverified.",
        );
      } catch (e) {
        await Promise.allSettled(opened.map((d) => d.close()));
        throw e;
      }
    });
  const ready =
    !!transport &&
    tested &&
    !transport.fault &&
    !transport.disconnected &&
    !busy;
  const setLight = (patch: Partial<Lighting>) =>
    setLighting((v) => ({ ...v, ...patch }));
  const setEditing = (patch: Partial<Edit>) =>
    setEdit((v) => ({ ...v, ...patch }));
  const prepare = (s: SourceFrame[], name: string) => {
    setSource(s);
    setMediaName(name);
    setEdit({ ...editDefaults, end: Math.min(29, s.length - 1) });
    setReplace(false);
    notify(
      `${name} is ready to preview. Nothing sent to the keyboard.`,
      "success",
    );
  };
  const upload = (data: Frame[] = frames, name = mediaName) =>
    run(async () => {
      if (!transport || !replace)
        throw new Error("Confirm replacement before uploading.");
      cancel.current = new AbortController();
      setProgress(0);
      try {
        await transport.upload(data, cancel.current.signal, setProgress);
        setStatus(
          "Upload acknowledged. Check the physical display and persistence.",
        );
        log(
          `Upload acknowledged: ${name}, ${data.length} frame(s). Physical verification pending.`,
        );
        try {
          setHistory(
            await history("save", {
              id: crypto.randomUUID(),
              name,
              date: new Date().toISOString(),
              frames: data,
            }),
          );
        } catch (e) {
          throw new Error(
            `Upload succeeded, but history could not be saved: ${(e as Error).message}`,
          );
        }
      } finally {
        cancel.current = undefined;
        setReplace(false);
      }
    });
  const savePresets = (items: Preset[]) => {
    localStorage.setItem("ak820-presets", JSON.stringify(items));
    setPresets(items);
  };
  return (
    <div className="app">
      <aside className="sidebar">
        <a className="wordmark" href="#/connection" aria-label="AK820Pro home">
          <span>AK820Pro</span>
        </a>
        <nav aria-label="Workspace">
          {sections.map((s, i) => (
            <button
              key={s}
              aria-current={section === s ? "page" : undefined}
              className={section === s ? "nav active" : "nav"}
              onClick={() => setSection(s)}
            >
              <span className="nav-number" aria-hidden="true">
                0{i + 1}
              </span>
              {s}
              {section === s && <span className="nav-dot" />}
            </button>
          ))}
        </nav>
        <div className="connection">
          <div className="connection-status">
            <span
              className={`dot ${tested && !transport?.fault ? "online" : ""}`}
            />
            {tested && !transport?.fault ? "USB connected" : "Not connected"}
          </div>
          <button
            className={section === "Connection" ? "small primary" : "small"}
            aria-label={transport ? "Reconnect" : "Connect keyboard"}
            disabled={busy || !supported}
            onClick={connect}
          >
            {transport ? "Reconnect" : "Connect keyboard"}
          </button>
        </div>
        <footer className="sidebar-bottom">
          <p>Everything stays local. Stock firmware stays installed.</p>
          <p>USB only / use a Chromium Browser</p>
          <a
            href="https://github.com/wsclx/ak820pro-modder/blob/main/docs/MACOS-800A.md"
            target="_blank"
            rel="noreferrer"
          >
            Protocol credits ↗
          </a>
          <small>Made by LeonMT1</small>
        </footer>
      </aside>
      <main id="main">
        <div className="page">
          <div className="heading">
            <div>
              <h1>
                {
                  {
                    Connection: "Connect your AK820 Pro",
                    Lighting: "Keyboard lighting",
                    Display: "Keyboard display",
                    Presets: "Saved presets",
                    Diagnostics: "Connection diagnostics",
                  }[section]
                }
              </h1>
            </div>
          </div>
          {!supported && (
            <div className="notice error" role="alert">
              WebHID is unavailable. Open this site in desktop Chrome or Edge
              over HTTPS or localhost. You can still use the previews and save
              presets.
            </div>
          )}
          {error && (
            <div className="notice error" role="alert">
              {error}
            </div>
          )}
          {section === "Lighting" && (
            <div
              className="lighting-switch"
              role="group"
              aria-label="Lighting editor"
            >
              <button
                aria-pressed={lightingView === "effects"}
                onClick={() => setLightingView("effects")}
              >
                Effects
              </button>
              <button
                aria-pressed={lightingView === "keys"}
                onClick={() => setLightingView("keys")}
              >
                Per-key RGB
              </button>
            </div>
          )}
          {(section !== "Lighting" || lightingView === "effects") && (
            <section className="keyboard-panel" aria-label="Keyboard preview">
              <div
                className="keyboard-scroll"
                tabIndex={0}
                aria-label="Scrollable keyboard preview"
              >
                {section === "Lighting" ? (
                  <Suspense
                    fallback={<p role="status">Loading lighting preview</p>}
                  >
                    <LightingPreview
                      config={lighting}
                      geometry={layout}
                      region={region}
                    />
                  </Suspense>
                ) : layout === "ansi" ? (
                  <KeyboardArtwork
                    region={region}
                    color={lighting.color}
                    brightness={lighting.mode === 0 ? 0 : lighting.brightness}
                  />
                ) : (
                  <>
                    <svg
                      className="keyboard"
                      viewBox="-0.35 -0.4 17.2 7.5"
                      role="img"
                      aria-label={`${layout.toUpperCase()} keyboard schematic with ${region.toUpperCase()} legends. LED mapping unverified.`}
                    >
                      <rect
                        x="-0.3"
                        y="-0.3"
                        width="17"
                        height="7.1"
                        rx=".28"
                        fill="#27312c"
                      />
                      {keys(layout, region).map((k) => (
                        <g key={k.id}>
                          <rect
                            x={k.x + 0.05}
                            y={k.y + 0.05}
                            width={k.w - 0.1}
                            height={k.h - 0.1}
                            rx=".08"
                            fill={
                              ["Esc", "Enter"].includes(k.label)
                                ? "#9bc9ae"
                                : "#d7ddd4"
                            }
                            stroke={
                              lighting.mode === 0 ? "#59675d" : lighting.color
                            }
                            strokeWidth={
                              lighting.mode === 0
                                ? ".015"
                                : String(0.015 + lighting.brightness * 0.012)
                            }
                          />
                          <text
                            x={k.x + 0.17}
                            y={k.y + 0.34}
                            fontSize={k.label.length > 3 ? ".15" : ".19"}
                            fill="#26362d"
                          >
                            {k.label === "Space"
                              ? ""
                              : k.label.replace(" R", "")}
                          </text>
                        </g>
                      ))}
                      <circle cx="15.72" cy=".5" r=".48" fill="#a9b8a8" />
                      <circle cx="15.72" cy=".5" r=".34" fill="#46554a" />
                    </svg>
                  </>
                )}
              </div>
              <div className="preview-footer">
                <div>
                  <label>
                    Geometry{" "}
                    <select
                      aria-label="Geometry"
                      value={layout}
                      onChange={(e) => setLayout(e.target.value as Geometry)}
                    >
                      <option value="ansi">ANSI</option>
                      <option value="iso">ISO · unverified</option>
                    </select>
                  </label>
                  <label>
                    Legends{" "}
                    <select
                      aria-label="Legends"
                      value={region}
                      onChange={(e) => setRegion(e.target.value as Region)}
                    >
                      <option value="us">US</option>
                      <option value="uk">UK · draft</option>
                      <option value="de">DE · draft</option>
                    </select>
                  </label>
                </div>
              </div>
            </section>
          )}
          {section === "Lighting" && lightingView === "keys" && (
            <>
              <div className="button-row">
                <Field label="Editor geometry">
                  <select
                    value={layout}
                    onChange={(e) => setLayout(e.target.value as Geometry)}
                  >
                    <option value="ansi">ANSI</option>
                    <option value="iso">ISO · unverified</option>
                  </select>
                </Field>
                <Field label="Editor legends">
                  <select
                    value={region}
                    onChange={(e) => setRegion(e.target.value as Region)}
                  >
                    <option value="us">US</option>
                    <option value="uk">UK · draft</option>
                    <option value="de">DE · draft</option>
                  </select>
                </Field>
              </div>
              <Suspense fallback={<p role="status">Loading colour editor</p>}>
                <PerKeyEditor
                  key={layout}
                  geometry={layout}
                  region={region}
                  ready={ready}
                  transport={transport}
                />
              </Suspense>
            </>
          )}
          {section === "Connection" && (
            <div className="grid">
              <section className="card">
                <h2>Connect over USB</h2>
                <ol className="steps">
                  <li>
                    Plug in your AK820 Pro over USB and switch it to wired mode.
                    Close other keyboard utilits that could use the AK820Pro.
                  </li>
                  <li>Choose the AK820 in the browser picker.</li>
                  <li>
                    We check if everything is alright and after that you can
                    change your settings.
                  </li>
                </ol>
                <button
                  className="primary"
                  disabled={busy || !supported}
                  onClick={connect}
                >
                  {transport ? "Reconnect and test" : "Connect keyboard"}
                </button>
                <p className="fine">
                  Connecting only reads the keyboard. Settings change only when
                  you explicitly apply them.
                </p>
              </section>
              <section className="card">
                <h2>
                  {caps
                    ? "Legacy interface detected"
                    : "Waiting for your keyboard"}
                </h2>
                <dl>
                  <dt>Transport</dt>
                  <dd>WebHID · USB wired only</dd>
                  <dt>Control</dt>
                  <dd>{caps ? "FF13 · ID 0 · 64 bytes" : "Not tested"}</dd>
                  <dt>Display</dt>
                  <dd>
                    {caps?.display
                      ? "FF68 · ID 0 · 4096 bytes"
                      : "Not selected / not tested"}
                  </dd>
                  <dt>Browser read</dt>
                  <dd>{tested ? "Passed this connection" : "Pending"}</dd>
                </dl>
                <div className="notice">
                  Stock firmware stays installed. This website contains no
                  firmware flashing.
                </div>
                {transport && (
                  <button
                    disabled={busy}
                    onClick={() =>
                      run(async () => {
                        await transport.close();
                        setTransport(undefined);
                        setCaps(undefined);
                        setTested(false);
                        setStatus("Disconnected.");
                      })
                    }
                  >
                    Disconnect
                  </button>
                )}
              </section>
            </div>
          )}
          {section === "Lighting" && lightingView === "effects" && (
            <div className="grid">
              <section className="card">
                <h2>Effect and color</h2>
                <Field label="Effect">
                  <select
                    value={lighting.mode}
                    onChange={(e) => setLight({ mode: +e.target.value })}
                  >
                    {modes.map((m, i) => (
                      <option value={i} key={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </Field>
                <div className="two">
                  <Field label="Color">
                    <input
                      type="color"
                      value={lighting.color}
                      onChange={(e) => setLight({ color: e.target.value })}
                    />
                  </Field>
                  <Field label="Color value">
                    <input
                      value={lighting.color}
                      pattern="#[0-9a-fA-F]{6}"
                      maxLength={7}
                      onChange={(e) => {
                        if (/^#[0-9a-f]{6}$/i.test(e.target.value))
                          setLight({ color: e.target.value });
                      }}
                    />
                  </Field>
                </div>
                <Range
                  label="Brightness"
                  value={lighting.brightness}
                  max={5}
                  onChange={(brightness) => setLight({ brightness })}
                />
                <Range
                  label="Speed"
                  value={lighting.speed}
                  max={5}
                  onChange={(speed) => setLight({ speed })}
                />
                <Field label="Direction (effect dependent)">
                  <select
                    value={lighting.direction}
                    onChange={(e) => setLight({ direction: +e.target.value })}
                  >
                    {["Left", "Down", "Up", "Right"].map((v, i) => (
                      <option value={i} key={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                </Field>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={lighting.rainbow}
                    onChange={(e) => setLight({ rainbow: e.target.checked })}
                  />
                  Rainbow color mode
                </label>
                <button
                  className="primary"
                  disabled={!ready}
                  onClick={() =>
                    run(async () => {
                      await transport!.setting(0x13, lightingPacket(lighting));
                      setStatus(
                        "Lighting transaction acknowledged. Visually verify the result on your keyboard.",
                      );
                    })
                  }
                >
                  Apply lighting
                </button>
              </section>
              <section className="card">
                <h2>Keyboard settings</h2>
                <SystemControls
                  settings={system}
                  onChange={setSystem}
                  ready={ready}
                  onApply={() =>
                    run(async () => {
                      await transport!.system(system);
                      setStatus(
                        "Keyboard settings transaction acknowledged. Physically verify response level, shortcut locks and sleep.",
                      );
                    })
                  }
                />
                <hr />
                <h3>Clock synchronization</h3>
                <p>
                  Send your computer’s current local date and time. This is a
                  single synchronization.
                </p>
                <button
                  disabled={!ready}
                  onClick={() =>
                    run(async () => {
                      await transport!.setting(0x28, clockPacket());
                      setStatus(
                        "Clock transaction acknowledged. Check the keyboard clock page.",
                      );
                    })
                  }
                >
                  Sync local time
                </button>
              </section>
            </div>
          )}
          {section === "Display" && (
            <>
              <div className="grid display-grid">
                <section className="card">
                  <h2>Display editor</h2>
                  <label className="file-drop">
                    Choose an image or GIF
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif"
                      disabled={busy}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file)
                          void run(async () =>
                            prepare(await loadMedia(file), file.name),
                          );
                        e.target.value = "";
                      }}
                    />
                    <small>
                      PNG, JPEG, WebP, GIF · up to 20 MB · processed locally
                    </small>
                  </label>
                  <div className="button-row">
                    <button
                      onClick={() =>
                        prepare(diagnosticSource(), "Diagnostic quadrants")
                      }
                    >
                      Diagnostic image
                    </button>
                    <button
                      onClick={() =>
                        prepare(diagnosticSource(true), "Diagnostic animation")
                      }
                    >
                      8-frame test
                    </button>
                  </div>
                  <div className="two">
                    <Field label="Fit">
                      <select
                        value={edit.fit}
                        onChange={(e) =>
                          setEditing({ fit: e.target.value as Edit["fit"] })
                        }
                      >
                        <option value="cover">Crop to fill</option>
                        <option value="contain">Fit inside</option>
                      </select>
                    </Field>
                    <Field label="Rotation">
                      <select
                        value={edit.rotation}
                        onChange={(e) =>
                          setEditing({ rotation: +e.target.value })
                        }
                      >
                        {[0, 90, 180, 270].map((v) => (
                          <option key={v} value={v}>
                            {v}°
                          </option>
                        ))}
                      </select>
                    </Field>
                  </div>
                  <Range
                    label="Zoom"
                    value={edit.zoom}
                    min={0.25}
                    max={4}
                    step={0.05}
                    onChange={(zoom) => setEditing({ zoom })}
                  />
                  <div className="two">
                    <Range
                      label="Horizontal offset"
                      value={edit.x}
                      min={-128}
                      max={128}
                      onChange={(x) => setEditing({ x })}
                    />
                    <Range
                      label="Vertical offset"
                      value={edit.y}
                      min={-128}
                      max={128}
                      onChange={(y) => setEditing({ y })}
                    />
                  </div>
                  {source.length > 1 && (
                    <>
                      <div className="two">
                        <Field label="First frame (1-based)">
                          <input
                            type="number"
                            min={1}
                            max={source.length}
                            value={edit.start + 1}
                            onChange={(e) =>
                              setEditing({
                                start: Math.max(
                                  0,
                                  Math.min(
                                    source.length - 1,
                                    +e.target.value - 1,
                                  ),
                                ),
                              })
                            }
                          />
                        </Field>
                        <Field label="Last frame (1-based)">
                          <input
                            type="number"
                            min={1}
                            max={source.length}
                            value={edit.end + 1}
                            onChange={(e) =>
                              setEditing({
                                end: Math.max(
                                  0,
                                  Math.min(
                                    source.length - 1,
                                    +e.target.value - 1,
                                  ),
                                ),
                              })
                            }
                          />
                        </Field>
                      </div>
                      <Range
                        label="Playback speed"
                        value={edit.speed}
                        min={0.25}
                        max={4}
                        step={0.25}
                        onChange={(speed) => setEditing({ speed })}
                      />
                    </>
                  )}
                  <hr />
                  <h3>Display text</h3>
                  <Field label="Text">
                    <input
                      maxLength={80}
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                    />
                  </Field>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={scroll}
                      onChange={(e) => setScroll(e.target.checked)}
                    />
                    Scrolling text · 30 frames
                  </label>
                  <button
                    onClick={() =>
                      prepare(
                        textSource(text, scroll, lighting.color),
                        `Text: ${text}`,
                      )
                    }
                  >
                    Render text
                  </button>
                </section>
                <section className="card display-preview">
                  <div className="screen-bezel">
                    <canvas
                      ref={canvas}
                      width={128}
                      height={128}
                      aria-label="128 by 128 display preview"
                    />
                    {!frames.length && (
                      <span>
                        Your canvas
                        <br />
                        128 × 128
                      </span>
                    )}
                  </div>
                  <h3>{mediaName}</h3>
                  <p>
                    {frames.length
                      ? `${frames.length} frame(s) · ${frames.reduce((n, f) => n + f.delay, 0)} ms · RGB565 little-endian`
                      : "Choose media or generate a diagnostic pattern."}
                  </p>
                  {converted.error && (
                    <p role="alert" className="error-text">
                      {converted.error}
                    </p>
                  )}
                  <p className="fine">
                    Transparent areas render black. Animation delays are
                    quantized to 2 ms and limited to 510 ms per frame.
                  </p>
                  <div className="button-row">
                    <button
                      disabled={frames.length < 2}
                      onClick={() => setPlaying((p) => !p)}
                    >
                      {playing ? "Pause" : "Play"} preview
                    </button>
                    <span className="muted">
                      {frames.length ? (frameIndex % frames.length) + 1 : 0} /{" "}
                      {frames.length}
                    </span>
                  </div>
                  <div className="notice">
                    Upload replaces the keyboard’s current animation (slot 1).
                    Cancellation stops further transfer; it cannot restore the
                    previous content.
                  </div>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={replace}
                      disabled={busy}
                      onChange={(e) => setReplace(e.target.checked)}
                    />
                    I understand the existing animation will be replaced.
                  </label>
                  <progress
                    value={progress}
                    max={1}
                    aria-label="Upload progress"
                  />
                  <div className="button-row">
                    <button
                      className="primary"
                      disabled={
                        !ready ||
                        !caps?.operations.display ||
                        !frames.length ||
                        !replace
                      }
                      onClick={() => upload()}
                    >
                      Upload to display
                    </button>
                    <button
                      disabled={!cancel.current}
                      onClick={() =>
                        cancel.current?.abort(
                          new Error(
                            "Upload cancelled; stored animation may be incomplete.",
                          ),
                        )
                      }
                    >
                      Cancel
                    </button>
                  </div>
                  <p className="fine">
                    {Math.round(progress * 100)}% · hardware validation pending
                  </p>
                </section>
              </div>
              <section className="card history">
                <h2>Local upload history</h2>
                <p>
                  What this website sent, stored in IndexedDB. This is not a
                  backup read from your keyboard. Resend uses the replacement
                  confirmation above.
                </p>
                {!historyItems.length && (
                  <div className="empty">No successful uploads yet.</div>
                )}
                {historyItems.map((item) => (
                  <div className="saved-row" key={item.id}>
                    <div>
                      <b>{item.name}</b>
                      <small>
                        {new Date(item.date).toLocaleString()} ·{" "}
                        {item.frames.length} frame(s)
                      </small>
                    </div>
                    <button
                      disabled={!ready || !replace}
                      onClick={() => upload(item.frames, item.name)}
                    >
                      Resend
                    </button>
                    <button
                      disabled={busy}
                      onClick={() =>
                        run(async () => {
                          setHistory(await history("delete", item.id));
                          setStatus("Upload removed from local history.");
                        })
                      }
                    >
                      Delete
                    </button>
                  </div>
                ))}
              </section>
            </>
          )}
          {section === "Presets" && (
            <section className="card">
              <h2>Save and load settings</h2>
              <p>
                Presets contain lighting and keyboard behaviour settings.
                Loading a preset only updates the draft. Apply each setting
                explicitly in Lighting. Presets are only saved in the Browser
                unless you export them.
              </p>
              <div className="button-row preset-actions">
                <Field label="Preset name">
                  <input
                    value={presetName}
                    maxLength={80}
                    onChange={(e) => setPresetName(e.target.value)}
                  />
                </Field>
                <button
                  disabled={!presetName.trim() || presets.length >= 100}
                  className="primary"
                  onClick={() =>
                    run(async () => {
                      savePresets([
                        ...presets,
                        {
                          id: crypto.randomUUID(),
                          name: presetName.trim(),
                          lighting: { ...lighting },
                          sleep,
                          system: { ...system },
                        },
                      ]);
                      setStatus("Preset saved locally.");
                    })
                  }
                >
                  Save draft
                </button>
                <button onClick={() => download("ak820-presets.json", presets)}>
                  Export JSON
                </button>
                <label className="button preset-import">
                  Import JSON
                  <input
                    className="import"
                    aria-label="Import JSON"
                    type="file"
                    accept="application/json,.json"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f)
                        void run(async () => {
                          if (f.size > 1_000_000)
                            throw new Error("Preset file too large");
                          const incoming = parsePresets(
                            JSON.parse(await f.text()),
                          );
                          if (presets.length + incoming.length > 100)
                            throw new Error("Maximum 100 presets");
                          savePresets([
                            ...presets,
                            ...incoming.map((p) => ({
                              ...p,
                              id: crypto.randomUUID(),
                            })),
                          ]);
                          setStatus("Presets imported locally.");
                        });
                      e.target.value = "";
                    }}
                  />
                </label>
              </div>
              {!presets.length && (
                <div className="empty">
                  Here are your presets, if you had any...
                </div>
              )}
              {presets.map((p) => (
                <div key={p.id} className="saved-row">
                  <div>
                    <b>{p.name}</b>
                    <small>
                      {modes[p.lighting.mode]} · brightness{" "}
                      {p.lighting.brightness} · sleep {p.sleep || "never"}
                    </small>
                  </div>
                  <button
                    onClick={() => {
                      setLighting({ ...p.lighting });
                      setSystem((current) =>
                        p.system
                          ? { ...p.system }
                          : { ...current, sleep: p.sleep },
                      );
                      setStatus(
                        `Loaded “${p.name}” into preview. Nothing sent to keyboard.`,
                      );
                      navigate("Lighting");
                    }}
                  >
                    Load draft
                  </button>
                  <button
                    onClick={() =>
                      run(async () => {
                        savePresets(presets.filter((v) => v.id !== p.id));
                        setStatus("Preset deleted locally.");
                      })
                    }
                  >
                    Delete
                  </button>
                </div>
              ))}
            </section>
          )}
          {section === "Diagnostics" && (
            <div className="grid">
              <section className="card">
                <h2>Device interfaces</h2>
                <p>
                  Read-only proof confirms browser access, not settings support.
                </p>
                <div className="button-row">
                  <button
                    disabled={!ready}
                    onClick={() =>
                      run(async () => {
                        await transport!.read();
                        setStatus("Read-only feature test passed.");
                      })
                    }
                  >
                    Read feature 0
                  </button>
                  <button
                    disabled={!ready}
                    onClick={() =>
                      run(async () => {
                        const percent = batteryPercent(
                          await transport!.battery(),
                        );
                        setBattery(percent);
                        setStatus(
                          percent === null
                            ? "No meaningful battery percentage reported."
                            : `Battery reports ${percent}%.`,
                        );
                      })
                    }
                  >
                    Query battery
                  </button>
                  <button
                    onClick={() =>
                      download("ak820-diagnostics.json", {
                        date: new Date().toISOString(),
                        layout,
                        region,
                        status,
                        logs,
                      })
                    }
                  >
                    Export diagnostics
                  </button>
                </div>
                <p>
                  Battery:{" "}
                  {battery === null
                    ? "Unknown (wired/full sentinels are not percentages)"
                    : `${battery}% reported`}
                </p>
                <dl>
                  <dt>Protocol family</dt>
                  <dd>{caps?.family || "Not identified"}</dd>
                  <dt>Selected layout</dt>
                  <dd>
                    {layout.toUpperCase()} / {region.toUpperCase()} · manual
                  </dd>
                </dl>
              </section>
              <section className="card">
                <h2>Session log</h2>
                <pre className="logs" tabIndex={0}>
                  {logs.join("\n") || "No device operations yet"}
                </pre>
              </section>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
