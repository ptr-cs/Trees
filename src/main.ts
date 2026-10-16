import './style.css';
import { AudioEngine, type PlaybackSchedule } from './audio';
import {
  DEFAULT_KEY_ID,
  MUSICAL_KEYS,
  SCALE_NOTES,
  createScaleNotes,
  formatFrequency,
  getMusicalKey,
  isMusicalKeyId,
  type MusicalKeyId,
  type ScaleMode,
} from './music';
import {
  arrangeTreeForMidi,
  createMidiFile,
  midiFilename,
} from './midi';
import {
  TREE_VIEWBOX,
  formatWaveform,
  generateTree,
  type GeneratedTree,
  type TreeNode,
} from './tree';
import { createGenerationOrder } from './traversal';

type PlaybackState = 'idle' | 'starting' | 'playing' | 'releasing' | 'stopped' | 'complete';

interface SimulationSettings {
  key: MusicalKeyId;
  reverse: boolean;
  seed: number;
  splitChance: number;
  maxNodesPerGeneration: number;
  generations: number;
  tempo: number;
  stereoWidth: number;
  volume: number;
  sustain: boolean;
}

const DEFAULTS: SimulationSettings = {
  key: DEFAULT_KEY_ID,
  reverse: false,
  seed: 4162,
  splitChance: 0.42,
  maxNodesPerGeneration: 14,
  generations: SCALE_NOTES.length,
  tempo: 112,
  stereoWidth: 0.86,
  volume: 0.48,
  sustain: false,
};

const keyOptionsMarkup = (['major', 'minor'] as const)
  .map((mode: ScaleMode) => `
    <optgroup label="${mode === 'major' ? 'Major keys' : 'Minor keys'}">
      ${MUSICAL_KEYS
        .filter((key) => key.mode === mode)
        .map((key) => `<option value="${key.id}"${key.id === DEFAULT_KEY_ID ? ' selected' : ''}>${key.label}</option>`)
        .join('')}
    </optgroup>
  `)
  .join('');

const app = document.querySelector<HTMLDivElement>('#app');

if (app === null) {
  throw new Error('App root was not found.');
}

