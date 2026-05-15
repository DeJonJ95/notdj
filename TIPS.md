# notdj tips

## Loading music

- **Drag & drop** audio files onto the left half of the screen to load on Deck A, right half for Deck B
- **Double-tap** the very top of the canvas (above the decks) to pick audio files
- **Open the library** (top-right button) to see all imported tracks — click `→ A` or `→ B`
- Dropped files are stored locally in your browser's IndexedDB — they survive reload

## Transport

| Button | What it does |
|---|---|
| **PLAY** | Start / stop playback |
| **CUE** | Pause and return to the start of the track |
| **SYNC** | Lock this deck's BPM + beat phase to the master deck |

## Sync explained

1. **Set a master** — tap the deck label (top of the deck panel) to toggle the `MASTER` badge
2. **Sync the other deck** — tap its SYNC button; it snaps to the master's tempo and aligns downbeats
3. **Stay locked** — if you move the master's pitch fader, the synced deck follows in real time
4. **Disengage** — tap SYNC again to take manual control back

The **phase scope** (tiny waveform strip in the master section) turns **green** when the two decks' beats are aligned.

## Pitch fader

- Drag the **pitch slider** (vertical fader on the inner edge of each deck) to adjust tempo
- Range: **±16%** (Pioneer DJM range)
- The BPM readout updates to show the effective tempo

## Hot cues (performance pads)

- Tap a pad to set a **hot cue** at the current position (or jump to it if one exists)
- **Long-press** a hot cue pad to delete it
- Switch pad modes with the row above the pads:
  - **HOT CUE** — save/jump to cue points
  - **LOOP** — set beat-synced loops (tap a loop size)
  - **BEAT JUMP** — jump forward by the selected number of beats
  - **SAMPLER** — trigger loaded samples

## Loops

- Use the **LOOP IN / LOOP OUT** strip buttons to set manual loop points
- **1/2×** halves the loop length, **2×** doubles it
- **◀ BEAT / BEAT ▶** nudges the playhead by one beat (great for phrasing)

## Mixer

- **EQ knobs** (HI / MID / LOW) — drag up/down to cut or boost (kill at full counter-clockwise)
- **FILTER** — left = low-pass filter sweep, right = high-pass filter sweep
- **Channel faders** — drag to set volume per channel
- **Crossfader** — slide to blend between decks A and B (assignable per channel: L / C / R)
- **MASTER knob** — overall output level

## Beat FX

- Toggle the beat FX **ON** to apply effects to CH1, CH2, or the master bus
- Tap the effect type label to cycle: ECHO → DELAY → REVERB → FLANGER → FILTER (filter sweep) → TRANS (beat-chopper)
- Set the **beat divisor** to control the effect timing (1/16 through 16 bars)

## Recording

- Tap **REC** in the header to start recording your mix
- Tap again to stop — a `.webm` file downloads automatically

## Settings

- Open the gear icon in the top-right
- **Crossfader curve**: Sharp (scratch-style cut) | Smooth (gradual blend) | Dipped (-6 dB center)
- **Screen wake lock**: Keeps the screen on during a set
- **Clear library**: Removes all imported tracks from local storage

## Audio output

- The **OUT** readout in the header shows where audio is playing (speakers, Bluetooth, etc.)
- Bluetooth headphones: if audio plays silently, disconnect and reconnect — or change the output device in Settings
- On iPad, use USB-C audio interfaces for low-latency output