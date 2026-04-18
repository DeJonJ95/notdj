import { bootApp } from './app.js';
import { audio } from './engine/audio-engine.js';

const PASSWORD = 'platter';
const AUTH_KEY = 'notdj.auth';

const boot = document.getElementById('boot');

function authed() { return localStorage.getItem(AUTH_KEY) === 'ok'; }

function renderGate() {
  boot.innerHTML = `
    <div class="logo">notdj</div>
    <form id="auth-form" style="display:flex;flex-direction:column;gap:12px;align-items:center;">
      <input id="auth-pw" type="password" autocomplete="current-password" placeholder="password"
        style="background:#15151a;border:1px solid #26262e;color:#e8e8ec;padding:12px 16px;border-radius:8px;font-size:16px;font-family:inherit;letter-spacing:0.08em;text-align:center;outline:none;width:200px;" />
      <button type="submit" style="background:#ff6a1a;border:none;color:#fff;padding:10px 24px;border-radius:8px;font-size:13px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;cursor:pointer;">Enter</button>
      <div id="auth-msg" style="color:#ef4444;font-size:11px;height:14px;letter-spacing:0.06em;text-transform:uppercase;"></div>
    </form>
  `;
  const form = document.getElementById('auth-form');
  const input = document.getElementById('auth-pw');
  const msg = document.getElementById('auth-msg');
  input.focus();
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (input.value === PASSWORD) {
      localStorage.setItem(AUTH_KEY, 'ok');
      renderTapToStart();
    } else {
      msg.textContent = 'Wrong password';
      input.value = '';
      input.focus();
    }
  });
}

function renderTapToStart() {
  boot.innerHTML = `
    <div class="logo">notdj</div>
    <div class="hint">tap to start audio</div>
    <pre id="boot-log" style="margin:16px 0 0 0;color:#7a7a85;font-size:10px;letter-spacing:0.08em;text-transform:uppercase;font-family:inherit;white-space:pre-wrap;text-align:center;min-height:14em;"></pre>
  `;
  boot.addEventListener('pointerdown', start, { once: true });
}

function bootLog(line) {
  const el = document.getElementById('boot-log');
  if (el) el.textContent += line + '\n';
}

function showFatalError(err) {
  const stack = (err && (err.stack || err.message || String(err))) || 'unknown';
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:#0d0d10;color:#e8e8ec;padding:24px;font-family:-apple-system,system-ui,monospace;font-size:13px;overflow:auto;-webkit-user-select:text;user-select:text;';
  overlay.innerHTML = `
    <div style="color:#ef4444;font-size:16px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:12px;">boot failed</div>
    <div style="color:#7a7a85;font-size:11px;margin-bottom:4px;">User agent</div>
    <pre style="margin:0 0 16px 0;white-space:pre-wrap;word-break:break-all;">${navigator.userAgent}</pre>
    <div style="color:#7a7a85;font-size:11px;margin-bottom:4px;">Error</div>
    <pre style="margin:0;white-space:pre-wrap;word-break:break-word;color:#ff6a1a;">${escape(stack)}</pre>
    <button onclick="location.reload()" style="margin-top:20px;background:#ff6a1a;border:none;color:#fff;padding:10px 24px;border-radius:8px;font-size:13px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;cursor:pointer;">Reload</button>
    <button onclick="localStorage.clear();indexedDB.databases().then(d=>d.forEach(x=>indexedDB.deleteDatabase(x.name)));location.reload();" style="margin:20px 0 0 8px;background:#7a7a85;border:none;color:#fff;padding:10px 24px;border-radius:8px;font-size:13px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;cursor:pointer;">Reset + Reload</button>
  `;
  document.body.appendChild(overlay);
}

function escape(s) {
  return String(s).replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
}

async function start(e) {
  try {
    bootLog('1. creating audio context…');
    // CRITICAL: must construct + resume AudioContext synchronously from the gesture handler on iOS.
    // We do it here, before any awaits, so the gesture chain stays live.
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) throw new Error('Web Audio not supported in this browser');
    audio.ctx = new Ctx({ latencyHint: 'interactive' });
    bootLog('   state=' + audio.ctx.state + ' sr=' + audio.ctx.sampleRate);

    // Kick a silent buffer to fully unlock the context on iOS
    const unlockBuf = audio.ctx.createBuffer(1, 1, 22050);
    const unlockSrc = audio.ctx.createBufferSource();
    unlockSrc.buffer = unlockBuf;
    unlockSrc.connect(audio.ctx.destination);
    unlockSrc.start(0);

    if (audio.ctx.state === 'suspended') {
      bootLog('2. resuming context…');
      await audio.ctx.resume();
      bootLog('   state=' + audio.ctx.state);
    } else {
      bootLog('2. context already running');
    }

    bootLog('3. booting app…');
    await bootApp(document.getElementById('app'));
    bootLog('4. ready.');
    boot.remove();
  } catch (err) {
    console.error('bootApp failed:', err);
    showFatalError(err);
  }
}

window.addEventListener('error', (e) => showFatalError(e.error || e.message));
window.addEventListener('unhandledrejection', (e) => showFatalError(e.reason));

if (authed()) renderTapToStart();
else renderGate();
