// Pure time-accounting logic shared by the service worker and tests.
// No chrome.* APIs here so it can run under `node --test`.

export const DEFAULT_LIMIT_MINUTES = 60;
export const TICK_MS = 1000;

export const DEFAULT_SETTINGS = Object.freeze({
  limitMinutes: DEFAULT_LIMIT_MINUTES,
  enabled: true,
});

// Local calendar day, e.g. "2026-10-06". The counter resets when it changes.
export function dayKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function freshUsage(now = Date.now()) {
  return { day: dayKey(new Date(now)), usedMs: 0 };
}

// Returns usage for the current day, discarding a stale record from a previous day.
export function currentUsage(usage, now = Date.now()) {
  if (!usage || usage.day !== dayKey(new Date(now))) return freshUsage(now);
  return usage;
}

export function limitMs(settings) {
  return Math.max(0, Number(settings.limitMinutes) || 0) * 60_000;
}

export function remainingMs(usage, settings, now = Date.now()) {
  return Math.max(0, limitMs(settings) - currentUsage(usage, now).usedMs);
}

export function isBlocked(usage, settings, now = Date.now()) {
  return Boolean(settings.enabled) && remainingMs(usage, settings, now) === 0;
}

// Applies one heartbeat from a tab with a playing video.
//
// Ticks from several tabs/frames arrive interleaved, so instead of adding a
// fixed TICK_MS per message we add the wall-clock time elapsed since the last
// counted tick (capped at TICK_MS). Two tabs playing at once therefore count
// as one second per second, not two.
export function applyTick({ usage, settings, lastCountedAt, now = Date.now() }) {
  const today = currentUsage(usage, now);
  if (isBlocked(today, settings, now)) {
    return { usage: today, lastCountedAt, blocked: true, changed: today !== usage };
  }

  const elapsed = lastCountedAt == null ? TICK_MS : now - lastCountedAt;
  const delta = Math.min(Math.max(elapsed, 0), TICK_MS);
  const next = { day: today.day, usedMs: today.usedMs + delta };

  return {
    usage: next,
    lastCountedAt: now,
    blocked: isBlocked(next, settings, now),
    changed: true,
  };
}

export function formatDuration(ms) {
  const totalMinutes = Math.floor(ms / 60_000);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m} мин`;
  return m === 0 ? `${h} ч` : `${h} ч ${m} мин`;
}
