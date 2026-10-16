<img width="3840" height="2160" alt="Trees-preview" src="https://github.com/user-attachments/assets/00ad4f3e-4fb0-448b-af1d-5055aefa1716" />
# Canopy — generative tree sonification

A seeded tree simulation and browser sonification built with Vite, TypeScript, SVG, and the Web Audio API. It supports all 12 chromatic major keys and all 12 chromatic minor keys.

The default root begins at **E2** in the center of the stereo field. Every generation advances one step through the selected modified major or natural-minor structure. Each parent continues left or right and may split to create a second, opposite limb. The generated horizontal position controls that limb's stereo pan.

## Run locally

```bash
npm install
npm run dev
```

Then open the local URL printed by Vite. Audio starts only after pressing **Listen from root**.

## Checks

```bash
npm test
npm run check
npm run build
```

## Controls

- **Musical key** selects one of 24 major/minor tonalities. Major paths contain 25 notes and minor paths contain 26.
- **Listen from root** schedules the complete growth sequence against the Web Audio clock, ending in a shared 8-second tree release.
- **Reverse sequence** starts at the highest canopy generation and progresses downward to the centered root. It applies to automatic playback, manual stepping, visuals, and the scale strip.
- **Grow one / Descend one** reveals and sounds one generation at a time.
- **Reset** returns to the current direction's starting generation while preserving the key and seed.
- **Scale reach** chooses where the ascent stops; full reach spans six octaves from tonic 2 to tonic 8.
- **Split chance** controls how often a parent produces both left and right limbs.
- **Canopy limit** caps simultaneous voices per generation so the binary tree cannot grow exponentially.
- **Seed** makes topology reproducible.
- **Growth pace**, **stereo width**, and **output** shape playback without changing the tree.
- **Sustain notes** holds every generation sounded while the option is enabled through the end of automatic playback (or until reset during manual traversal). Higher structural generations are voiced more softly to keep the accumulating harmony controlled.
- **Export 15-track MIDI** downloads a format-1 Standard MIDI File arranged as fixed stereo lanes. Track 8 is centered and contains the octave root (E3/G3 in the examples); successive left/right branches move one track outward. Once the 15 lanes are allocated, deeper branches reuse the edge tracks rather than creating more channels. The export follows the complete modified scale from the octave root through the final tonic—25 steps for minor and 24 for major—while skipping E2/G2. Notes enter one beat apart and all release together six beats after the final entrance.

Every exported track uses a unique non-drum MIDI channel, a MIDI Channel Prefix, an evenly spaced CC10 pan value, sustain, and General MIDI program 90, **Warm Pad**. Logic Pro can create a software-instrument track for every MIDI track when the file is opened; choose one installed ambient pad patch across the 15 tracks if you want a specific Logic Library sound.

Beginning after `GEN 04`, every branch receives a deterministic micro-tuning offset between `-2` and `+2` cents. Earlier generations remain at exact concert pitch, and the same seed always produces the same offsets.

Every generation also receives one seeded waveform shared by all of its branches: sine, soft sawtooth, soft triangle, or soft square. The three angular waveforms use restrained custom harmonic spectra, and a shared low-pass filter softens the complete mix. Replaying a seed preserves its timbre sequence; generating a new seed changes it.

Keyboard shortcuts: <kbd>Space</kbd> listen/stop, <kbd>→</kbd> grow one, and <kbd>R</kbd> reset.

## Scale examples

E minor:

`E2, E3, B3, E4, G4, B4, E5, F#5, G5, B5, D6, E6, F#6, G6, A6, B6, C7, D7, E7, F#7, G7, A7, B7, C8, D8, E8`

G major:

`G2, G3, D4, G4, B4, D5, G5, A5, B5, D6, E6, G6, A6, B6, D7, E7, F#7, G7, A7, B7, C8, D8, E8, F#8, G8`

No audio library is required: each branch is an enveloped oscillator voice with its own `StereoPannerNode`, routed through a shared low-pass filter, compressor, and conservative master gain.
