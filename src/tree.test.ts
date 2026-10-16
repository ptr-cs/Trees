import { describe, expect, it } from 'vitest';
import { DEFAULT_KEY_ID, SCALE_NOTES, noteToFrequency } from './music';
import {
  GENERATION_WAVEFORMS,
  MICRO_DETUNE_AFTER_GENERATION,
  TREE_VIEWBOX,
  generateTree,
} from './tree';

const defaultOptions = {
  key: DEFAULT_KEY_ID,
  seed: 4162,
  splitChance: 0.42,
  maxNodesPerGeneration: 14,
  generations: SCALE_NOTES.length,
};

describe('generateTree', () => {
  it('starts with a centered E2 root and follows the supplied scale exactly', () => {
    const tree = generateTree(defaultOptions);
    const root = tree.levels[0]?.[0];

    expect(tree.levels).toHaveLength(SCALE_NOTES.length);
    expect(root).toMatchObject({
      parentId: null,
      generation: 0,
      note: 'E2',
      x: TREE_VIEWBOX.rootX,
      pan: 0,
      detuneCents: 0,
      side: 'root',
    });

    tree.levels.forEach((level, generation) => {
      expect(level.every((node) => node.note === SCALE_NOTES[generation])).toBe(true);
    });
  });

  it('gives every parent one or two correctly ordered children without exceeding the cap', () => {
    const tree = generateTree(defaultOptions);
    const byId = new Map(tree.nodes.map((node) => [node.id, node]));

    tree.levels.forEach((level) => {
      expect(level.length).toBeLessThanOrEqual(defaultOptions.maxNodesPerGeneration);
    });

    for (let generation = 1; generation < tree.levels.length; generation += 1) {
      const level = tree.levels[generation] ?? [];
      const parents = tree.levels[generation - 1] ?? [];

      for (const parent of parents) {
        const children = level.filter((node) => node.parentId === parent.id);
        expect(children.length).toBeGreaterThanOrEqual(1);
        expect(children.length).toBeLessThanOrEqual(2);
        expect(new Set(children.map((child) => child.side)).size).toBe(children.length);
      }

      for (const child of level) {
        const parent = child.parentId === null ? undefined : byId.get(child.parentId);
        expect(parent).toBeDefined();
        expect(child.generation).toBe((parent?.generation ?? -1) + 1);
        expect(child.y).toBeLessThan(parent?.y ?? Number.NEGATIVE_INFINITY);
        expect(Number.isFinite(child.pan)).toBe(true);
        expect(Math.abs(child.pan)).toBeLessThanOrEqual(0.94);

        if (child.side === 'left') {
          expect(child.x).toBeLessThan(parent?.x ?? Number.NEGATIVE_INFINITY);
        } else {
          expect(child.x).toBeGreaterThan(parent?.x ?? Number.POSITIVE_INFINITY);
        }
      }
    }
  });

  it('is deterministic for the same seed', () => {
    expect(generateTree(defaultOptions)).toEqual(generateTree(defaultOptions));
    expect(generateTree({ ...defaultOptions, seed: 4163 }).nodes).not.toEqual(
      generateTree(defaultOptions).nodes,
    );
  });

  it('uses the selected key and clamps reach to that mode structure', () => {
    const major = generateTree({ ...defaultOptions, key: 'g-major', generations: 99 });
    const minor = generateTree({ ...defaultOptions, key: 'e-minor', generations: 99 });

    expect(major.levels).toHaveLength(25);
    expect(major.scaleNotes[0]).toBe('G2');
    expect(major.scaleNotes.at(-1)).toBe('G8');
    expect(minor.levels).toHaveLength(26);
    expect(minor.scaleNotes.at(-1)).toBe('E8');
  });

  it('applies deterministic micro-detuning only after generation 4', () => {
    const tree = generateTree(defaultOptions);
    const earlyNodes = tree.levels
      .slice(0, MICRO_DETUNE_AFTER_GENERATION + 1)
      .flat();
    const laterNodes = tree.levels
      .slice(MICRO_DETUNE_AFTER_GENERATION + 1)
      .flat();

    expect(earlyNodes.every((node) => node.detuneCents === 0)).toBe(true);
    expect(laterNodes.every((node) => node.detuneCents >= -2 && node.detuneCents <= 2)).toBe(true);
    expect(laterNodes.some((node) => node.detuneCents !== 0)).toBe(true);
    expect(new Set(laterNodes.map((node) => node.detuneCents)).size).toBeGreaterThan(1);
  });

  it('assigns one seeded waveform to every node in each generation', () => {
    const tree = generateTree(defaultOptions);
    const alternate = generateTree({ ...defaultOptions, seed: 4163 });
    const sequence = tree.levels.map((level) => level[0]?.waveform);
    const alternateSequence = alternate.levels.map((level) => level[0]?.waveform);

    tree.levels.forEach((level) => {
      const waveform = level[0]?.waveform;

      expect(GENERATION_WAVEFORMS).toContain(waveform);
      expect(level.every((node) => node.waveform === waveform)).toBe(true);
    });

    expect(new Set(sequence).size).toBeGreaterThan(1);
    expect(generateTree(defaultOptions).levels.map((level) => level[0]?.waveform)).toEqual(sequence);
    expect(alternateSequence).not.toEqual(sequence);
  });
});

describe('noteToFrequency', () => {
  it('converts scientific pitch notation using A4 = 440 Hz', () => {
    expect(noteToFrequency('A4')).toBeCloseTo(440, 8);
    expect(noteToFrequency('E2')).toBeCloseTo(82.4069, 3);
    expect(noteToFrequency('F#5')).toBeCloseTo(739.9888, 3);
    expect(noteToFrequency('E8')).toBeCloseTo(5274.0409, 3);
  });
});
