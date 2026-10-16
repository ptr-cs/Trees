export const MAJOR_SCALE_STRUCTURE = [
  0, 12, 19, 24, 28, 31, 36, 38, 40, 43, 45, 48, 50,
  52, 55, 57, 59, 60, 62, 64, 65, 67, 69, 71, 72,
] as const;

export const MINOR_SCALE_STRUCTURE = [
  0, 12, 19, 24, 27, 31, 36, 38, 39, 43, 46, 48, 50,
  51, 53, 55, 56, 58, 60, 62, 63, 65, 67, 68, 70, 72,
] as const;

export type ScaleMode = 'major' | 'minor';
export type ScaleNote = string;

export const MUSICAL_KEYS = [
  { id: 'c-major', tonic: 'C', mode: 'major', label: 'C major' },
  { id: 'db-major', tonic: 'Db', mode: 'major', label: 'D♭ major' },
  { id: 'd-major', tonic: 'D', mode: 'major', label: 'D major' },
  { id: 'eb-major', tonic: 'Eb', mode: 'major', label: 'E♭ major' },
  { id: 'e-major', tonic: 'E', mode: 'major', label: 'E major' },
  { id: 'f-major', tonic: 'F', mode: 'major', label: 'F major' },
  { id: 'fs-major', tonic: 'F#', mode: 'major', label: 'F♯ major' },
  { id: 'g-major', tonic: 'G', mode: 'major', label: 'G major' },
  { id: 'ab-major', tonic: 'Ab', mode: 'major', label: 'A♭ major' },
  { id: 'a-major', tonic: 'A', mode: 'major', label: 'A major' },
  { id: 'bb-major', tonic: 'Bb', mode: 'major', label: 'B♭ major' },
  { id: 'b-major', tonic: 'B', mode: 'major', label: 'B major' },
  { id: 'c-minor', tonic: 'C', mode: 'minor', label: 'C minor' },
  { id: 'cs-minor', tonic: 'C#', mode: 'minor', label: 'C♯ minor' },
  { id: 'd-minor', tonic: 'D', mode: 'minor', label: 'D minor' },
  { id: 'eb-minor', tonic: 'Eb', mode: 'minor', label: 'E♭ minor' },
  { id: 'e-minor', tonic: 'E', mode: 'minor', label: 'E minor' },
  { id: 'f-minor', tonic: 'F', mode: 'minor', label: 'F minor' },
  { id: 'fs-minor', tonic: 'F#', mode: 'minor', label: 'F♯ minor' },
  { id: 'g-minor', tonic: 'G', mode: 'minor', label: 'G minor' },
  { id: 'gs-minor', tonic: 'G#', mode: 'minor', label: 'G♯ minor' },
  { id: 'a-minor', tonic: 'A', mode: 'minor', label: 'A minor' },
  { id: 'bb-minor', tonic: 'Bb', mode: 'minor', label: 'B♭ minor' },
  { id: 'b-minor', tonic: 'B', mode: 'minor', label: 'B minor' },
] as const;

export type MusicalKey = (typeof MUSICAL_KEYS)[number];
export type MusicalKeyId = MusicalKey['id'];

export const DEFAULT_KEY_ID: MusicalKeyId = 'e-minor';

const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const;
const NATURAL_SEMITONES: Readonly<Record<(typeof LETTERS)[number], number>> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};
const MODE_INTERVALS: Readonly<Record<ScaleMode, readonly number[]>> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
};

function modulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

function parsePitchClass(pitch: string): { letter: (typeof LETTERS)[number]; alteration: number } {
  const match = /^([A-G])([#b]*)$/.exec(pitch);

  if (!match) {
    throw new Error(`Invalid pitch class: ${pitch}`);
  }

  const letter = match[1] as (typeof LETTERS)[number];
  const accidentals = match[2] ?? '';
  const alteration = [...accidentals].reduce(
    (total, accidental) => total + (accidental === '#' ? 1 : -1),
    0,
  );

  return { letter, alteration };
}

function pitchClassSemitone(pitch: string): number {
  const { letter, alteration } = parsePitchClass(pitch);
  return modulo(NATURAL_SEMITONES[letter] + alteration, 12);
}

function scalePitchClasses(key: MusicalKey): string[] {
  const tonic = parsePitchClass(key.tonic);
  const tonicLetterIndex = LETTERS.indexOf(tonic.letter);
  const tonicSemitone = pitchClassSemitone(key.tonic);

  return MODE_INTERVALS[key.mode].map((interval, degree) => {
    const letter = LETTERS[(tonicLetterIndex + degree) % LETTERS.length] ?? 'C';
    const targetSemitone = modulo(tonicSemitone + interval, 12);
    let alteration = targetSemitone - NATURAL_SEMITONES[letter];

    if (alteration > 6) alteration -= 12;
    if (alteration < -6) alteration += 12;

    return `${letter}${alteration > 0 ? '#'.repeat(alteration) : 'b'.repeat(-alteration)}`;
  });
}

export function isMusicalKeyId(value: string): value is MusicalKeyId {
  return MUSICAL_KEYS.some((key) => key.id === value);
}

export function getMusicalKey(id: MusicalKeyId): MusicalKey {
  const key = MUSICAL_KEYS.find((candidate) => candidate.id === id);

  if (key === undefined) {
    throw new Error(`Unknown musical key: ${id}`);
  }

  return key;
}

export function createScaleNotes(id: MusicalKeyId): ScaleNote[] {
  const key = getMusicalKey(id);
  const structure = key.mode === 'major' ? MAJOR_SCALE_STRUCTURE : MINOR_SCALE_STRUCTURE;
  const degreeIntervals = MODE_INTERVALS[key.mode];
  const pitchClasses = scalePitchClasses(key);
  const tonicMidi = (2 + 1) * 12 + pitchClassSemitone(key.tonic);

  return structure.map((offset) => {
    const pitchClassOffset = modulo(offset, 12);
    const degree = degreeIntervals.indexOf(pitchClassOffset);
    const pitchClass = pitchClasses[degree];

    if (pitchClass === undefined) {
      throw new Error(`Scale structure contains a note outside ${key.label}: ${offset}`);
    }

    const midi = tonicMidi + offset;
    const { letter, alteration } = parsePitchClass(pitchClass);
    const octave = (midi - NATURAL_SEMITONES[letter] - alteration) / 12 - 1;

    return `${pitchClass}${octave}`;
  });
}

export const SCALE_NOTES = createScaleNotes(DEFAULT_KEY_ID);

export function noteToMidi(note: string): number {
  const match = /^([A-G])([#b]*)(-?\d+)$/.exec(note);

  if (!match) {
    throw new Error(`Invalid scientific pitch notation: ${note}`);
  }

  const letter = match[1] as (typeof LETTERS)[number];
  const accidentals = match[2] ?? '';
  const octave = Number(match[3]);
  const alteration = [...accidentals].reduce(
    (total, accidental) => total + (accidental === '#' ? 1 : -1),
    0,
  );

  if (!Number.isInteger(octave)) {
    throw new Error(`Invalid scientific pitch notation: ${note}`);
  }

  return (octave + 1) * 12 + NATURAL_SEMITONES[letter] + alteration;
}

export function noteToFrequency(note: string): number {
  return 440 * 2 ** ((noteToMidi(note) - 69) / 12);
}

export function formatFrequency(frequency: number): string {
  if (frequency >= 1000) {
    return `${(frequency / 1000).toFixed(2)} kHz`;
  }

  return `${frequency.toFixed(1)} Hz`;
}
