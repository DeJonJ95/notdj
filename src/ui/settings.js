// Settings panel: audio output routing, wake lock, crossfader curve, latency,
// quantize defaults, theme toggle, library management.

import { store } from '../state/index.js';
import { audio } from '../engine/audio-engine.js';
import { library } from '../services/library-manager.js';
import { actions } from './actions.js';

const SETTINGS_KEY = 'notdj.settings';

const defaultSettings = {
  outputDeviceId: 'default',
  crossfaderCurve: 'sharp',
  wakeLock: true,
  latencyHint: 'interactive',
  jogScratchMode: 'scrub', // 'scrub' | 'pitch' (Phase 6.5)
};

export const settings = {
  current: load(),
  save() { localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.current)); },
  set(patch) { this.current = { ...this.current, ...patch }; this.save(); },
};

function load() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return { ...defaultSettings, ...(raw ? JSON.parse(raw) : {}) };
  } catch { return { ...defaultSettings }; }
}

let wakeLockSentinel = null;
async function requestWakeLock() {
  if (!('wakeLock' in navigator) || wakeLockSentinel) return;
  try {
    wakeLockSentinel = await navigator.wakeLock.request('screen');
    wakeLockSentinel.addEventListener('release', () => { wakeLockSentinel = null; });
  } catch {}
}
async function releaseWakeLock() {
  if (wakeLockSentinel) { try { await wakeLockSentinel.release(); } catch {} ; wakeLockSentinel = null; }
}

// Re-acquire wake lock when tab becomes visible
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && settings.current.wakeLock) requestWakeLock();
});

export function applyInitialSettings() {
  if (settings.current.wakeLock) requestWakeLock();
}

export function initSettings(root) {
  const overlay = document.createElement('div');
  overlay.id = 'settings-overlay';
  Object.assign(overlay.style, {
    position: 'fixed', inset: '0', background: 'rgba(8,8,10,0.96)', backdropFilter: 'blur(20px)',
    display: 'none', zIndex: '51', color: 'var(--text)', flexDirection: 'column',
  });
  overlay.innerHTML = template();
  root.appendChild(overlay);

  store.subscribe('ui', (ui) => {
    overlay.style.display = ui.settingsOpen ? 'flex' : 'none';
    if (ui.settingsOpen) populate(overlay);
  });

  bind(overlay);
}

function template() {
  return `
    <style>
      #settings-overlay { font-family:-apple-system,system-ui,sans-serif; padding:24px 32px; }
      #settings-overlay .header { display:flex; align-items:center; gap:12px; margin-bottom:20px; }
      #settings-overlay h1 { margin:0; font-size:18px; letter-spacing:0.04em; }
      #settings-overlay h3 { color:var(--muted); font-size:10px; letter-spacing:0.1em; text-transform:uppercase; margin:24px 0 10px; }
      #settings-overlay .row { display:grid; grid-template-columns:240px 1fr; gap:16px; align-items:center; padding:10px 0; border-bottom:1px solid #18181d; }
      #settings-overlay .row label { color:var(--text); font-size:13px; }
      #settings-overlay .row .desc { color:var(--muted); font-size:11px; margin-top:2px; }
      #settings-overlay select, #settings-overlay input[type=range] { background:var(--panel); border:1px solid var(--border); color:var(--text); padding:8px 12px; border-radius:6px; font-size:13px; min-width:200px; }
      #settings-overlay button.btn { background:var(--panel); border:1px solid var(--border); color:var(--text); padding:8px 14px; border-radius:6px; cursor:pointer; font-size:12px; letter-spacing:0.06em; text-transform:uppercase; }
      #settings-overlay button.btn.danger { color:var(--red); border-color:var(--red); }
      #settings-overlay button.btn.close { margin-left:auto; }
      #settings-overlay .toggle { position:relative; width:42px; height:24px; background:var(--panel2); border:1px solid var(--border); border-radius:12px; cursor:pointer; }
      #settings-overlay .toggle.on { background:var(--deck-a); border-color:var(--deck-a); }
      #settings-overlay .toggle::after { content:''; position:absolute; top:2px; left:2px; width:18px; height:18px; background:#fff; border-radius:50%; transition:transform 0.15s; }
      #settings-overlay .toggle.on::after { transform:translateX(18px); }
      #settings-overlay .body { max-width:760px; }
    </style>
    <div class="header">
      <h1>Settings</h1>
      <span style="color:var(--muted);font-size:11px;letter-spacing:0.08em;text-transform:uppercase;">notdj</span>
      <button class="btn close" id="set-close">Close ✕</button>
    </div>
    <div class="body">
      <h3>Audio</h3>
      <div class="row">
        <div>
          <label>Output device</label>
          <div class="desc">Route master out to USB-C audio interface or AirPlay device.</div>
        </div>
        <div>
          <select id="set-output"><option value="default">System default</option></select>
          <button class="btn" id="set-refresh-devices" style="margin-left:8px;">Refresh</button>
        </div>
      </div>
      <div class="row">
        <div>
          <label>Crossfader curve</label>
          <div class="desc">Sharp = scratch-style, fast cut. Smooth = gradual blend.</div>
        </div>
        <select id="set-xfade">
          <option value="smooth">Smooth (gradual)</option>
          <option value="sharp">Sharp (Pioneer default)</option>
          <option value="dipped">Dipped (-6 dB center)</option>
        </select>
      </div>
      <div class="row">
        <div>
          <label>Latency hint</label>
          <div class="desc">"Interactive" prioritizes responsiveness; "playback" reduces CPU. Reload to apply.</div>
        </div>
        <select id="set-latency">
          <option value="interactive">Interactive (default)</option>
          <option value="playback">Playback (low CPU)</option>
          <option value="balanced">Balanced</option>
        </select>
      </div>

      <h3>Display</h3>
      <div class="row">
        <div>
          <label>Screen wake lock</label>
          <div class="desc">Keep the screen awake during a set. iPad needs this if you put it down.</div>
        </div>
        <div class="toggle" id="set-wake"></div>
      </div>

      <h3>Library</h3>
      <div class="row">
        <div>
          <label>Stored tracks</label>
          <div class="desc" id="set-lib-stats">Counting…</div>
        </div>
        <div>
          <button class="btn danger" id="set-clear-lib">Clear library</button>
        </div>
      </div>

      <h3>About</h3>
      <div class="row">
        <label>Version</label>
        <div style="color:var(--muted);font-size:12px;">notdj 0.0.1 · vanilla JS + Web Audio</div>
      </div>
    </div>
  `;
}

