// Full-screen library overlay. DOM-based (not canvas) for fast text rendering,
// rich scrolling, and accessibility. Sits above the canvas controller.

import { library } from '../services/library-manager.js';
import { actions } from './actions.js';
import { store } from '../state/index.js';

let mounted = false;
let unsub = null;
let importInFlight = 0;
let importStatus = '';

export function initLibrary(root) {
  const overlay = document.createElement('div');
  overlay.id = 'library-overlay';
  overlay.innerHTML = template();
  Object.assign(overlay.style, {
    position: 'fixed', inset: '0', background: 'rgba(8,8,10,0.96)', backdropFilter: 'blur(20px)',
    display: 'none', zIndex: '50', color: 'var(--text)', flexDirection: 'column',
  });
  root.appendChild(overlay);

  // Toggle visibility based on ui.libraryOpen
  store.subscribe('ui', (ui) => {
    overlay.style.display = ui.libraryOpen ? 'flex' : 'none';
    if (ui.libraryOpen && !mounted) {
      mounted = true;
      bind(overlay);
    }
  });
}

function template() {
  return `
    <style>
      #library-overlay { font-family: -apple-system, system-ui, sans-serif; }
      #library-overlay .lib-header { display:flex; align-items:center; gap:12px; padding:16px 20px; border-bottom:1px solid var(--border); }
      #library-overlay .lib-header h1 { margin:0; font-size:18px; letter-spacing:0.04em; }
      #library-overlay .lib-search { flex:1; max-width:480px; background:var(--panel); border:1px solid var(--border); border-radius:8px; padding:10px 14px; color:var(--text); font-size:14px; outline:none; }
      #library-overlay .lib-search:focus { border-color: var(--deck-a); }
      #library-overlay .lib-btn { background:var(--panel); border:1px solid var(--border); color:var(--text); padding:8px 14px; border-radius:8px; cursor:pointer; font-size:12px; letter-spacing:0.06em; text-transform:uppercase; }
      #library-overlay .lib-btn:hover { border-color:var(--borderLit); }
      #library-overlay .lib-btn.primary { background:var(--deck-a); border-color:var(--deck-a); color:#fff; }
      #library-overlay .lib-btn.close { background:transparent; }
      #library-overlay .lib-body { flex:1; display:grid; grid-template-columns:200px 1fr; overflow:hidden; }
      #library-overlay .lib-sidebar { padding:16px; border-right:1px solid var(--border); overflow-y:auto; }
      #library-overlay .lib-sidebar h3 { margin:0 0 8px; color:var(--muted); font-size:10px; letter-spacing:0.1em; text-transform:uppercase; }
      #library-overlay .lib-sidebar .crate { padding:8px 10px; border-radius:6px; cursor:pointer; font-size:13px; }
      #library-overlay .lib-sidebar .crate.active { background:var(--panel); color:var(--deck-a); }
      #library-overlay .lib-sidebar .crate:hover { background:var(--panel); }
      #library-overlay .lib-list { overflow-y:auto; padding:8px 0; }
      #library-overlay .lib-row { display:grid; grid-template-columns:56px 1fr 80px 100px 60px 80px 80px; gap:10px; align-items:center; padding:8px 16px; border-bottom:1px solid #18181d; cursor:grab; }
      #library-overlay .lib-row:hover { background:var(--panel); }
      #library-overlay .lib-row.head { color:var(--muted); font-size:10px; letter-spacing:0.08em; text-transform:uppercase; cursor:default; position:sticky; top:0; background:var(--bg); border-bottom-color:var(--border); }
      #library-overlay .lib-art { width:40px; height:40px; border-radius:4px; background:var(--panel); object-fit:cover; }
      #library-overlay .lib-title { font-size:14px; color:var(--text); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      #library-overlay .lib-artist { font-size:11px; color:var(--muted); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      #library-overlay .lib-bpm { font-variant-numeric:tabular-nums; color:var(--text); }
      #library-overlay .lib-key { color:var(--muted); }
      #library-overlay .lib-dur { color:var(--muted); font-variant-numeric:tabular-nums; }
      #library-overlay .lib-load { background:var(--panel2); border:1px solid var(--border); color:var(--text); padding:4px 10px; border-radius:6px; font-size:11px; cursor:pointer; }
      #library-overlay .lib-load.a { color:var(--deck-a); border-color:var(--deck-a); }
      #library-overlay .lib-load.b { color:var(--deck-b); border-color:var(--deck-b); }
      #library-overlay .lib-empty { padding:60px 20px; text-align:center; color:var(--muted); }
      #library-overlay .lib-status { padding:8px 16px; color:var(--muted); font-size:11px; border-top:1px solid var(--border); }
    </style>
    <div class="lib-header">
      <h1>Library</h1>
      <input class="lib-search" placeholder="Search title, artist, album…" />
      <label class="lib-btn primary" style="cursor:pointer;">
        Import Files
        <input type="file" accept="audio/*" multiple style="display:none;" id="lib-import" />
      </label>
      <button class="lib-btn" id="lib-import-folder">Import Folder</button>
      <button class="lib-btn close" id="lib-close">Close ✕</button>
    </div>
    <div class="lib-body">
      <div class="lib-sidebar">
        <h3>Crates</h3>
        <div class="crate active" data-crate="all">All Tracks</div>
        <div class="crate" data-crate="recent">Recently Added</div>
        <div class="crate" data-crate="prepare">Prepare</div>
        <div class="crate" data-crate="history">History</div>
        <h3 style="margin-top:24px;">Smart</h3>
        <div class="crate" data-crate="low-bpm">90-110 BPM</div>
        <div class="crate" data-crate="mid-bpm">115-130 BPM</div>
        <div class="crate" data-crate="high-bpm">130+ BPM</div>
      </div>
      <div class="lib-list" id="lib-list">
        <div class="lib-row head">
          <span></span><span>TRACK</span><span>BPM</span><span>KEY</span><span>TIME</span><span>DECK A</span><span>DECK B</span>
        </div>
        <div class="lib-empty">Drop audio files anywhere, or click <strong>Import Files</strong>.</div>
      </div>
    </div>
    <div class="lib-status" id="lib-status"></div>
  `;
}

