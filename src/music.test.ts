import { describe, expect, it } from 'vitest';
import {
  MUSICAL_KEYS,
  createScaleNotes,
  noteToFrequency,
} from './music';

describe('createScaleNotes', () => {
  it('reproduces the supplied G-major structure exactly', () => {
    expect(createScaleNotes('g-major')).toEqual([
      'G2', 'G3', 'D4', 'G4', 'B4', 'D5', 'G5', 'A5', 'B5', 'D6',
      'E6', 'G6', 'A6', 'B6', 'D7', 'E7', 'F#7', 'G7', 'A7', 'B7',
      'C8', 'D8', 'E8', 'F#8', 'G8',
    ]);
  });

  it('preserves the original E-minor structure exactly', () => {
    expect(createScaleNotes('e-minor')).toEqual([
      'E2', 'E3', 'B3', 'E4', 'G4', 'B4', 'E5', 'F#5', 'G5', 'B5',
      'D6', 'E6', 'F#6', 'G6', 'A6', 'B6', 'C7', 'D7', 'E7', 'F#7',
      'G7', 'A7', 'B7', 'C8', 'D8', 'E8',
    ]);
  });

  it('provides an ascending six-octave structure for all 24 keys', () => {
    expect(MUSICAL_KEYS).toHaveLength(24);
    expect(new Set(MUSICAL_KEYS.map((key) => key.id))).toHaveLength(24);

    MUSICAL_KEYS.forEach((key) => {
      const notes = createScaleNotes(key.id);
      const frequencies = notes.map(noteToFrequency);

      expect(notes).toHaveLength(key.mode === 'major' ? 25 : 26);
      expect(notes[0]).toBe(`${key.tonic}2`);
      expect(notes.at(-1)).toBe(`${key.tonic}8`);

      for (let index = 1; index < frequencies.length; index += 1) {
        expect(frequencies[index]).toBeGreaterThan(frequencies[index - 1] ?? 0);
      }
    });
  });
});

describe('noteToFrequency', () => {
  it('supports enharmonic and boundary-crossing accidentals', () => {
    expect(noteToFrequency('A4')).toBeCloseTo(440, 8);
    expect(noteToFrequency('E#4')).toBeCloseTo(noteToFrequency('F4'), 8);
    expect(noteToFrequency('Cb4')).toBeCloseTo(noteToFrequency('B3'), 8);
    expect(noteToFrequency('B#3')).toBeCloseTo(noteToFrequency('C4'), 8);
  });
});
