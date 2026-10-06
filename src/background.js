import {
  DEFAULT_SETTINGS,
  applyTick,
  currentUsage,
  freshUsage,
  isBlocked,
  remainingMs,
} from "./lib/usage.js";

// Wall-clock time of the last counted tick. Kept in memory: if the service
// worker is restarted we lose at most one tick of precision.
let lastCountedAt = null;

// Ticks from many tabs arrive concurrently; storage read-modify-write must not interleave.
let queue = Promise.resolve();
function serialize(fn) {
  const run = queue.then(fn);
  queue = run.catch(() => {});
  return run;
}

async function getSettings() {
  return chrome.storage.sync.get(DEFAULT_SETTINGS);
}

async function getUsage() {
  const { usage } = await chrome.storage.local.get({ usage: freshUsage() });
  return currentUsage(usage);
}

async function handleTick() {
  const settings = await getSettings();
  const { usage } = await chrome.storage.local.get("usage");
  const result = applyTick({ usage, settings, lastCountedAt, now: Date.now() });
  lastCountedAt = result.lastCountedAt;
  if (result.changed) await chrome.storage.local.set({ usage: result.usage });
  await updateBadge(result.usage, settings);
  return { blocked: result.blocked };
}

async function getStatus() {
  const [settings, usage] = await Promise.all([getSettings(), getUsage()]);
  return {
    blocked: isBlocked(usage, settings),
    usedMs: usage.usedMs,
    remainingMs: remainingMs(usage, settings),
    settings,
  };
}

async function updateBadge(usage, settings) {
  if (!settings.enabled) {
    await chrome.action.setBadgeText({ text: "off" });
    await chrome.action.setBadgeBackgroundColor({ color: "#888888" });
    return;
  }
  const left = remainingMs(usage, settings);
  // Whole minutes left, rounded up so "0" only shows when truly exhausted.
  const minutes = Math.ceil(left / 60_000);
  await chrome.action.setBadgeText({ text: left === 0 ? "0" : `${minutes}` });
  await chrome.action.setBadgeBackgroundColor({ color: left === 0 ? "#d93025" : "#1a73e8" });
}

async function refreshBadge() {
  const [settings, usage] = await Promise.all([getSettings(), getUsage()]);
  await updateBadge(usage, settings);
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  const handlers = {
    tick: handleTick,
    status: getStatus,
  };
  const handler = handlers[msg?.type];
  if (!handler) return false;
  serialize(handler).then(sendResponse, (err) => sendResponse({ error: String(err) }));
  return true; // async response
});

chrome.storage.onChanged.addListener((_changes, area) => {
  if (area === "sync") refreshBadge();
});

chrome.runtime.onInstalled.addListener(refreshBadge);
chrome.runtime.onStartup.addListener(refreshBadge);
