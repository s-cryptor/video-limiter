import { test } from "node:test";
import assert from "node:assert/strict";
import {
  TICK_MS,
  DEFAULT_SETTINGS,
  applyTick,
  currentUsage,
  dayKey,
  formatDuration,
  isBlocked,
  remainingMs,
} from "../src/lib/usage.js";

const NOW = new Date(2026, 9, 6, 12, 0, 0).getTime();
const settings = { limitMinutes: 1, enabled: true };

test("dayKey uses local date", () => {
  assert.equal(dayKey(new Date(2026, 0, 5, 23, 59)), "2026-01-05");
});

test("first tick counts one TICK_MS", () => {
  const r = applyTick({ usage: null, settings, lastCountedAt: null, now: NOW });
  assert.equal(r.usage.usedMs, TICK_MS);
  assert.equal(r.usage.day, dayKey(new Date(NOW)));
  assert.equal(r.blocked, false);
});

test("long gap between ticks is capped at TICK_MS", () => {
  const usage = { day: dayKey(new Date(NOW)), usedMs: 5000 };
  const r = applyTick({ usage, settings, lastCountedAt: NOW - 60_000, now: NOW });
  assert.equal(r.usage.usedMs, 5000 + TICK_MS);
});

test("interleaved ticks from two tabs count wall-clock time once", () => {
  let usage = null;
  let lastCountedAt = null;
  // Tab A ticks at 0, 1000, 2000; tab B at 500, 1500, 2500.
  for (const t of [0, 500, 1000, 1500, 2000, 2500]) {
    ({ usage, lastCountedAt } = applyTick({ usage, settings, lastCountedAt, now: NOW + t }));
  }
  assert.equal(usage.usedMs, TICK_MS + 2500);
});

test("blocks once the limit is reached and stops counting", () => {
  const usage = { day: dayKey(new Date(NOW)), usedMs: 59_500 };
  const r = applyTick({ usage, settings, lastCountedAt: NOW - 1000, now: NOW });
  assert.equal(r.blocked, true);
  assert.equal(r.usage.usedMs, 60_500);

  const again = applyTick({ usage: r.usage, settings, lastCountedAt: NOW, now: NOW + 1000 });
  assert.equal(again.blocked, true);
  assert.equal(again.usage.usedMs, 60_500);
});

test("disabled limiter counts but never blocks", () => {
  const off = { ...settings, enabled: false };
  const usage = { day: dayKey(new Date(NOW)), usedMs: 120_000 };
  const r = applyTick({ usage, settings: off, lastCountedAt: null, now: NOW });
  assert.equal(r.blocked, false);
  assert.equal(r.usage.usedMs, 121_000);
});

test("usage from a previous day is reset", () => {
  const stale = { day: "2026-10-05", usedMs: 999_999 };
  assert.equal(currentUsage(stale, NOW).usedMs, 0);
  assert.equal(isBlocked(stale, settings, NOW), false);
  assert.equal(remainingMs(stale, settings, NOW), 60_000);
});

test("default limit is one hour", () => {
  assert.equal(remainingMs(null, DEFAULT_SETTINGS, NOW), 3_600_000);
});

test("formatDuration", () => {
  assert.equal(formatDuration(0), "0 мин");
  assert.equal(formatDuration(59_999), "0 мин");
  assert.equal(formatDuration(3_600_000), "1 ч");
  assert.equal(formatDuration(5_400_000), "1 ч 30 мин");
});
