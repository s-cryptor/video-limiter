import { formatDuration, limitMs } from "../lib/usage.js";

const $ = (id) => document.getElementById(id);

async function render() {
  const status = await chrome.runtime.sendMessage({ type: "status" });
  if (!status || status.error) return;

  const { usedMs, remainingMs, blocked, settings } = status;
  $("used").textContent = formatDuration(usedMs);
  $("remaining").textContent = formatDuration(remainingMs);

  const total = limitMs(settings);
  const pct = total === 0 ? 100 : Math.min(100, (usedMs / total) * 100);
  $("progress").style.width = `${pct}%`;
  $("progress").classList.toggle("full", remainingMs === 0);

  const state = $("state");
  state.classList.toggle("blocked", blocked);
  if (!settings.enabled) state.textContent = "Блокировка выключена — время только считается.";
  else if (blocked) state.textContent = "Лимит исчерпан, видео заблокированы до завтра.";
  else state.textContent = "";

  // Don't clobber the field while the user is editing it.
  if (document.activeElement !== $("limit")) $("limit").value = settings.limitMinutes;
  $("enabled").checked = settings.enabled;
}

$("settings").addEventListener("submit", async (e) => {
  e.preventDefault();
  const limitMinutes = Math.round(Number($("limit").value));
  if (!Number.isFinite(limitMinutes) || limitMinutes < 1) return;
  await chrome.storage.sync.set({ limitMinutes, enabled: $("enabled").checked });
  $("limit").blur();
  $("saved").hidden = false;
  setTimeout(() => ($("saved").hidden = true), 1500);
  render();
});

chrome.storage.onChanged.addListener(render);
render();