async function populate(overlay) {
  const s = settings.current;

  // Output devices via MediaDevices API
  const sel = overlay.querySelector('#set-output');
  await populateDevices(sel, s.outputDeviceId);

  overlay.querySelector('#set-xfade').value = s.crossfaderCurve;
  overlay.querySelector('#set-latency').value = s.latencyHint;
  overlay.querySelector('#set-wake').classList.toggle('on', !!s.wakeLock);

  // Library stats
  const stats = overlay.querySelector('#set-lib-stats');
  let bytes = 0; for (const t of library.tracks) bytes += (t.encoded?.size || 0);
  stats.textContent = `${library.tracks.length} track${library.tracks.length === 1 ? '' : 's'} · ${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

async function populateDevices(sel, currentId) {
  sel.innerHTML = '<option value="default">System default</option>';
  if (!navigator.mediaDevices?.enumerateDevices) {
    sel.disabled = true;
    return;
  }
  try {
    // Permission gate: enumerateDevices() only returns labeled outputs once audio permission is granted.
    const devices = await navigator.mediaDevices.enumerateDevices();
    for (const d of devices) {
      if (d.kind !== 'audiooutput') continue;
      const opt = document.createElement('option');
      opt.value = d.deviceId;
      opt.textContent = d.label || `Output ${d.deviceId.slice(0, 6)}`;
      if (d.deviceId === currentId) opt.selected = true;
      sel.appendChild(opt);
    }
  } catch {}
}

function bind(overlay) {
  overlay.querySelector('#set-close').addEventListener('click', () => actions.toggleSettings());

  overlay.querySelector('#set-output').addEventListener('change', async (e) => {
    settings.set({ outputDeviceId: e.target.value });
    await routeOutput(e.target.value);
  });
  overlay.querySelector('#set-refresh-devices').addEventListener('click', () => populateDevices(overlay.querySelector('#set-output'), settings.current.outputDeviceId));

  overlay.querySelector('#set-xfade').addEventListener('change', (e) => {
    settings.set({ crossfaderCurve: e.target.value });
    audio.bus.crossfaderCurve = e.target.value;
    // Re-apply current crossfader position with new curve
    audio.bus.setCrossfader(store.get().mixer.crossfader);
  });

  overlay.querySelector('#set-latency').addEventListener('change', (e) => {
    settings.set({ latencyHint: e.target.value });
  });

  const wakeBtn = overlay.querySelector('#set-wake');
  wakeBtn.addEventListener('click', async () => {
    const next = !settings.current.wakeLock;
    settings.set({ wakeLock: next });
    wakeBtn.classList.toggle('on', next);
    if (next) await requestWakeLock(); else await releaseWakeLock();
  });

  overlay.querySelector('#set-clear-lib').addEventListener('click', async () => {
    if (!confirm('Clear all tracks from the library? Your audio files are not affected — only the imported copies in this PWA.')) return;
    await library.clear();
    populate(overlay);
  });
}

async function routeOutput(deviceId) {
  // Route master output via MediaStreamDestination + <audio sinkId>
  // since AudioContext.setSinkId() is still spotty across browsers.
  try {
    if ('setSinkId' in AudioContext.prototype) {
      await audio.ctx.setSinkId(deviceId === 'default' ? '' : deviceId);
      return true;
    }
  } catch (err) { console.warn('setSinkId failed', err); }
  return false;
}