app.innerHTML = `
  <div class="app-shell">
    <header class="masthead">
      <div class="identity">
        <span class="identity-mark" aria-hidden="true">
          <i></i><i></i><i></i>
        </span>
        <span>Arbor / Audio study 01</span>
      </div>
      <div class="masthead-copy">
        <p class="eyebrow" id="key-eyebrow">Generative sonification in E minor</p>
        <h1 id="app-title">Canopy in E minor</h1>
        <p class="dek">A binary tree moves through a modified scale—one generation, one pitch, many positions in space.</p>
      </div>
      <div class="system-state" id="system-state" data-state="idle">
        <span class="state-light" aria-hidden="true"></span>
        <span id="system-state-label">Rooted / ready</span>
      </div>
    </header>

    <main class="instrument">
      <section class="stage-panel" aria-labelledby="stage-title" aria-describedby="scale-description">
        <div class="stage-toolbar">
          <div>
            <p class="section-kicker">Live growth field</p>
            <h2 id="stage-title">Branch topology</h2>
          </div>
          <div class="current-readout" aria-label="Current generation">
            <span class="readout-generation" id="readout-generation">GEN 00 / 25</span>
            <strong class="readout-note" id="readout-note">E2</strong>
            <span class="readout-detail" id="readout-detail">1 voice · 82.4 Hz</span>
          </div>
        </div>

        <div class="tree-frame">
          <svg
            id="tree-svg"
            class="tree-svg"
            viewBox="0 0 ${TREE_VIEWBOX.width} ${TREE_VIEWBOX.height}"
            role="img"
            aria-labelledby="tree-svg-title tree-svg-description"
            preserveAspectRatio="xMidYMid meet"
          >
            <title id="tree-svg-title">A generated E minor musical tree</title>
            <desc id="tree-svg-description">The centered E2 root grows upward. Each new generation branches left or right and advances to the next note in the supplied E minor scale.</desc>
            <defs>
              <radialGradient id="root-fill" cx="35%" cy="28%" r="75%">
                <stop offset="0" stop-color="#fff0bd" />
                <stop offset="0.42" stop-color="#eab966" />
                <stop offset="1" stop-color="#986f34" />
              </radialGradient>
              <linearGradient id="trunk-stroke" x1="0" y1="1" x2="0" y2="0">
                <stop offset="0" stop-color="#966d38" stop-opacity="0.32" />
                <stop offset="1" stop-color="#e9bd70" stop-opacity="0.9" />
              </linearGradient>
              <filter id="node-glow" x="-500%" y="-500%" width="1000%" height="1000%">
                <feGaussianBlur stdDeviation="8" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            <g id="scale-grid" aria-hidden="true"></g>
            <g id="tree-layer" aria-hidden="true"></g>
          </svg>
          <div class="stereo-axis" aria-hidden="true">
            <span>L</span><i></i><span>C</span><i></i><span>R</span>
          </div>
        </div>

        <div class="scale-section">
          <div class="scale-heading">
            <span>Scale path</span>
            <span id="scale-progress-label">1 of 26 sounding</span>
          </div>
          <div class="scale-strip" id="scale-strip" aria-hidden="true"></div>
          <p class="sr-only" id="scale-description">Scale sequence: ${SCALE_NOTES.join(', ')}.</p>
        </div>
      </section>

      <aside class="control-panel" aria-labelledby="controls-title">
        <div class="control-heading">
          <p class="section-kicker">Simulation controls</p>
          <h2 id="controls-title">Shape the growth</h2>
        </div>

        <div class="transport">
          <button class="play-button" id="play-button" type="button">
            <span class="play-icon" id="play-icon" aria-hidden="true">▶</span>
            <span>
              <small>Sonification</small>
              <strong id="play-label">Listen from root</strong>
            </span>
          </button>
          <div class="transport-secondary">
            <button class="secondary-button" id="step-button" type="button">Grow one</button>
            <button class="secondary-button" id="reset-button" type="button">Reset</button>
          </div>
          <button class="midi-export-button" id="midi-export-button" data-lock-during-playback type="button">
            <span>↓</span>
            <span><strong>Export 15-track MIDI</strong><small>Warm Pad · 15 ch · CC10 pan</small></span>
          </button>
        </div>

        <div class="control-group">
          <div class="control-group-title">
            <span>Topology</span>
            <span>01</span>
          </div>

          <label class="select-control" for="key-input">
            <span>Musical key</span>
            <select id="key-input" data-lock-during-playback>${keyOptionsMarkup}</select>
          </label>

          <label class="range-control" for="reach-input">
            <span class="range-label"><span>Scale reach</span><output id="reach-output">E8 · 26 levels</output></span>
            <input id="reach-input" data-lock-during-playback type="range" min="4" max="26" step="1" value="26" />
          </label>

          <label class="range-control" for="split-input">
            <span class="range-label"><span>Split chance</span><output id="split-output">42%</output></span>
            <input id="split-input" data-lock-during-playback type="range" min="0" max="85" step="1" value="42" />
          </label>

          <label class="range-control" for="cap-input">
            <span class="range-label"><span>Canopy limit</span><output id="cap-output">14 voices</output></span>
            <input id="cap-input" data-lock-during-playback type="range" min="4" max="24" step="1" value="14" />
          </label>

          <div class="seed-control">
            <label for="seed-input">Seed</label>
            <div class="seed-row">
              <input id="seed-input" data-lock-during-playback type="number" min="0" max="999999999" value="4162" inputmode="numeric" />
              <button id="new-seed-button" data-lock-during-playback type="button">New seed</button>
            </div>
          </div>
        </div>

        <div class="control-group">
          <div class="control-group-title">
            <span>Sound field</span>
            <span>02</span>
          </div>

          <label class="range-control" for="tempo-input">
            <span class="range-label"><span>Growth pace</span><output id="tempo-output">112 BPM</output></span>
            <input id="tempo-input" data-lock-during-playback type="range" min="64" max="180" step="1" value="112" />
          </label>

          <label class="toggle-control" for="reverse-input">
            <span class="toggle-copy">
              <strong id="reverse-label">Reverse sequence</strong>
              <small id="reverse-description">Begin at the canopy and progress down to the root.</small>
            </span>
            <input
              id="reverse-input"
              data-lock-during-playback
              type="checkbox"
              aria-labelledby="reverse-label"
              aria-describedby="reverse-description"
            />
          </label>

          <label class="toggle-control" for="sustain-input">
            <span class="toggle-copy">
              <strong id="sustain-label">Sustain notes</strong>
              <small id="sustain-description">Hold each generation you sound; higher branches are voiced more softly.</small>
            </span>
            <input
              id="sustain-input"
              data-lock-during-playback
              type="checkbox"
              aria-labelledby="sustain-label"
              aria-describedby="sustain-description"
            />
          </label>

          <label class="range-control" for="stereo-input">
            <span class="range-label"><span>Stereo width</span><output id="stereo-output">86%</output></span>
            <input id="stereo-input" data-lock-during-playback type="range" min="0" max="100" step="1" value="86" />
          </label>

          <label class="range-control" for="volume-input">
            <span class="range-label"><span>Output</span><output id="volume-output">48%</output></span>
            <input id="volume-input" type="range" min="0" max="100" step="1" value="48" />
          </label>
        </div>

        <div class="logic-note">
          <span class="logic-mark" id="logic-mark" aria-hidden="true">↗</span>
          <p>Every parent continues with one limb. A split adds its opposite limb, while each generation receives one seeded waveform.</p>
        </div>
      </aside>
    </main>

    <footer class="footer-note">
      <p>Best experienced with headphones. Audio begins only after you press listen.</p>
      <p class="shortcuts"><kbd>Space</kbd> listen / stop <kbd>→</kbd> step one <kbd>R</kbd> reset</p>
    </footer>
  </div>
  <div class="sr-only" id="live-region" role="status" aria-live="polite" aria-atomic="true"></div>
`;

function selectElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);

  if (element === null) {
    throw new Error(`Required element is missing: ${selector}`);
  }

  return element;
}

const audio = new AudioEngine();
const elements = {
  keyEyebrow: selectElement<HTMLElement>('#key-eyebrow'),
  appTitle: selectElement<HTMLElement>('#app-title'),
  treeSvgTitle: selectElement<SVGTitleElement>('#tree-svg-title'),
  treeSvgDescription: selectElement<SVGDescElement>('#tree-svg-description'),
  scaleDescription: selectElement<HTMLElement>('#scale-description'),
  logicMark: selectElement<HTMLElement>('#logic-mark'),
  systemState: selectElement<HTMLElement>('#system-state'),
  systemStateLabel: selectElement<HTMLElement>('#system-state-label'),
  readoutGeneration: selectElement<HTMLElement>('#readout-generation'),
  readoutNote: selectElement<HTMLElement>('#readout-note'),
  readoutDetail: selectElement<HTMLElement>('#readout-detail'),
  scaleGrid: selectElement<SVGGElement>('#scale-grid'),
  treeLayer: selectElement<SVGGElement>('#tree-layer'),
  scaleStrip: selectElement<HTMLElement>('#scale-strip'),
  scaleProgressLabel: selectElement<HTMLElement>('#scale-progress-label'),
  playButton: selectElement<HTMLButtonElement>('#play-button'),
  playIcon: selectElement<HTMLElement>('#play-icon'),
  playLabel: selectElement<HTMLElement>('#play-label'),
  stepButton: selectElement<HTMLButtonElement>('#step-button'),
  resetButton: selectElement<HTMLButtonElement>('#reset-button'),
  midiExportButton: selectElement<HTMLButtonElement>('#midi-export-button'),
  newSeedButton: selectElement<HTMLButtonElement>('#new-seed-button'),
  keyInput: selectElement<HTMLSelectElement>('#key-input'),
  reachInput: selectElement<HTMLInputElement>('#reach-input'),
  reachOutput: selectElement<HTMLOutputElement>('#reach-output'),
  splitInput: selectElement<HTMLInputElement>('#split-input'),
  splitOutput: selectElement<HTMLOutputElement>('#split-output'),
  capInput: selectElement<HTMLInputElement>('#cap-input'),
  capOutput: selectElement<HTMLOutputElement>('#cap-output'),
  seedInput: selectElement<HTMLInputElement>('#seed-input'),
  tempoInput: selectElement<HTMLInputElement>('#tempo-input'),
  tempoOutput: selectElement<HTMLOutputElement>('#tempo-output'),
  reverseInput: selectElement<HTMLInputElement>('#reverse-input'),
  sustainInput: selectElement<HTMLInputElement>('#sustain-input'),
  stereoInput: selectElement<HTMLInputElement>('#stereo-input'),
  stereoOutput: selectElement<HTMLOutputElement>('#stereo-output'),
  volumeInput: selectElement<HTMLInputElement>('#volume-input'),
  volumeOutput: selectElement<HTMLOutputElement>('#volume-output'),
  liveRegion: selectElement<HTMLElement>('#live-region'),
};

let settings: SimulationSettings = { ...DEFAULTS };
let tree: GeneratedTree = createTree();
let visibleGeneration = settings.reverse ? tree.levels.length - 1 : 0;
let playbackState: PlaybackState = 'idle';
let playbackSchedule: PlaybackSchedule | null = null;
let animationFrame: number | null = null;
let manualPulseTimer: number | null = null;
let manualPulseGeneration: number | null = null;
let hasHeldManualVoices = false;
let runToken = 0;

function sequenceStartGeneration(): number {
  return createGenerationOrder(tree.levels.length, settings.reverse)[0] ?? 0;
}

function sequenceEndGeneration(): number {
  return createGenerationOrder(tree.levels.length, settings.reverse).at(-1) ?? 0;
}

function generationAtStep(step: number): number {
  return createGenerationOrder(tree.levels.length, settings.reverse)[step]
    ?? sequenceEndGeneration();
}

function stepForGeneration(generation: number): number {
  return Math.max(0, createGenerationOrder(tree.levels.length, settings.reverse).indexOf(generation));
}

function orderedLevels(): TreeNode[][] {
  return createGenerationOrder(tree.levels.length, settings.reverse)
    .map((generation) => tree.levels[generation] ?? []);
}

function isAtSequenceEnd(): boolean {
  return visibleGeneration === sequenceEndGeneration();
}

function createTree(): GeneratedTree {
  return generateTree({
    key: settings.key,
    seed: settings.seed,
    splitChance: settings.splitChance,
    maxNodesPerGeneration: settings.maxNodesPerGeneration,
    generations: settings.generations,
  });
}

