import {
  command,
  payload,
  validateAck,
  encodeAnimation,
  type Frame,
} from "./protocol";
import { perKeyPackets, type KeyColors } from "./per-key";
import type { Key } from "./layouts";
import { systemSettingsPacket, type SystemSettings } from "./system-settings";
export type Report = {
  reportId: number;
  items: { reportSize: number; reportCount: number }[];
};
export type Collection = {
  usagePage: number;
  usage: number;
  featureReports: Report[];
  inputReports: Report[];
  outputReports: Report[];
  children: Collection[];
};
export interface Device extends EventTarget {
  vendorId: number;
  productId: number;
  productName: string;
  opened: boolean;
  collections: Collection[];
  open(): Promise<void>;
  close(): Promise<void>;
  sendFeatureReport(id: number, data: Uint8Array): Promise<void>;
  receiveFeatureReport(id: number): Promise<DataView>;
  sendReport(id: number, data: Uint8Array): Promise<void>;
}
export interface Hid extends EventTarget {
  requestDevice(options: {
    filters: { vendorId: number; usagePage: number }[];
  }): Promise<Device[]>;
}
export const hid =
  typeof navigator === "undefined"
    ? undefined
    : (navigator as Navigator & { hid?: Hid }).hid;
export const flatten = (cs: Collection[]): Collection[] =>
  cs.flatMap((c) => [c, ...flatten(c.children || [])]);
const has = (rs: Report[], bytes: number) =>
  rs.some(
    (r) =>
      r.reportId === 0 &&
      r.items.reduce((n, i) => n + i.reportSize * i.reportCount, 0) ===
        bytes * 8,
  );
