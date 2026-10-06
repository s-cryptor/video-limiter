# AGENTS.md

Guidance for AI coding agents working in this repository.

## Project

Chrome extension (Manifest V3) that tracks video watching time across all tabs and blocks `<video>` playback once a daily limit is reached (default 60 min). Plain JavaScript with **no build step and no dependencies**. Keep it that way unless there's a strong reason not to.

## Layout

| Path | Role |
|---|---|
| `manifest.json` | MV3 manifest. Only the `storage` permission plus a content script on `<all_urls>`, all frames. |
| `src/lib/usage.js` | Pure logic: day keys, tick accounting, limit checks, formatting. No `chrome.*` calls, so it's unit-testable. |
| `src/background.js` | Module service worker. Handles `tick` and `status` messages, persists usage, updates the badge. |
| `src/content.js` | **Classic script** (content scripts can't use ES `import`). Detects playing videos, sends ticks, pauses videos and shows the overlay when blocked. |
| `src/popup/` | Popup UI: today's usage and the settings form. Module script, imports from `src/lib/usage.js`. |
| `tests/` | `node:test` unit tests for `src/lib/usage.js`. |

## Data model

- `chrome.storage.sync` holds settings: `{ limitMinutes: number, enabled: boolean }`. Defaults are in `DEFAULT_SETTINGS`.
- `chrome.storage.local` holds usage: `{ usage: { day: "YYYY-MM-DD" (local time), usedMs: number } }`. A record from a past day counts as zero, see `currentUsage`.

## Messages (content/popup → service worker)

- `{ type: "tick" }` → `{ blocked }`. Sent at most once per second per frame while a video is watched.
- `{ type: "status" }` → `{ blocked, usedMs, remainingMs, settings }`.

## Invariants: don't break these

- **Wall-clock accounting.** `applyTick` adds `min(now - lastCountedAt, TICK_MS)` per tick, so concurrent tabs don't multiply time. Never switch to "add TICK_MS per message".
- **Serialized storage writes.** All message handlers in the service worker go through `serialize()`, because ticks from many frames arrive concurrently.
- **No counting once blocked.** `usedMs` doesn't grow after the limit is hit.
- **Low message volume.** Content scripts run in every frame of every tab. Don't add per-second messages or `storage.onChanged` listeners for `local` there: usage is written every second.
- The content script must survive the extension being reloaded. `send()` catches the "context invalidated" error and stops the timer.
- The overlay lives in a closed Shadow DOM so page CSS can't break it. Keep page interference minimal.

## Commands

```bash
npm test        # unit tests (node --test), Node 18+
```

Manual check: load the repo folder via `chrome://extensions` → Load unpacked. Set the limit to 1 minute in the popup and play any video.

Automated end-to-end check (no extra deps): stable Chrome ignores `--load-extension`, so start Chrome with `--remote-debugging-port=<port> --enable-unsafe-extension-debugging` and call the CDP method `Extensions.loadUnpacked { path }`. Then attach to the extension's service worker target and drive `chrome.storage` from there.

## Conventions

- UI strings are in Russian. There's no i18n yet. If you add `_locales`, move all strings (content overlay, popup, `formatDuration`) together.
- Put new logic in `src/lib/usage.js` with tests whenever it doesn't need `chrome.*`.
- Don't request new permissions unless a feature truly needs them, and document why in the README.
- Commit directly to `main`, in small, focused commits.