function branchPath(parent: TreeNode, child: TreeNode): string {
  const verticalDistance = parent.y - child.y;
  const firstControlY = parent.y - verticalDistance * 0.44;
  const secondControlY = child.y + verticalDistance * 0.34;
  return `M ${parent.x.toFixed(2)} ${parent.y.toFixed(2)} C ${parent.x.toFixed(2)} ${firstControlY.toFixed(2)}, ${child.x.toFixed(2)} ${secondControlY.toFixed(2)}, ${child.x.toFixed(2)} ${child.y.toFixed(2)}`;
}

function renderScaleGrid(): void {
  const finalGeneration = tree.levels.length - 1;
  const lines = tree.levels.map((level, generation) => {
    const node = level[0];

    if (node === undefined) {
      return '';
    }

    const isMajor = generation === 0 || generation === finalGeneration || generation % 5 === 0;
    const showLabel = isMajor || generation === visibleGeneration;
    const lineClass = generation === visibleGeneration ? 'scale-line is-current' : 'scale-line';

    return `
      <g class="${lineClass}">
        <line x1="54" y1="${node.y}" x2="946" y2="${node.y}" />
        ${showLabel ? `<text x="20" y="${node.y + 4}" text-anchor="start">${node.note}</text>` : ''}
        ${showLabel ? `<text x="980" y="${node.y + 4}" text-anchor="end">${String(generation).padStart(2, '0')}</text>` : ''}
      </g>
    `;
  });

  elements.scaleGrid.innerHTML = lines.join('');
}

function renderTree(): void {
  const visibleNodes = tree.nodes.filter((node) => (
    settings.reverse
      ? node.generation >= visibleGeneration
      : node.generation <= visibleGeneration
  ));
  const visibleNodeIds = new Set(visibleNodes.map((node) => node.id));
  const nodeById = new Map(tree.nodes.map((node) => [node.id, node]));
  const activeGeneration =
    playbackState === 'playing'
      || playbackState === 'releasing'
      || manualPulseGeneration === visibleGeneration
      ? visibleGeneration
      : null;
  const branches = visibleNodes
    .filter((node) => node.parentId !== null && visibleNodeIds.has(node.parentId))
    .map((node, index) => {
      const parent = node.parentId === null ? undefined : nodeById.get(node.parentId);

      if (parent === undefined) {
        return '';
      }

      const depth = node.generation / Math.max(1, tree.levels.length - 1);
      const hue = 158 + depth * 31;
      const lightness = 39 + depth * 17;
      const isCurrent = settings.reverse
        ? parent.generation === activeGeneration
        : node.generation === activeGeneration;

      return `<path
        class="branch${isCurrent ? ' is-current' : ''}"
        d="${settings.reverse ? branchPath(node, parent) : branchPath(parent, node)}"
        pathLength="1"
        style="--branch-color: hsla(${hue.toFixed(0)}, 48%, ${lightness.toFixed(0)}%, 0.72); --grow-delay: ${(index % 24) * 12}ms"
      />`;
    });
  const nodes = visibleNodes.map((node, index) => {
    const isRoot = node.generation === 0;
    const isCurrent = node.generation === activeGeneration;
    const depth = node.generation / Math.max(1, tree.levels.length - 1);
    const radius = isRoot ? 8.5 : isCurrent ? 5.8 : 3.15;
    const hue = 158 + depth * 31;
    const lightness = 58 + depth * 16;
    const classes = ['tree-node', isRoot ? 'is-root' : '', isCurrent ? 'is-current' : '']
      .filter(Boolean)
      .join(' ');
    const panDescription = node.pan === 0 ? 'center' : `${Math.abs(node.pan * 100).toFixed(0)}% ${node.pan < 0 ? 'left' : 'right'}`;
    const detuneDescription = node.detuneCents === 0
      ? ''
      : `, ${node.detuneCents > 0 ? '+' : ''}${node.detuneCents.toFixed(2)} cents`;

    return `
      <g class="${classes}" style="--node-color: hsl(${hue.toFixed(0)} 62% ${lightness.toFixed(0)}%); --node-delay: ${(index % 24) * 12}ms">
        <title>${node.note}, generation ${node.generation}, ${formatWaveform(node.waveform)} waveform, ${panDescription}${detuneDescription}</title>
        ${isCurrent ? `<circle class="node-halo" cx="${node.x}" cy="${node.y}" r="15" />` : ''}
        <circle class="node-core" cx="${node.x}" cy="${node.y}" r="${radius}" />
      </g>
    `;
  });
  const root = tree.levels[0]?.[0];
  const trunk = root === undefined || !visibleNodeIds.has(root.id)
    ? ''
    : `<path class="root-trunk" d="M ${root.x} 990 C ${root.x - 2} 972, ${root.x + 2} 950, ${root.x} ${root.y}" />`;

  elements.treeLayer.innerHTML = `${trunk}${branches.join('')}${nodes.join('')}`;
  renderScaleGrid();
  renderReadout();
  renderScaleStrip();
}

