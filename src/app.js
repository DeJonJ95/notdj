import { store } from './state/index.js';
import { audio } from './engine/audio-engine.js';
import { sync } from './engine/sync-engine.js';
import { Renderer } from './ui/render.js';
import { GestureEngine } from './ui/gestures.js';
import { actions } from './ui/actions.js';
import { initLibrary } from './ui/library.js';
import { initSettings, applyInitialSettings, settings } from './ui/settings.js';
import { library } from './services/library-manager.js';

export async function bootApp(root) {
  await audio.start();
  store.set('ui', { ready: true });

  root.innerHTML = `
    <canvas id="stage" style="position:absolute;inset:0;width:100%;height:100%;"></canvas>
    <div id="drop-hint" style="position:absolute;left:50%;top:8px;transform:translateX(-50%);color:var(--muted);font-size:10px;letter-spacing:0.08em;text-transform:uppercase;pointer-events:none;">drag audio files onto decks · or double-tap to pick</div>
  `;

  const canvas = document.getElementById('stage');
  const renderer = new Renderer(canvas, () => store.get());
  new GestureEngine(canvas, renderer.getRegions, actions);
  renderer.start();
  initLibrary(root);
  initSettings(root);
  applyInitialSettings();
  await library.hydrate();

  // Sync sampler slot active state when a sample starts / ends naturally
  audio.sampler.onTrigger = (idx) => {
    const slots = [...store.get().sampler.slots];
    if (slots[idx]) slots[idx] = { ...slots[idx], active: audio.sampler.isPlaying(idx) };
    store.set('sampler', { slots });
  };

  // Apply persisted crossfader curve
  audio.bus.crossfaderCurve = settings.current.crossfaderCurve;

  // iOS audio interruption handling: resume context after phone calls / Siri.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && audio.ctx.state === 'suspended') {
      audio.ctx.resume().catch(() => {});
    }
  });

  // Track + display the current audio output device (speakers, BT headset, etc.)
  async function updateOutputDevice() {
    let label = 'Default';
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      // Pick the first non-default audio output with a label
      const out = devices.find((d) => d.kind === 'audiooutput' && d.deviceId !== 'default' && d.label);
      if (out) label = out.label;
    } catch {}
    store.set('ui', { outputDevice: label });
  }

  // Listen for device changes (Bluetooth connect/disconnect, plug/unplug headphones, etc.)
  // On change: resume the AudioContext if it got suspended, then refresh the indicator.
  if (navigator.mediaDevices) {
    navigator.mediaDevices.addEventListener('devicechange', async () => {
      if (audio.ctx?.state === 'suspended') {
        try { await audio.ctx.resume(); } catch {}
      }
      await updateOutputDevice();
    });
    // Prime the output device label on boot
    updateOutputDevice();
  }

  // Block iOS double-tap-to-zoom and long-press context menu inside the controller
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('contextmenu', (e) => e.preventDefault());

  // Drag-and-drop: files import to library + load onto deck; in-app drags carry track id.
  let lastDropHint;
  document.body.addEventListener('dragover', (e) => {
    e.preventDefault();
    const w = window.innerWidth;
    lastDropHint = e.clientX < w / 2 ? 'A' : 'B';
  });
  document.body.addEventListener('drop', async (e) => {
    e.preventDefault();
    const trackId = e.dataTransfer.getData('text/notdj-track');
    if (trackId) {
      const t = library.tracks.find((tr) => tr.id === trackId);
      if (t) await actions.loadFromLibrary(lastDropHint || 'A', t);
      return;
    }
    const files = [...e.dataTransfer.files].filter((f) => f.type.startsWith('audio/') || /\.(mp3|wav|flac|m4a|ogg|aac)$/i.test(f.name));
    if (!files.length) return;
    if (files.length <= 2) {
      for (let i = 0; i < files.length; i++) {
        const side = files.length === 1 ? lastDropHint || 'A' : (i === 0 ? 'A' : 'B');
        await actions.loadFile(side, files[i]);
      }
    } else {
      // Bulk import: just stash in library, don't auto-load
      await library.importFiles(files);
    }
  });

  // Hidden file input triggered by double-tap on header center
  const picker = document.createElement('input');
  picker.type = 'file'; picker.accept = 'audio/*,.mp3,.wav,.flac,.m4a,.aac,.ogg,.opus,.aiff,.aif'; picker.multiple = true; picker.style.display = 'none';
  document.body.appendChild(picker);
  picker.addEventListener('change', async () => {
    const files = [...picker.files];
    for (let i = 0; i < files.length && i < 2; i++) {
      await actions.loadFile(i === 0 ? 'A' : 'B', files[i]);
    }
    picker.value = '';
  });
  let lastTap = 0;
  canvas.addEventListener('pointerup', (e) => {
    if (e.clientY > 60) return;
    const now = performance.now();
    if (now - lastTap < 400) picker.click();
    lastTap = now;
  });

  // Live position + peak sampling -> drives waveform scroll and VU meters
  startSamplingLoop(renderer);
}

function startSamplingLoop(renderer) {
  const peakBufA = new Uint8Array(audio.bus.channels[0].analyser.fftSize);
  const peakBufB = new Uint8Array(audio.bus.channels[1].analyser.fftSize);
  function tick() {
    for (const id of ['A', 'B']) {
      const dp = audio.deck(id);
      if (dp.buffer && dp.isPlaying) {
        const i = id === 'A' ? 0 : 1;
        store.setIn('decks', i, { positionSec: dp.positionSec });
      }
    }
    sampleChannel(0, peakBufA);
    sampleChannel(1, peakBufB);

    // Maintain beat sync (follower locks to master tempo even as pitch fader moves)
    sync.maintain();

    // FX bpm follower: BPM-divisor times track the master deck.
    const masterId = sync.resolveMaster();
    if (masterId) {
      const md = store.get().decks.find((d) => d.id === masterId);
      if (md?.track) {
        const dp = audio.deck(masterId);
        const effBpm = md.track.bpm * dp.tempo;
        audio.fx.setBpm(effBpm);
      }
    }

    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

function sampleChannel(idx, buf) {
  const an = audio.bus.channels[idx].analyser;
  an.getByteTimeDomainData(buf);
  let peak = 0;
  for (let i = 0; i < buf.length; i++) {
    const v = Math.abs(buf[i] - 128) / 128;
    if (v > peak) peak = v;
  }
  const channels = [...store.get().mixer.channels];
  channels[idx] = { ...channels[idx], peakL: peak, peakR: peak };
  store.set('mixer', { channels });
}
