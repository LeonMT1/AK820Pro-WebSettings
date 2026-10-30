import { useId } from "react";
import type { SystemSettings } from "./system-settings";
export function SystemControls({
  settings,
  onChange,
  onApply,
  ready,
}: {
  settings: SystemSettings;
  onChange: (s: SystemSettings) => void;
  onApply: () => void;
  ready: boolean;
}) {
  const id = useId();
  const update = (patch: Partial<SystemSettings>) =>
    onChange({ ...settings, ...patch });
  return (
    <section
      className="system-controls"
      aria-label="Keyboard behaviour settings"
    >
      <h3>Key response time</h3>
      <label className="field" htmlFor={`${id}-response`}>
        Response level
      </label>
      <select
        id={`${id}-response`}
        aria-describedby={`${id}-timing`}
        value={settings.responseLevel}
        onChange={(e) => update({ responseLevel: +e.target.value })}
      >
        {[1, 2, 3, 4, 5].map((n) => (
          <option key={n} value={n}>
            Level {n}
          </option>
        ))}
      </select>
      <div className="timing-table-wrap" id={`${id}-timing`}>
        <table className="timing-table">
          <thead><tr><th scope="col">Level</th><th scope="col">Wired</th><th scope="col">2.4 GHz</th><th scope="col">Bluetooth</th></tr></thead>
          <tbody>
            {[
              ["1", "2-3 ms", "5-6 ms", "12-13 ms"],
              ["2", "5-6 ms", "7-9 ms", "15-16 ms"],
              ["3", "8-9 ms", "10-12 ms", "18-19 ms"],
              ["4", "13-14 ms", "15-17 ms", "23-24 ms"],
              ["5", "17-18 ms", "19-21 ms", "27-28 ms"],
            ].map(([level, wired, wireless, bluetooth]) => (
              <tr key={level}><th scope="row">{level}</th><td>{wired}</td><td>{wireless}</td><td>{bluetooth}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="fine">
        Estimated latency from the official software, not measurements. Actual latency may vary with switches and wireless interference. Lower levels respond faster; higher levels help prevent key chatter. Increase the level if unintended repeated keypresses occur.
      </p>
      <h3>Shortcut locks</h3>
      {(
        [
          // Byte 2 of the legacy 04 17 block actually locks ALT + TAB and
          // byte 4 locks the Windows key, despite the upstream field names.
          // Labels follow observed behaviour; keys stay for stored drafts.
          ["disableWindows", "Disable ALT + TAB"],
          ["disableAltF4", "Disable ALT + F4"],
          ["disableAltTab", "Disable Windows Key"],
        ] as const
      ).map(([key, label]) => (
        <label key={key} className="check">
          <input
            type="checkbox"
            checked={settings[key]}
            onChange={(e) => update({ [key]: e.target.checked })}
          />
          {label}
        </label>
      ))}
      <p className="fine">
        Community research reports that the locks have no effect in the keyboard’s Mac
        mode.
      </p>
      <label className="field" htmlFor={`${id}-sleep`}>
        Sleep timeout
      </label>
      <select
        id={`${id}-sleep`}
        value={settings.sleep}
        onChange={(e) => update({ sleep: +e.target.value })}
      >
        {[0, 1, 5, 30].map((n) => (
          <option key={n} value={n}>
            {n ? `${n} minute${n === 1 ? "" : "s"}` : "Never"}
          </option>
        ))}
      </select>
      <div className="notice">
        Experimental on this unit. Apply sends all settings shown here together.
        The keyboard’s current values cannot be read back.
      </div>
      <button disabled={!ready} onClick={onApply}>
        Apply keyboard settings
      </button>
    </section>
  );
}