export function classify(ds: Device[]) {
  const cs = ds.flatMap((d) => flatten(d.collections));
  if (cs.some((c) => c.usagePage === 0xff67))
    throw new Error(
      "Newer protocol detected. This build supports legacy FF13/FF68 only.",
    );
  const eligible = ds.filter(
    (d) =>
      d.vendorId === 0x0c45 &&
      d.productId !== 0x7140 &&
      /AK820/i.test(d.productName),
  );
  const controls = eligible.filter((d) =>
    flatten(d.collections).some(
      (c) =>
        c.usagePage === 0xff13 &&
        c.usage === 1 &&
        has(c.featureReports, 64) &&
        has(c.inputReports, 64) &&
        has(c.outputReports, 64),
    ),
  );
  if (controls.length !== 1)
    throw new Error(
      "Expected one AK820 FF13 control interface with 64-byte reports. Select only one wired keyboard.",
    );
  const displays = eligible.filter(
    (d) =>
      d.productId === controls[0].productId &&
      flatten(d.collections).some(
        (c) =>
          c.usagePage === 0xff68 &&
          c.usage === 0x61 &&
          has(c.outputReports, 4096) &&
          has(c.inputReports, 64),
      ),
  );
  if (displays.length > 1)
    throw new Error("Ambiguous display interfaces; connect one keyboard only.");
  return {
    control: controls[0],
    display: displays[0],
    family: "legacy" as const,
    verification: "unverified on this unit" as const,
    operations: {
      lighting: true,
      clock: true,
      sleep: true,
      display: displays.length === 1,
      perKey: false,
      remapping: false,
    },
  };
}
const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
export class Transport {
  busy = false;
  fault = false;
  disconnected = false;
  private abort = new AbortController();
  constructor(
    public control: Device,
    public display: Device | undefined,
    private log: (s: string) => void = () => {},
    private timeout = 2000,
    private pause = delay,
  ) {}
  disconnect() {
    this.disconnected = true;
    this.fault = true;
    this.abort.abort(new Error("Keyboard disconnected"));
  }
  async close() {
    this.disconnect();
    await Promise.allSettled(
      [
        ...new Set([this.control, this.display].filter(Boolean) as Device[]),
      ].map((d) => d.close()),
    );
  }
  private check() {
    if (this.disconnected) throw new Error("Keyboard disconnected");
    if (this.fault)
      throw new Error(
        "Transport stopped. Disconnect and reconnect to explicitly retry.",
      );
  }
  private async bounded<T>(p: Promise<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout>;
    const signal = this.abort.signal;
    let cancel: () => void = () => {};
    try {
      return await Promise.race([
        p,
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () =>
              reject(
                new Error(
                  "Device operation timed out; reconnect before retrying.",
                ),
              ),
            this.timeout,
          );
          cancel = () => reject(signal.reason);
          if (signal.aborted) cancel();
          else signal.addEventListener("abort", cancel, { once: true });
        }),
      ]);
    } finally {
      clearTimeout(timer!);
      signal.removeEventListener("abort", cancel);
    }
  }
  async run<T>(work: () => Promise<T>): Promise<T> {
    this.check();
    if (this.busy) throw new Error("Another keyboard operation is running");
    this.busy = true;
    try {
      if (typeof navigator !== "undefined" && navigator.locks) {
        return await navigator.locks.request(
          `ak820-${this.control.vendorId}-${this.control.productId}`,
          { ifAvailable: true },
          async (lock) => {
            if (!lock)
              throw new Error("Another browser tab is using this keyboard");
            return work();
          },
        );
      }
      return await work();
    } catch (e) {
      this.fault = true;
      throw e;
    } finally {
      this.busy = false;
    }
  }
  async read() {
    return this.run(async () => {
      const p = payload(
        await this.bounded(this.control.receiveFeatureReport(0)),
      );
      this.log(
        `Read-only feature report: ${Array.from(p)
          .map((b) => b.toString(16).padStart(2, "0"))
          .join(" ")}`,
      );
      return p;
    });
  }
  private async exchange(p: Uint8Array) {
    this.check();
    await this.pause(35);
    this.check();
    await this.bounded(this.control.sendFeatureReport(0, p));
    await this.pause(50);
    this.check();
    const r = payload(await this.bounded(this.control.receiveFeatureReport(0)));
    this.log(
      `Feature ${p[0].toString(16)} ${p[1].toString(16)} → ${Array.from(
        r.slice(0, 4),
      )
        .map((x) => x.toString(16).padStart(2, "0"))
        .join(" ")}`,
    );
    return r;
  }
  private async cmd(op: number, sub = 0, value = 1) {
    validateAck(await this.exchange(command(op, sub, value)), op);
  }
  async setting(op: number, data: Uint8Array, sub = 0) {
    if (![0x13, 0x17, 0x28].includes(op) || data.length !== 64)
      throw new Error("Unsupported setting");
    return this.run(async () => {
      await this.cmd(0x18);
      await this.cmd(op, sub);
      await this.exchange(data);
      await this.cmd(2, 0, 0);
      await this.cmd(0xf0);
    });
  }
  async battery() {
    return this.run(async () => {
      const p = new Uint8Array(64);
      p.set([0x20, 1]);
      return this.exchange(p);
    });
  }
  async system(settings: SystemSettings) {
    return this.setting(0x17, systemSettingsPacket(settings), 1);
  }
  async perKey(
    map: Key[],
    colors: KeyColors,
    brightness: number,
    writeAuthorized = false,
  ) {
    const { mode, bank } = perKeyPackets(
      map,
      colors,
      brightness,
      writeAuthorized,
    );
    return this.run(async () => {
      await this.cmd(0x18, 0, 0);
      await this.cmd(0x13, 0, 1);
      await this.exchange(mode);
      await this.cmd(2, 0, 0);
      await this.cmd(0xf0, 0, 0);
      await this.cmd(0x18, 0, 0);
      await this.cmd(0x23, 0, 9);
      for (let i = 0; i < bank.length; i += 64)
        await this.exchange(bank.slice(i, i + 64));
      await this.cmd(2, 0, 0);
      await this.cmd(0xf0, 0, 0);
    });
  }
  private async chunk(bytes: Uint8Array, signal: AbortSignal) {
    this.check();
    signal.throwIfAborted();
    const d = this.display!;
    let listener: EventListener = () => {};
    let cancel = () => {};
    const ack = new Promise<void>((resolve, reject) => {
      listener = (event: Event) => {
        const e = event as Event & { reportId: number; data: DataView };
        try {
          if (e.reportId !== 0) return;
          payload(e.data);
          resolve();
        } catch (err) {
          reject(err);
        }
      };
      cancel = () => reject(signal.reason || new Error("Upload cancelled"));
      d.addEventListener("inputreport", listener);
      signal.addEventListener("abort", cancel, { once: true });
    });
    try {
      await this.bounded(Promise.all([d.sendReport(0, bytes), ack]));
      signal.throwIfAborted();
    } finally {
      d.removeEventListener("inputreport", listener);
      signal.removeEventListener("abort", cancel);
    }
  }
  async upload(
    frames: Frame[],
    signal: AbortSignal,
    progress: (n: number) => void,
  ) {
    const stream = encodeAnimation(frames);
    if (!this.display) throw new Error("Display interface missing");
    return this.run(async () => {
      signal.throwIfAborted();
      await this.cmd(0x18, 0, 0);
      signal.throwIfAborted();
      await this.cmd(0x72, 1, stream.length / 4096);
      for (let i = 0; i < stream.length; i += 4096) {
        await this.chunk(stream.slice(i, i + 4096), signal);
        progress((i + 4096) / stream.length);
      }
      signal.throwIfAborted();
      await this.cmd(2, 0, 0);
    });
  }
}
