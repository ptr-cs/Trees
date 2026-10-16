import {
  createScaleNotes,
  type MusicalKeyId,
  type ScaleNote,
  noteToFrequency,
} from './music';

export const TREE_VIEWBOX = {
  width: 1000,
  height: 1000,
  rootX: 500,
  rootY: 932,
  topY: 68,
} as const;

export const MICRO_DETUNE_AFTER_GENERATION = 4;

export const GENERATION_WAVEFORMS = [
  'sine',
  'soft-sawtooth',
  'soft-triangle',
  'soft-square',
] as const;

export type GenerationWaveform = (typeof GENERATION_WAVEFORMS)[number];

const WAVEFORM_LABELS: Record<GenerationWaveform, string> = {
  sine: 'sine',
  'soft-sawtooth': 'soft sawtooth',
  'soft-triangle': 'soft triangle',
  'soft-square': 'soft square',
};

export function formatWaveform(waveform: GenerationWaveform): string {
  return WAVEFORM_LABELS[waveform];
}

export type BranchSide = 'root' | 'left' | 'right';

export interface TreeNode {
  id: string;
  parentId: string | null;
  generation: number;
  note: ScaleNote;
  frequency: number;
  side: BranchSide;
  x: number;
  y: number;
  pan: number;
  detuneCents: number;
  waveform: GenerationWaveform;
}

interface WorkingNode extends TreeNode {
  rawX: number;
}

export interface TreeOptions {
  key: MusicalKeyId;
  seed: number;
  splitChance: number;
  maxNodesPerGeneration: number;
  generations: number;
}

export interface GeneratedTree {
  nodes: TreeNode[];
  levels: TreeNode[][];
  scaleNotes: ScaleNote[];
  options: TreeOptions;
}

interface ParentPlan {
  parent: WorkingNode;
  splitRoll: number;
  sideRoll: number;
  lengthRoll: number;
}

function hash32(value: string): number {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  hash += hash << 13;
  hash ^= hash >>> 7;
  hash += hash << 3;
  hash ^= hash >>> 17;
  hash += hash << 5;

  return hash >>> 0;
}

function keyedRandom(seed: number, generation: number, id: string, channel: string): number {
  return hash32(`${seed}:${generation}:${id}:${channel}`) / 4294967296;
}

function waveformForGeneration(seed: number, generation: number): GenerationWaveform {
  const index = Math.floor(
    keyedRandom(seed, generation, 'generation', 'waveform') * GENERATION_WAVEFORMS.length,
  );

  return GENERATION_WAVEFORMS[index] ?? 'sine';
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function normalizeOptions(options: TreeOptions, maximumGenerations: number): TreeOptions {
  return {
    key: options.key,
    seed: Math.trunc(options.seed),
    splitChance: clamp(options.splitChance, 0, 1),
    maxNodesPerGeneration: Math.max(2, Math.trunc(options.maxNodesPerGeneration)),
    generations: clamp(Math.trunc(options.generations), 2, maximumGenerations),
  };
}

export function generateTree(input: TreeOptions): GeneratedTree {
  const fullScale = createScaleNotes(input.key);
  const options = normalizeOptions(input, fullScale.length);
  const scaleNotes = fullScale.slice(0, options.generations);
  const workingLevels: WorkingNode[][] = [];
  const rootNote = scaleNotes[0] ?? fullScale[0] ?? 'E2';
  const root: WorkingNode = {
    id: 'g0n0',
    parentId: null,
    generation: 0,
    note: rootNote,
    frequency: noteToFrequency(rootNote),
    side: 'root',
    rawX: 0,
    x: TREE_VIEWBOX.rootX,
    y: TREE_VIEWBOX.rootY,
    pan: 0,
    detuneCents: 0,
    waveform: waveformForGeneration(options.seed, 0),
  };

  workingLevels.push([root]);

  for (let generation = 1; generation < options.generations; generation += 1) {
    const parents = workingLevels[generation - 1];
    const note = scaleNotes[generation];
    const waveform = waveformForGeneration(options.seed, generation);

    if (parents === undefined || note === undefined) {
      break;
    }

    const plans: ParentPlan[] = parents.map((parent) => ({
      parent,
      splitRoll: keyedRandom(options.seed, generation, parent.id, 'split'),
      sideRoll: keyedRandom(options.seed, generation, parent.id, 'side'),
      lengthRoll: keyedRandom(options.seed, generation, parent.id, 'length'),
    }));
    const splitCapacity = Math.max(0, options.maxNodesPerGeneration - parents.length);
    const splitIds = new Set(
      plans
        .filter((plan) => plan.splitRoll < options.splitChance)
        .sort((a, b) => a.splitRoll - b.splitRoll)
        .slice(0, splitCapacity)
        .map((plan) => plan.parent.id),
    );
    const children: WorkingNode[] = [];

    for (const plan of plans) {
      const sides = splitIds.has(plan.parent.id)
        ? ([-1, 1] as const)
        : ([plan.sideRoll < 0.5 ? -1 : 1] as const);

      for (const direction of sides) {
        const nodeIndex = children.length;
        const id = `g${generation}n${nodeIndex}`;
        const lengthVariation = 0.84 + plan.lengthRoll * 0.32;
        const depthTaper = 1 - generation / Math.max(options.generations * 3.2, 1);
        const rawX = plan.parent.rawX + direction * lengthVariation * depthTaper;
        const progress = generation / (options.generations - 1);

        children.push({
          id,
          parentId: plan.parent.id,
          generation,
          note,
          frequency: noteToFrequency(note),
          side: direction === -1 ? 'left' : 'right',
          rawX,
          x: 0,
          y: TREE_VIEWBOX.rootY - progress * (TREE_VIEWBOX.rootY - TREE_VIEWBOX.topY),
          pan: 0,
          detuneCents: generation > MICRO_DETUNE_AFTER_GENERATION
            ? keyedRandom(options.seed, generation, id, 'detune') * 4 - 2
            : 0,
          waveform,
        });
      }
    }

    workingLevels.push(children);
  }

  const workingNodes = workingLevels.flat();
  const maximumDisplacement = workingNodes.reduce(
    (maximum, node) => Math.max(maximum, Math.abs(node.rawX)),
    0,
  );
  const horizontalScale = 420 / Math.max(5, maximumDisplacement);

  for (const node of workingNodes) {
    node.x = TREE_VIEWBOX.rootX + node.rawX * horizontalScale;
    node.pan = clamp((node.x - TREE_VIEWBOX.rootX) / 445, -0.94, 0.94);
  }

  const levels = workingLevels.map((level) =>
    level.map(({ rawX: _rawX, ...node }) => node),
  );

  return {
    nodes: levels.flat(),
    levels,
    scaleNotes,
    options,
  };
}
