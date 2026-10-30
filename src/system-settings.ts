// Legacy 04 17 block: allshouldbeready/ak820-pro-macos legacy_protocol.rs (MIT).
export type SystemSettings = {
  responseLevel: number;
  disableWindows: boolean;
  disableAltF4: boolean;
  disableAltTab: boolean;
  fnToggle: boolean;
  sleep: number;
};
export const systemDefaults: SystemSettings = {
  responseLevel: 2,
  disableWindows: false,
  disableAltF4: false,
  disableAltTab: false,
  fnToggle: false,
  sleep: 5,
};
export function validateSystemSettings(value: unknown): SystemSettings {
  const s = value as SystemSettings;
  if (
    !s ||
    !Number.isInteger(s.responseLevel) ||
    s.responseLevel < 1 ||
    s.responseLevel > 5 ||
    ![0, 1, 5, 30].includes(s.sleep) ||
    ["disableWindows", "disableAltF4", "disableAltTab", "fnToggle"].some(
      (k) => typeof s[k as keyof SystemSettings] !== "boolean",
    )
  )
    throw new Error("Invalid keyboard system settings");
  return {
    responseLevel: s.responseLevel,
    disableWindows: s.disableWindows,
    disableAltF4: s.disableAltF4,
    disableAltTab: s.disableAltTab,
    fnToggle: s.fnToggle,
    sleep: s.sleep,
  };
}
export function systemSettingsPacket(value: SystemSettings) {
  const s = validateSystemSettings(value),
    p = new Uint8Array(64);
  p.set([
    0,
    1,
    +s.disableWindows,
    +s.disableAltF4,
    +s.disableAltTab,
    +s.fnToggle,
    [0, 1, 5, 30].indexOf(s.sleep),
    0,
    s.responseLevel,
  ]);
  p.set([0xaa, 0x55], 62);
  return p;
}