function renderReadout(): void {
  const finalGeneration = tree.levels.length - 1;
  const level = tree.levels[visibleGeneration] ?? [];
  const current = level[0];

  if (current === undefined) {
    return;
  }

  elements.readoutGeneration.textContent = `GEN ${String(visibleGeneration).padStart(2, '0')} / ${String(finalGeneration).padStart(2, '0')}`;
  elements.readoutNote.textContent = current.note;
  elements.readoutDetail.textContent = `${level.length} ${level.length === 1 ? 'voice' : 'voices'} · ${formatWaveform(current.waveform)} · ${formatFrequency(current.frequency)}`;
  const progressState = hasHeldManualVoices
    ? 'sustained'
    : playbackState === 'releasing'
      ? 'releasing'
      : playbackState === 'playing' || manualPulseGeneration !== null
      ? 'sounding'
      : playbackState === 'complete'
        ? 'complete'
        : 'revealed';
  elements.scaleProgressLabel.textContent = `${stepForGeneration(visibleGeneration) + 1} of ${tree.levels.length} ${progressState}`;
}

function renderScaleStrip(): void {
  const currentStep = stepForGeneration(visibleGeneration);
  const generationOrder = createGenerationOrder(tree.levels.length, settings.reverse);

  elements.scaleStrip.innerHTML = generationOrder
    .map((generation, step) => {
      const level = tree.levels[generation] ?? [];
      const note = level[0]?.note ?? '';
      const state = step < currentStep
        ? 'past'
        : step === currentStep
          ? 'current'
          : 'future';

      return `<span class="scale-token" data-note-state="${state}"><i>${String(generation).padStart(2, '0')}</i><b>${note}</b></span>`;
    })
    .join('');

  const currentToken = elements.scaleStrip.querySelector<HTMLElement>('[data-note-state="current"]');

  if (currentToken !== null) {
    const centeredLeft = currentToken.offsetLeft
      - (elements.scaleStrip.clientWidth - currentToken.offsetWidth) / 2;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    elements.scaleStrip.scrollTo({
      left: Math.max(0, centeredLeft),
      behavior: reducedMotion ? 'auto' : 'smooth',
    });
  }
}

function renderControlValues(): void {
  const fullScale = createScaleNotes(settings.key);
  const finalNote = tree.scaleNotes.at(-1) ?? fullScale.at(-1) ?? 'E8';
  const intervalMilliseconds = Math.round((60 / settings.tempo) * 1000);

  elements.keyInput.value = settings.key;
  elements.reverseInput.checked = settings.reverse;
  elements.reachInput.max = String(fullScale.length);
  elements.reachInput.value = String(settings.generations);
  elements.reachOutput.value = `${finalNote} · ${settings.generations} levels`;
  elements.splitOutput.value = `${Math.round(settings.splitChance * 100)}%`;
  elements.capOutput.value = `${settings.maxNodesPerGeneration} voices`;
  elements.tempoOutput.value = `${settings.tempo} BPM · ${intervalMilliseconds} ms`;
  elements.stereoOutput.value = `${Math.round(settings.stereoWidth * 100)}%`;
  elements.volumeOutput.value = `${Math.round(settings.volume * 100)}%`;

  const key = getMusicalKey(settings.key);
  const rootNote = tree.levels[0]?.[0]?.note ?? `${key.tonic}2`;
  const canopyNote = tree.levels.at(-1)?.[0]?.note ?? `${key.tonic}8`;
  const directionDescription = settings.reverse
    ? `The ${canopyNote} canopy descends generation by generation to the centered ${rootNote} root.`
    : `The centered ${rootNote} root grows generation by generation to the ${canopyNote} canopy.`;

  elements.keyEyebrow.textContent = `Generative sonification in ${key.label}`;
  elements.appTitle.textContent = `Canopy in ${key.label}`;
  elements.treeSvgTitle.textContent = `A generated ${key.label} musical tree`;
  elements.treeSvgDescription.textContent = `${directionDescription} Each generation branches left or right and advances through the modified scale.`;
  elements.scaleDescription.textContent = `${settings.reverse ? 'Descending' : 'Ascending'} scale sequence: ${orderedLevels().map((level) => level[0]?.note ?? '').join(', ')}.`;
  elements.logicMark.textContent = settings.reverse ? '↘' : '↗';
  document.title = `Canopy in ${key.label}`;
}

