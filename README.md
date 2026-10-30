# AK820 Pro Web Settings

A static Vite + React + TypeScript configurator for AJAZZ AK820 Pro keyboards. All media processing, presets and history stay in the browser.

## Run

Requires Bun 1.4.2 or later.

```sh
bun install --frozen-lockfile
bun run dev
```

```sh
bun run test
bun run test:browser
bun run build
bun run preview
```

## Implemented

- Descriptor-based FF13/FF68 legacy classification, read-only browser proof, status, session logs and diagnostic JSON export.
- Explicit lighting effect/color/brightness/speed/direction/rainbow application, local clock synchronization and sleep timeout. No write is triggered by connecting, changing a slider, choosing a layout or loading a preset.
- Separate legacy display uploader: ID 0, 4096-byte output, 256-byte animation header, RGB565 little-endian, per-chunk input acknowledgements, slot 1 and a 30-frame limit.
- PNG/JPEG/WebP and GIF input, crop/fit, zoom, offsets, quarter-turn rotation, frame trim, speed adjustment, quantized display preview and play/pause. GIF decoding runs in a worker with disposal/transparency composition. File limit 20 MB; decoded limit 32 million source pixels, 4096 px per dimension and 120 source frames. Trim animations to at most 30 frames. GIF delays are encoded in 2 ms units with a maximum of 510 ms. WebP input uses its first decoded image, not animated WebP playback.
- Static or scrolling text and static/eight-frame diagnostic patterns.
- Last ten acknowledged uploads in IndexedDB, explicit resend/delete, and local lighting/sleep presets with validated JSON import/export. History records website transfers, not keyboard backups. Browser storage can be cleared or evicted.
- ANSI default and manual ANSI/ISO schematic geometry, independent draft US/UK/DE legends. Geometry selection persists locally. Regional legends and ISO geometry are **draft previews, not vendor-verified definitions**. An explicit community legacy ANSI LED map is supplied for experimental testing; it is not inferred from USB IDs.
- Battery query that hides FF and other out-of-range values.
- Key Response Time levels 1–5, Disable Windows Key, Disable ALT + F4 and Disable ALT + TAB are available under Lighting → Device Settings. Fn behaviour and sleep are shown alongside them because legacy command `04 17` writes all six settings together. Apply sends the entire visible draft, not a single-field patch. Defaults are local choices (response level 2, locks off, hold Fn, sleep 5 minutes), not values read from the keyboard. Drafts persist locally; new presets include the whole block, while older sleep-only presets preserve the other current draft fields. These writes are experimental on this unit. Shortcut locks reportedly have no effect in Mac mode. Level-1 timings shown in the UI are estimates transcribed from the user's official-software screenshot, not measured latency or guaranteed timing for other levels.
- Per-key color editor: select individual keys, WASD, arrows or all keys; paint hex/RGB colours, turn selected LEDs off, undo the last color change, and save named color layouts with JSON import/export. ANSI/ISO drafts persist separately; changing regional legends preserves physical-key colours. No color is read from the device. The legacy custom-mode/576-byte bank writer is implemented. **Apply key colours is enabled for experimental ANSI testing** after connection, using the documented community LED map and initial brightness 1. Clicking Apply replaces the whole stored color bank. No physical LED map has been verified on this user's unit; ISO Apply remains disabled.

See [THIRD_PARTY.md](THIRD_PARTY.md) for sources and attribution.