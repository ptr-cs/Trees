import { noteToMidi, type ScaleNote } from './music';
import type { GeneratedTree } from './tree';

export const MIDI_TRACK_COUNT = 15;
export const MIDI_CENTER_TRACK = 8;
export const MIDI_TICKS_PER_BEAT = 480;
export const MIDI_WARM_PAD_PROGRAM = 89;
export const MIDI_FINAL_HOLD_BEATS = 4;

export interface MidiNotePlacement {
  track: number;
  generation: number;
  note: ScaleNote;
  midiNote: number;
  startTick: number;
  endTick: number;
  velocity: number;
}

export interface MidiTrackArrangement {
  number: number;
  channel: number;
  pan: number;
  name: string;
  notes: MidiNotePlacement[];
}

export interface MidiArrangement {
  tracks: MidiTrackArrangement[];
  generationCount: number;
  endTick: number;
}

interface TimedMidiEvent {
  tick: number;
  priority: number;
  bytes: number[];
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function channelForTrack(track: number): number {
  const zeroBasedTrack = track - 1;
  return zeroBasedTrack < 9 ? zeroBasedTrack : zeroBasedTrack + 1;
}

function displayChannel(channel: number): string {
  return String(channel + 1).padStart(2, '0');
}

function panForTrack(track: number): number {
  return Math.round(((track - 1) / (MIDI_TRACK_COUNT - 1)) * 127);
}

function trackPositionName(track: number): string {
  if (track === MIDI_CENTER_TRACK) return 'Center';

  const distance = Math.round(Math.abs(track - MIDI_CENTER_TRACK) / (MIDI_CENTER_TRACK - 1) * 100);
  return `${track < MIDI_CENTER_TRACK ? 'L' : 'R'}${distance}`;
}

export function arrangeTreeForMidi(
  tree: GeneratedTree,
  scaleNotes: readonly ScaleNote[],
): MidiArrangement {
  const generationCount = Math.min(
    tree.levels.length,
    Math.max(0, scaleNotes.length - 1),
  );
  const endTick = Math.max(
    MIDI_TICKS_PER_BEAT * MIDI_FINAL_HOLD_BEATS,
    (generationCount - 1) * MIDI_TICKS_PER_BEAT
      + MIDI_TICKS_PER_BEAT * MIDI_FINAL_HOLD_BEATS,
  );
  const tracks: MidiTrackArrangement[] = Array.from(
    { length: MIDI_TRACK_COUNT },
    (_value, index) => {
      const number = index + 1;
      return {
        number,
        channel: channelForTrack(number),
        pan: panForTrack(number),
        name: `${String(number).padStart(2, '0')} Warm Pad · Ch ${displayChannel(channelForTrack(number))} · ${trackPositionName(number)}`,
        notes: [],
      };
    },
  );
  const trackByNodeId = new Map<string, number>();
  const placements = new Set<string>();

  for (let generation = 0; generation < generationCount; generation += 1) {
    const level = tree.levels[generation] ?? [];
    const note = scaleNotes[generation + 1];

    if (note === undefined) continue;

    for (const node of level) {
      let track: number | undefined;

      if (generation === 0) {
        track = MIDI_CENTER_TRACK;
      } else if (node.parentId !== null) {
        const parentTrack = trackByNodeId.get(node.parentId);

        if (parentTrack !== undefined) {
          track = clamp(
            parentTrack + (node.side === 'left' ? -1 : 1),
            1,
            MIDI_TRACK_COUNT,
          );
        }
      }

      if (track === undefined) continue;

      trackByNodeId.set(node.id, track);
      const placementKey = `${track}:${generation}:${note}`;

      if (placements.has(placementKey)) continue;

      placements.add(placementKey);
      const placement: MidiNotePlacement = {
        track,
        generation,
        note,
        midiNote: clamp(noteToMidi(note), 0, 127),
        startTick: generation * MIDI_TICKS_PER_BEAT,
        endTick,
        velocity: Math.max(46, 86 - generation * 4),
      };
      tracks[track - 1]?.notes.push(placement);
    }
  }

  return { tracks, generationCount, endTick };
}

function encodeVariableLength(value: number): number[] {
  let remaining = Math.max(0, Math.trunc(value));
  const bytes = [remaining & 0x7f];

  while ((remaining >>= 7) > 0) {
    bytes.unshift((remaining & 0x7f) | 0x80);
  }

  return bytes;
}

function encodeTextMeta(type: number, text: string): number[] {
  const encoded = [...new TextEncoder().encode(text)];
  return [0xff, type, ...encodeVariableLength(encoded.length), ...encoded];
}

function encodeTrack(events: TimedMidiEvent[]): number[] {
  const sorted = [...events].sort((left, right) => (
    left.tick - right.tick || left.priority - right.priority
  ));
  const bytes: number[] = [];
  let previousTick = 0;

  for (const event of sorted) {
    bytes.push(...encodeVariableLength(event.tick - previousTick), ...event.bytes);
    previousTick = event.tick;
  }

  bytes.push(0, 0xff, 0x2f, 0);
  return bytes;
}

function unsigned16(value: number): number[] {
  return [(value >>> 8) & 0xff, value & 0xff];
}

function unsigned32(value: number): number[] {
  return [
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff,
  ];
}

function chunk(name: string, data: readonly number[]): number[] {
  return [
    ...[...name].map((character) => character.charCodeAt(0)),
    ...unsigned32(data.length),
    ...data,
  ];
}

export function createMidiFile(
  arrangement: MidiArrangement,
  tempo: number,
  title: string,
): Uint8Array {
  const safeTempo = clamp(Math.round(tempo), 20, 300);
  const microsecondsPerBeat = Math.round(60_000_000 / safeTempo);
  const trackChunks = arrangement.tracks.map((track, index) => {
    const statusChannel = track.channel & 0x0f;
    const events: TimedMidiEvent[] = [
      { tick: 0, priority: 0, bytes: encodeTextMeta(0x03, track.name) },
      { tick: 0, priority: 1, bytes: encodeTextMeta(0x04, 'Warm Pad (GM 90)') },
      { tick: 0, priority: 2, bytes: [0xff, 0x20, 0x01, statusChannel] },
      { tick: 0, priority: 3, bytes: [0xc0 | statusChannel, MIDI_WARM_PAD_PROGRAM] },
      { tick: 0, priority: 4, bytes: [0xb0 | statusChannel, 10, track.pan] },
      { tick: 0, priority: 5, bytes: [0xb0 | statusChannel, 7, 100] },
      { tick: 0, priority: 6, bytes: [0xb0 | statusChannel, 91, 58] },
      { tick: 0, priority: 7, bytes: [0xb0 | statusChannel, 64, 127] },
    ];

    if (index === 0) {
      events.push(
        { tick: 0, priority: 0, bytes: encodeTextMeta(0x01, title) },
        {
          tick: 0,
          priority: 2,
          bytes: [
            0xff,
            0x51,
            0x03,
            (microsecondsPerBeat >>> 16) & 0xff,
            (microsecondsPerBeat >>> 8) & 0xff,
            microsecondsPerBeat & 0xff,
          ],
        },
        { tick: 0, priority: 2, bytes: [0xff, 0x58, 0x04, 4, 2, 24, 8] },
      );
    }

    track.notes.forEach((note) => {
      events.push(
        {
          tick: note.startTick,
          priority: 10,
          bytes: [0x90 | statusChannel, note.midiNote, note.velocity],
        },
        {
          tick: note.endTick,
          priority: 20,
          bytes: [0x80 | statusChannel, note.midiNote, 0],
        },
      );
    });
    events.push({
      tick: arrangement.endTick,
      priority: 21,
      bytes: [0xb0 | statusChannel, 64, 0],
    });

    return chunk('MTrk', encodeTrack(events));
  });
  const header = chunk('MThd', [
    ...unsigned16(1),
    ...unsigned16(MIDI_TRACK_COUNT),
    ...unsigned16(MIDI_TICKS_PER_BEAT),
  ]);

  return new Uint8Array([...header, ...trackChunks.flat()]);
}

export function midiFilename(keyLabel: string, seed: number): string {
  const slug = keyLabel
    .replace(/♯/g, ' sharp ')
    .replace(/♭/g, ' flat ')
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
  return `canopy-${slug}-seed-${seed}.mid`;
}