function bind(overlay) {
  const importInput = overlay.querySelector('#lib-import');
  const folderBtn = overlay.querySelector('#lib-import-folder');
  const closeBtn = overlay.querySelector('#lib-close');
  const search = overlay.querySelector('.lib-search');
  const list = overlay.querySelector('#lib-list');
  const status = overlay.querySelector('#lib-status');

  let filter = 'all';
  let query = '';

  importInput.addEventListener('change', async () => {
    const files = [...importInput.files];
    await runImport(files, status);
    importInput.value = '';
  });

  folderBtn.addEventListener('click', async () => {
    if (!window.showDirectoryPicker) {
      status.textContent = 'Folder picker not supported in this browser — use Import Files instead.';
      return;
    }
    try {
      const dir = await window.showDirectoryPicker();
      const files = [];
      for await (const [name, handle] of dir.entries()) {
        if (handle.kind === 'file' && /\.(mp3|wav|flac|m4a|ogg|aac)$/i.test(name)) {
          files.push(await handle.getFile());
        }
      }
      await runImport(files, status);
    } catch {}
  });

  closeBtn.addEventListener('click', () => actions.toggleLibrary());

  search.addEventListener('input', () => { query = search.value.toLowerCase(); render(); });

  overlay.querySelectorAll('.crate').forEach((el) => {
    el.addEventListener('click', () => {
      overlay.querySelectorAll('.crate').forEach((e) => e.classList.remove('active'));
      el.classList.add('active');
      filter = el.dataset.crate;
      render();
    });
  });

  unsub = library.subscribe(render);

  function render() {
    let tracks = library.tracks;
    if (filter === 'recent') tracks = tracks.slice(0, 50);
    else if (filter === 'low-bpm') tracks = tracks.filter((t) => t.bpm >= 90 && t.bpm < 115);
    else if (filter === 'mid-bpm') tracks = tracks.filter((t) => t.bpm >= 115 && t.bpm < 130);
    else if (filter === 'high-bpm') tracks = tracks.filter((t) => t.bpm >= 130);
    if (query) {
      tracks = tracks.filter((t) =>
        t.title.toLowerCase().includes(query) ||
        t.artist.toLowerCase().includes(query) ||
        (t.album || '').toLowerCase().includes(query)
      );
    }
    const rows = tracks.map(rowHtml).join('');
    list.innerHTML = `
      <div class="lib-row head"><span></span><span>TRACK</span><span>BPM</span><span>KEY</span><span>TIME</span><span>DECK A</span><span>DECK B</span></div>
      ${rows || '<div class="lib-empty">No tracks. Drop files anywhere or click Import.</div>'}
    `;
    // Bind row buttons
    list.querySelectorAll('[data-load]').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        const deck = btn.dataset.load;
        const track = library.tracks.find((t) => t.id === id);
        if (!track) return;
        status.textContent = `Loading ${track.title} into Deck ${deck}…`;
        await actions.loadFromLibrary(deck, track);
        status.textContent = `Loaded ${track.title} into Deck ${deck}.`;
        actions.toggleLibrary();
      });
    });
    // Drag to deck
    list.querySelectorAll('.lib-row[data-id]').forEach((row) => {
      row.draggable = true;
      row.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/notdj-track', row.dataset.id);
        e.dataTransfer.effectAllowed = 'copy';
      });
    });
    status.textContent = `${library.tracks.length} track${library.tracks.length === 1 ? '' : 's'}`;
  }

  function rowHtml(t) {
    const dur = fmt(t.durationSec);
    const art = t.artwork ? `<img class="lib-art" src="${URL.createObjectURL(t.artwork)}" />` : `<div class="lib-art"></div>`;
    return `
      <div class="lib-row" data-id="${t.id}">
        ${art}
        <div>
          <div class="lib-title">${escape(t.title)}</div>
          <div class="lib-artist">${escape(t.artist || '—')}${t.album ? ' · ' + escape(t.album) : ''}</div>
        </div>
        <div class="lib-bpm">${t.bpm.toFixed(1)}</div>
        <div class="lib-key">${escape(t.key || '—')}</div>
        <div class="lib-dur">${dur}</div>
        <button class="lib-load a" data-load="A" data-id="${t.id}">→ A</button>
        <button class="lib-load b" data-load="B" data-id="${t.id}">→ B</button>
      </div>
    `;
  }
}

async function runImport(files, statusEl) {
  if (!files.length) return;
  importInFlight++;
  statusEl.textContent = `Importing 0 / ${files.length}…`;
  await library.importFiles(files, {
    onProgress: (p, name) => {
      statusEl.textContent = `Importing ${Math.floor(p * files.length)} / ${files.length} — ${name || ''}`;
    },
  });
  importInFlight--;
  statusEl.textContent = `Imported ${files.length} file${files.length === 1 ? '' : 's'}.`;
}

function escape(s) { return String(s).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c])); }
function fmt(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
