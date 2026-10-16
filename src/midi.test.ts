import { describe, expect, it } from 'vitest';
import { createScaleNotes } from './music';
import {
  MIDI_CENTER_TRACK,
  MIDI_FINAL_HOLD_BEATS,
  MIDI_TRACK_COUNT,
  MIDI_TICKS_PER_BEAT,
  MIDI_WARM_PAD_PROGRAM,
  arrangeTreeForMidi,
  createMidiFile,
  midiFilename,
} from './midi';
import { generateTree } from './tree';

function fullMidiTree(key: 'e-minor' | 'g-major') {
  const scale = createScaleNotes(key);
  return generateTree({
    key,
    seed: 4162,
    splitChance: 1,
    maxNodesPerGeneration: 128,
    generations: scale.length - 1,
  });
}

describe('arrangeTreeForMidi', () => {
  it('maps the root and successive branches onto 15 sustained track lanes', () => {
    const arrangement = arrangeTreeForMidi(fullMidiTree('e-minor'), createScaleNotes('e-minor'));
    const center = arrangement.tracks[MIDI_CENTER_TRACK - 1];
    const generations = arrangement.tracks
      .flatMap((track) => track.notes)
      .map((note) => note.generation);

    expect(arrangement.tracks).toHaveLength(15);
    expect(arrangement.generationCount).toBe(createScaleNotes('e-minor').length - 1);
    expect(center?.pan).toBe(64);
    expect(center?.notes[0]).toMatchObject({ track: 8, generation: 0, note: 'E3' });
    expect(arrangement.tracks[6]?.notes.some((note) => note.generation === 1)).toBe(true);
    expect(arrangement.tracks[8]?.notes.some((note) => note.generation === 1)).toBe(true);
    expect(center?.notes.some((note) => note.generation > 0)).toBe(true);
    expect(arrangement.tracks.flatMap((track) => track.notes).some(
      (note) => note.generation === arrangement.generationCount - 1 && note.note === 'E8',
    )).toBe(true);
    expect([...new Set(generations)].sort((left, right) => left - right)).toEqual(
      Array.from({ length: arrangement.generationCount }, (_value, generation) => generation),
    );
    expect(arrangement.tracks.every((track) => track.notes.every(
      (note) => note.endTick === arrangement.endTick,
    ))).toBe(true);
    expect(arrangement.endTick).toBe(
      (arrangement.generationCount - 1 + MIDI_FINAL_HOLD_BEATS) * MIDI_TICKS_PER_BEAT,
    );
    expect(arrangement.tracks.map((track) => track.pan)).toEqual([
      0, 9, 18, 27, 36, 45, 54, 64, 73, 82, 91, 100, 109, 118, 127,
    ]);
    expect(arrangement.tracks.map((track) => track.channel)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 15,
    ]);
  });

  it('starts G-major exports at G3 rather than G2', () => {
    const arrangement = arrangeTreeForMidi(fullMidiTree('g-major'), createScaleNotes('g-major'));
    expect(arrangement.tracks[7]?.notes[0]?.note).toBe('G3');
    expect(arrangement.generationCount).toBe(createScaleNotes('g-major').length - 1);
    expect(arrangement.tracks.flatMap((track) => track.notes).some(
      (note) => note.generation === arrangement.generationCount - 1 && note.note === 'G8',
    )).toBe(true);
  });
});

describe('createMidiFile', () => {
  it('writes a format-1 file with exactly 15 Warm Pad tracks', () => {
    const arrangement = arrangeTreeForMidi(fullMidiTree('e-minor'), createScaleNotes('e-minor'));
    const midi = createMidiFile(arrangement, 112, 'Canopy in E minor');
    const ascii = new TextDecoder('latin1').decode(midi);

    expect(ascii.slice(0, 4)).toBe('MThd');
    expect([...midi.slice(8, 12)]).toEqual([0, 1, 0, MIDI_TRACK_COUNT]);
    expect(ascii.match(/MTrk/g)).toHaveLength(MIDI_TRACK_COUNT);
    expect([...midi].filter((byte, index, bytes) => (
      byte === MIDI_WARM_PAD_PROGRAM && (bytes[index - 1] ?? 0) >= 0xc0 && (bytes[index - 1] ?? 0) <= 0xcf
    ))).toHaveLength(MIDI_TRACK_COUNT);
  });

  it('creates a filesystem-safe descriptive filename', () => {
    expect(midiFilename('F♯ major', 4162)).toBe('canopy-f-sharp-major-seed-4162.mid');
  });
});