function renderPlaybackState(): void {
  const labels: Record<PlaybackState, string> = {
    idle: settings.reverse ? 'Canopy / ready' : 'Rooted / ready',
    starting: 'Waking audio',
    playing: settings.reverse ? 'Descending / sounding' : 'Growing / sounding',
    releasing: settings.reverse ? 'Root / releasing' : 'Canopy / releasing',
    stopped: settings.reverse ? 'Descent stopped' : 'Growth stopped',
    complete: settings.reverse ? 'Descent complete' : 'Canopy complete',
  };
  const isBusy = playbackState === 'starting'
    || playbackState === 'playing'
    || playbackState === 'releasing';
  const isAtEnd = isAtSequenceEnd();
  const canStop = playbackState === 'playing' || playbackState === 'releasing';

  elements.systemState.dataset.state = hasHeldManualVoices ? 'sustained' : playbackState;
  elements.systemStateLabel.textContent = hasHeldManualVoices
    ? playbackState === 'complete'
      ? 'Tree sustained'
      : 'Notes sustained'
    : labels[playbackState];
  elements.playIcon.textContent = canStop ? '■' : '▶';
  elements.playLabel.textContent = playbackState === 'releasing'
    ? 'Stop release'
    : playbackState === 'playing'
      ? 'Stop growth'
    : playbackState === 'idle'
      ? settings.reverse ? 'Listen from canopy' : 'Listen from root'
      : settings.reverse ? 'Replay from canopy' : 'Replay from root';
  elements.stepButton.textContent = settings.reverse ? 'Descend one' : 'Grow one';
  elements.playButton.disabled = playbackState === 'starting';
  elements.stepButton.disabled = isBusy || isAtEnd;
  elements.resetButton.textContent = hasHeldManualVoices
    ? 'Release + reset'
    : 'Reset';

  document.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLSelectElement>('[data-lock-during-playback]')
    .forEach((element) => {
      element.disabled = isBusy;
    });
}

function announceGeneration(generation: number): void {
  const level = tree.levels[generation] ?? [];
  const note = level[0]?.note;
  const step = stepForGeneration(generation);
  const isAutoplayMilestone = step === 0
    || step === tree.levels.length - 1
    || step % 5 === 0;

  if (playbackState === 'playing' && !isAutoplayMilestone) {
    return;
  }

  if (note !== undefined) {
    elements.liveRegion.textContent = `Step ${step + 1} of ${tree.levels.length}, generation ${generation}: ${note}, ${formatWaveform(level[0]?.waveform ?? 'sine')}, ${level.length} ${level.length === 1 ? 'voice' : 'voices'}.`;
  }
}

function clearManualPulse(): void {
  if (manualPulseTimer !== null) {
    window.clearTimeout(manualPulseTimer);
    manualPulseTimer = null;
  }

  manualPulseGeneration = null;
}

function cancelPlayback(setState: boolean, announce = false): void {
  runToken += 1;
  audio.stop();
  hasHeldManualVoices = false;
  playbackSchedule = null;

  if (animationFrame !== null) {
    cancelAnimationFrame(animationFrame);
    animationFrame = null;
  }

  clearManualPulse();

  if (setState) {
    playbackState = 'stopped';
    renderTree();
    renderPlaybackState();
  }

  if (announce) {
    elements.liveRegion.textContent = `Stopped at generation ${visibleGeneration}.`;
  }
}

function resetSequence(announce = true): void {
  cancelPlayback(false);
  visibleGeneration = sequenceStartGeneration();
  playbackState = 'idle';
  renderTree();
  renderControlValues();
  renderPlaybackState();

  if (announce) {
    const startNote = tree.levels[visibleGeneration]?.[0]?.note ?? 'the starting note';
    elements.liveRegion.textContent = settings.reverse
      ? `Reset to the ${startNote} canopy.`
      : `Reset to the centered ${startNote} root.`;
  }
}

function rebuildTree(announce = false): void {
  cancelPlayback(false);
  tree = createTree();
  settings.generations = tree.options.generations;
  visibleGeneration = sequenceStartGeneration();
  playbackState = 'idle';
  renderTree();
  renderControlValues();
  renderPlaybackState();

  if (announce) {
    elements.liveRegion.textContent = `Generated a new ${getMusicalKey(settings.key).label} tree with seed ${settings.seed}.`;
  }
}

async function startPlayback(): Promise<void> {
  cancelPlayback(false);
  visibleGeneration = sequenceStartGeneration();
  playbackState = 'starting';
  renderTree();
  renderPlaybackState();
  const token = ++runToken;

  try {
    audio.setVolume(settings.volume);
    const interval = 60 / settings.tempo;
    const schedule = await audio.scheduleTree(orderedLevels(), {
      interval,
      stereoWidth: settings.stereoWidth,
      sustain: settings.sustain,
    });

    if (token !== runToken || schedule === null) {
      return;
    }

    playbackSchedule = schedule;
    playbackState = 'playing';
    renderTree();
    renderPlaybackState();
    announceGeneration(sequenceStartGeneration());
    animationFrame = requestAnimationFrame(() => updatePlayback(token));
  } catch (error) {
    if (token !== runToken) {
      return;
    }

    playbackState = 'stopped';
    renderPlaybackState();
    elements.liveRegion.textContent = 'Audio could not start. Check this browser’s audio permissions.';
    console.error(error);
  }
}

