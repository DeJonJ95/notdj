# notdj

Touch-first DJ controller PWA for iPad Pro. Pioneer CDJ-3000 + DJM-A9 inspired layout, vanilla JS, Canvas rendering, Web Audio API DSP.

## Dev

```
npm install
npm run dev
```

Open on iPad Safari, "Add to Home Screen" for standalone fullscreen.

## Audio source

Local files (drag-drop / folder picker / File System Access API). No DRM streaming — full PCM access for EQ, FX, scratch, beat-sync.

## Phases

1. PWA shell + manifest + service worker  ← **here**
2. State store + audio engine + mixer bus
3. Canvas renderers + touch gesture engine
4. Local library, decoder, metadata worker, IndexedDB cache
5. Deck / mixer / browser / transport / FX UI
6. AudioWorklet FX, hot cues, loops, beat-sync, slip mode, key shift
7. Service worker polish, iPad safe-area + audio output routing, prod build
