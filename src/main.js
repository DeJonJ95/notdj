import { bootApp } from './app.js';

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
  `;
  boot.addEventListener('pointerdown', start, { once: true });
}

async function start() {
  boot.remove();
  await bootApp(document.getElementById('app'));
}

if (authed()) renderTapToStart();
else renderGate();