function updatePlayback(token: number): void {
  if (
    token !== runToken
    || playbackSchedule === null
    || (playbackState !== 'playing' && playbackState !== 'releasing')
  ) {
    return;
  }

  const now = audio.currentTime;
  const finalStep = tree.levels.length - 1;
  const terminalGeneration = sequenceEndGeneration();

  if (now >= playbackSchedule.startTime) {
    const nextStep = Math.min(
      finalStep,
      Math.max(0, Math.floor((now - playbackSchedule.startTime) / playbackSchedule.interval)),
    );
    const nextGeneration = generationAtStep(nextStep);

    if (nextGeneration !== visibleGeneration) {
      visibleGeneration = nextGeneration;
      renderTree();
      announceGeneration(nextGeneration);
    }
  }

  if (now >= playbackSchedule.endTime) {
    visibleGeneration = terminalGeneration;
    playbackState = 'complete';
    playbackSchedule = null;
    animationFrame = null;
    renderTree();
    renderPlaybackState();
    elements.liveRegion.textContent = `${settings.reverse ? 'Descent' : 'Canopy'} complete at ${tree.levels[terminalGeneration]?.[0]?.note ?? 'the final note'}.`;
    return;
  }

  if (now >= playbackSchedule.releaseStart && playbackState === 'playing') {
    visibleGeneration = terminalGeneration;
    playbackState = 'releasing';
    renderReadout();
    renderPlaybackState();
    const finalLevel = tree.levels[terminalGeneration] ?? [];
    const finalNode = finalLevel[0];
    elements.liveRegion.textContent = `Final step, generation ${terminalGeneration}: ${finalNode?.note ?? 'final note'}, ${formatWaveform(finalNode?.waveform ?? 'sine')}, ${finalLevel.length} ${finalLevel.length === 1 ? 'voice' : 'voices'}. The complete tree is fading through a ${playbackSchedule.releaseDuration.toFixed(2)}-second release.`;
  }

  animationFrame = requestAnimationFrame(() => updatePlayback(token));
}

async function growOneGeneration(): Promise<void> {
  if (
    playbackState === 'playing'
    || playbackState === 'releasing'
    || playbackState === 'starting'
  ) {
    return;
  }

  if (isAtSequenceEnd()) {
    return;
  }

  clearManualPulse();
  if (!settings.sustain) {
    hasHeldManualVoices = false;
  }
  const currentStep = stepForGeneration(visibleGeneration);
  const includeSequenceStart = settings.sustain && currentStep === 0;
  const token = ++runToken;
  visibleGeneration = generationAtStep(currentStep + 1);
  manualPulseGeneration = visibleGeneration;
  playbackState = 'starting';
  renderTree();
  renderPlaybackState();
  announceGeneration(visibleGeneration);

  try {
    audio.setVolume(settings.volume);
    const levelsToSound = includeSequenceStart
      ? [tree.levels[sequenceStartGeneration()] ?? [], tree.levels[visibleGeneration] ?? []]
      : [tree.levels[visibleGeneration] ?? []];
    const didSchedule = await audio.playGenerations(levelsToSound, {
      duration: Math.max(0.18, (60 / settings.tempo) * 0.78),
      stereoWidth: settings.stereoWidth,
      sustain: settings.sustain,
    });

    if (token !== runToken || !didSchedule) {
      return;
    }

    hasHeldManualVoices = settings.sustain;
  } catch (error) {
    if (token !== runToken) {
      return;
    }

    manualPulseGeneration = null;
    hasHeldManualVoices = false;
    playbackState = 'stopped';
    renderTree();
    renderPlaybackState();
    elements.liveRegion.textContent = 'That generation grew visually, but audio could not start.';
    console.error(error);
    return;
  }

  playbackState = isAtSequenceEnd() ? 'complete' : 'stopped';
  renderTree();
  renderPlaybackState();

  manualPulseTimer = window.setTimeout(() => {
    manualPulseTimer = null;
    manualPulseGeneration = null;
    renderTree();
  }, Math.max(260, (60 / settings.tempo) * 780));
}

elements.playButton.addEventListener('click', () => {
  if (playbackState === 'playing' || playbackState === 'releasing') {
    cancelPlayback(true, true);
  } else {
    void startPlayback();
  }
});

elements.stepButton.addEventListener('click', () => {
  void growOneGeneration();
});

elements.resetButton.addEventListener('click', () => {
  resetSequence();
});

