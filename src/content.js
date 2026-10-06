// Runs in every frame. Reports a heartbeat to the service worker once per
// second while a video is being watched, and pauses videos once the daily
// limit is exhausted. Must stay a classic script (no imports).
(() => {
  if (window.__videoLimiterLoaded) return;
  window.__videoLimiterLoaded = true;

  const TICK_MS = 1000;
  const BLOCKED_RECHECK_MS = 30_000;
  const OVERLAY_ID = "video-limiter-overlay";

  let blocked = false;
  let overlayDismissed = false;
  let lastRecheck = 0;
  let timer = null;

  function videos() {
    return Array.from(document.querySelectorAll("video"));
  }

  function isPlaying(v) {
    return !v.paused && !v.ended && v.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA;
  }

  // A muted video in a background tab (autoplay ads, previews) isn't "watching".
  function isWatched(v) {
    if (!isPlaying(v)) return false;
    return document.visibilityState === "visible" || (!v.muted && v.volume > 0);
  }

  async function send(message) {
    try {
      return await chrome.runtime.sendMessage(message);
    } catch {
      // Extension was reloaded or removed: this script is orphaned.
      clearInterval(timer);
      return null;
    }
  }

  function setBlocked(next) {
    if (next === blocked) return;
    blocked = next;
    if (blocked) {
      overlayDismissed = false;
      enforce();
    } else {
      removeOverlay();
    }
  }

  async function refreshStatus() {
    lastRecheck = Date.now();
    const res = await send({ type: "status" });
    if (res && !res.error) setBlocked(res.blocked);
  }

  function enforce() {
    const list = videos();
    if (list.length === 0) return;
    for (const v of list) if (!v.paused) v.pause();
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    if (!overlayDismissed) showOverlay();
  }

  async function tick() {
    if (blocked) {
      enforce();
      // Unblock after midnight without needing any storage change.
      if (Date.now() - lastRecheck > BLOCKED_RECHECK_MS) refreshStatus();
      return;
    }
    if (!videos().some(isWatched)) return;
    const res = await send({ type: "tick" });
    if (res && !res.error) setBlocked(res.blocked);
  }

  function showOverlay() {
    if (document.getElementById(OVERLAY_ID)) return;
    const host = document.createElement("div");
    host.id = OVERLAY_ID;
    // Shadow DOM keeps page styles out and ours in.
    const root = host.attachShadow({ mode: "closed" });
    root.innerHTML = `
      <style>
        :host { all: initial; }
        .backdrop {
          position: fixed; inset: 0; z-index: 2147483647;
          display: flex; align-items: center; justify-content: center;
          background: rgba(0, 0, 0, 0.82);
          font: 16px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif;
          color: #fff;
        }
        .card { max-width: 420px; padding: 28px 32px; text-align: center;
          background: #202124; border-radius: 12px; box-shadow: 0 8px 32px rgba(0,0,0,.5); }
        h1 { margin: 0 0 8px; font-size: 22px; font-weight: 600; }
        p { margin: 0 0 20px; color: #bdc1c6; }
        button { padding: 8px 20px; border: 0; border-radius: 6px; cursor: pointer;
          background: #8ab4f8; color: #202124; font: inherit; font-weight: 500; }
      </style>
      <div class="backdrop" role="dialog" aria-modal="true">
        <div class="card">
          <h1>Лимит видео на сегодня исчерпан</h1>
          <p>Видео будут снова доступны завтра. Лимит можно изменить в настройках расширения.</p>
          <button type="button">Закрыть</button>
        </div>
      </div>`;
    root.querySelector("button").addEventListener("click", () => {
      overlayDismissed = true;
      removeOverlay();
    });
    (document.body || document.documentElement).appendChild(host);
  }

  function removeOverlay() {
    document.getElementById(OVERLAY_ID)?.remove();
  }

  // Stop playback immediately instead of waiting for the next tick.
  document.addEventListener(
    "play",
    (e) => {
      if (!blocked || !(e.target instanceof HTMLVideoElement)) return;
      e.target.pause();
      overlayDismissed = false;
      enforce();
      refreshStatus();
    },
    true,
  );

  // Limit raised or limiter disabled from the popup.
  chrome.storage.onChanged.addListener((_changes, area) => {
    if (area === "sync" && blocked) refreshStatus();
  });

  timer = setInterval(tick, TICK_MS);
})();