elements.midiExportButton.addEventListener('click', () => {
  const key = getMusicalKey(settings.key);
  const scaleNotes = createScaleNotes(settings.key);
  const midiTree = generateTree({
    key: settings.key,
    seed: settings.seed,
    splitChance: settings.splitChance,
    maxNodesPerGeneration: settings.maxNodesPerGeneration,
    generations: scaleNotes.length - 1,
  });
  const arrangement = arrangeTreeForMidi(midiTree, scaleNotes);
  const midi = createMidiFile(arrangement, settings.tempo, `Canopy in ${key.label}`);
  const midiBuffer = new ArrayBuffer(midi.byteLength);
  new Uint8Array(midiBuffer).set(midi);
  const blob = new Blob([midiBuffer], { type: 'audio/midi' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = midiFilename(key.label, settings.seed);
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);

  const noteCount = arrangement.tracks.reduce((total, track) => total + track.notes.length, 0);
  elements.liveRegion.textContent = `Exported the full ${arrangement.generationCount}-step scale lifespan: ${noteCount} sustained notes across 15 CC10-panned Warm Pad MIDI channels. Track 8 begins at ${scaleNotes[1] ?? 'the octave root'}.`;
});

elements.newSeedButton.addEventListener('click', () => {
  const randomValue = crypto.getRandomValues(new Uint32Array(1))[0] ?? Date.now();
  settings.seed = randomValue % 1_000_000_000;
  elements.seedInput.value = String(settings.seed);
  rebuildTree(true);
});

elements.keyInput.addEventListener('change', () => {
  const requestedKey = elements.keyInput.value;

  if (!isMusicalKeyId(requestedKey)) {
    elements.keyInput.value = settings.key;
    return;
  }

  const previousMaximum = createScaleNotes(settings.key).length;
  const wasAtFullReach = settings.generations === previousMaximum;
  settings.key = requestedKey;
  const nextMaximum = createScaleNotes(settings.key).length;
  settings.generations = wasAtFullReach
    ? nextMaximum
    : Math.min(settings.generations, nextMaximum);
  rebuildTree();
  elements.liveRegion.textContent = `${getMusicalKey(settings.key).label} selected. ${settings.generations} tree levels ready.`;
});

elements.reachInput.addEventListener('input', () => {
  settings.generations = Number(elements.reachInput.value);
  rebuildTree();
});

elements.splitInput.addEventListener('input', () => {
  settings.splitChance = Number(elements.splitInput.value) / 100;
  rebuildTree();
});

elements.capInput.addEventListener('input', () => {
  settings.maxNodesPerGeneration = Number(elements.capInput.value);
  rebuildTree();
});

elements.seedInput.addEventListener('change', () => {
  const requestedSeed = Number(elements.seedInput.value);
  settings.seed = Number.isFinite(requestedSeed)
    ? Math.min(999_999_999, Math.max(0, Math.trunc(requestedSeed)))
    : DEFAULTS.seed;
  elements.seedInput.value = String(settings.seed);
  rebuildTree();
});

elements.tempoInput.addEventListener('input', () => {
  settings.tempo = Number(elements.tempoInput.value);
  renderControlValues();
});

elements.reverseInput.addEventListener('change', () => {
  settings.reverse = elements.reverseInput.checked;
  resetSequence(false);
  elements.liveRegion.textContent = settings.reverse
    ? `Reverse sequence on. Ready at the ${tree.levels.at(-1)?.[0]?.note ?? 'top'} canopy.`
    : `Reverse sequence off. Ready at the centered ${tree.levels[0]?.[0]?.note ?? 'root'} root.`;
});

elements.sustainInput.addEventListener('change', () => {
  const releasedHeldNotes = hasHeldManualVoices;
  settings.sustain = elements.sustainInput.checked;
  cancelPlayback(false);
  playbackState = stepForGeneration(visibleGeneration) === 0
    ? 'idle'
    : isAtSequenceEnd()
      ? 'complete'
      : 'stopped';
  renderTree();
  renderPlaybackState();
  elements.liveRegion.textContent = settings.sustain
    ? 'Sustain notes on. Newly sounded generations will hold with progressively softer levels.'
    : releasedHeldNotes
      ? 'Sustain notes off. Held notes have been released.'
      : 'Sustain notes off.';
});

elements.stereoInput.addEventListener('input', () => {
  settings.stereoWidth = Number(elements.stereoInput.value) / 100;
  renderControlValues();
});

elements.volumeInput.addEventListener('input', () => {
  settings.volume = Number(elements.volumeInput.value) / 100;
  audio.setVolume(settings.volume);
  renderControlValues();
});

document.addEventListener('keydown', (event) => {
  const target = event.target;
  const isFormControl = target instanceof HTMLInputElement
    || target instanceof HTMLButtonElement
    || target instanceof HTMLTextAreaElement
    || target instanceof HTMLSelectElement
    || (target instanceof HTMLElement && target.isContentEditable);

  if (isFormControl || event.metaKey || event.ctrlKey || event.altKey) {
    return;
  }

  if (event.repeat) {
    return;
  }

  if (event.code === 'Space') {
    event.preventDefault();
    elements.playButton.click();
  } else if (event.code === 'ArrowRight') {
    event.preventDefault();
    elements.stepButton.click();
  } else if (event.key.toLowerCase() === 'r') {
    event.preventDefault();
    elements.resetButton.click();
  }
});

audio.setVolume(settings.volume);
renderTree();
renderControlValues();
renderPlaybackState();
