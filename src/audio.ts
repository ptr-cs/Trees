import {
  GENERATION_WAVEFORMS,
  type GenerationWaveform,
  type TreeNode,
} from './tree';

export const TREE_RELEASE_SECONDS = 12;

export interface PlaybackSchedule {
  startTime: number;
  endTime: number;
  interval: number;
  noteDuration: number;
  releaseStart: number;
  releaseDuration: number;
}

export interface SequencePlaybackOptions {
  interval: number;
  stereoWidth: number;
  sustain: boolean;
}

export interface GenerationPlaybackOptions {
  duration: number;
  stereoWidth: number;
  sustain: boolean;
}

interface ActiveVoice {
  oscillator: OscillatorNode;
  envelope: GainNode;
  panner: StereoPannerNode;
  startTime: number;
  stopTime: number;
}

export function sustainedGenerationGain(generation: number): number {
  return 1 / Math.sqrt(1 + Math.max(0, generation) * 0.55);
}

export class AudioEngine {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private waveforms: Map<GenerationWaveform, PeriodicWave> | null = null;
  private readonly activeVoices = new Set<ActiveVoice>();
  private volume = 0.5;
  private operationId = 0;

  async scheduleTree(
    levels: readonly TreeNode[][],
    options: SequencePlaybackOptions,
  ): Promise<PlaybackSchedule | null> {
    const { interval, stereoWidth, sustain } = options;
    const operationId = ++this.operationId;
    this.stopVoices();
    const context = await this.ensureContext();

    if (operationId !== this.operationId) {
      return null;
    }

    const outputLatency = 'outputLatency' in context ? context.outputLatency : 0;
    const schedulingLead = Math.max(0.22, context.baseLatency + outputLatency + 0.12);
    const startTime = context.currentTime + schedulingLead;
    const articulatedDuration = Math.max(0.16, interval * 0.78);
    const finalGeneration = Math.max(0, levels.length - 1);
    const finalGenerationStart = startTime + finalGeneration * interval;
    const releaseStart = finalGenerationStart + articulatedDuration;
    const endTime = releaseStart + TREE_RELEASE_SECONDS;

    try {
      levels.forEach((nodes, generation) => {
        const generationStart = startTime + generation * interval;
        const isFinalGeneration = generation === finalGeneration;
        this.scheduleGeneration(
          nodes,
          generationStart,
          articulatedDuration,
          stereoWidth,
          sustain,
          sustain || isFinalGeneration ? releaseStart : generationStart + articulatedDuration * 0.52,
          sustain || isFinalGeneration ? endTime : generationStart + articulatedDuration,
        );
      });
    } catch (error) {
      this.stopVoices();
      throw error;
    }

    return {
      startTime,
      endTime,
      interval,
      noteDuration: articulatedDuration,
      releaseStart,
      releaseDuration: TREE_RELEASE_SECONDS,
    };
  }

  async playGenerations(
    levels: readonly TreeNode[][],
    options: GenerationPlaybackOptions,
  ): Promise<boolean> {
    const { duration, stereoWidth, sustain } = options;
    const operationId = ++this.operationId;

    if (!sustain) {
      this.stopVoices();
    }

    const context = await this.ensureContext();

    if (operationId !== this.operationId) {
      return false;
    }

    try {
      const startTime = context.currentTime + 0.025;

      levels.forEach((nodes, index) => {
        this.scheduleGeneration(
          nodes,
          startTime + (sustain ? index * 0.09 : 0),
          duration,
          stereoWidth,
          sustain,
          sustain ? null : startTime + duration * 0.52,
          sustain ? null : startTime + duration,
        );
      });
    } catch (error) {
      this.stopVoices();
      throw error;
    }

    return true;
  }

  setVolume(value: number): void {
    this.volume = Math.min(1, Math.max(0, value));

    if (this.context !== null && this.master !== null) {
      const now = this.context.currentTime;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setTargetAtTime(this.volume * 0.42, now, 0.02);
    }
  }

  stop(): void {
    this.operationId += 1;
    this.stopVoices();
  }

  get currentTime(): number {
    return this.context?.currentTime ?? 0;
  }

  private stopVoices(): void {
    const now = this.context?.currentTime;

    for (const voice of [...this.activeVoices]) {
      this.activeVoices.delete(voice);

      if (
        now !== undefined
        && voice.startTime <= now
        && voice.stopTime > now
      ) {
        const releaseEnd = now + 0.018;

        try {
          voice.envelope.gain.cancelAndHoldAtTime(now);
          voice.envelope.gain.exponentialRampToValueAtTime(0.0001, releaseEnd);
          voice.oscillator.stop(releaseEnd + 0.004);
          continue;
        } catch {
          // Fall through to immediate cleanup if a browser rejects the release ramp.
        }
      }

      voice.oscillator.onended = null;

      try {
        voice.oscillator.stop();
      } catch {
        // A source that has already ended can safely be ignored.
      }

      this.disconnectVoice(voice);
    }
  }

  private disconnectVoice(voice: ActiveVoice): void {
    voice.oscillator.onended = null;
    voice.oscillator.disconnect();
    voice.envelope.disconnect();
    voice.panner.disconnect();
    this.activeVoices.delete(voice);
  }

  private async ensureContext(): Promise<AudioContext> {
    if (this.context === null) {
      const context = new AudioContext({ latencyHint: 'interactive' });
      const toneFilter = context.createBiquadFilter();
      const compressor = context.createDynamicsCompressor();
      const master = context.createGain();

      toneFilter.type = 'lowpass';
      toneFilter.frequency.value = 7200;
      toneFilter.Q.value = 0.55;
      compressor.threshold.value = -20;
      compressor.knee.value = 14;
      compressor.ratio.value = 7;
      compressor.attack.value = 0.004;
      compressor.release.value = 0.24;
      master.gain.value = this.volume * 0.42;
      toneFilter.connect(compressor);
      compressor.connect(master);
      master.connect(context.destination);

      this.context = context;
      this.waveforms = new Map<GenerationWaveform, PeriodicWave>([
        ['sine', this.createWaveform(context, [0, 1])],
        ['soft-sawtooth', this.createWaveform(context, [0, 1, -0.34, 0.18, -0.1, 0.065, -0.045])],
        ['soft-triangle', this.createWaveform(context, [0, 1, 0, -0.11, 0, 0.04, 0, -0.02])],
        ['soft-square', this.createWaveform(context, [0, 1, 0, 0.24, 0, 0.11, 0, 0.055])],
      ]);

      // Keep a reference to the actual output gain for volume changes.
      this.master = master;
      this.output = toneFilter;
    }

    if (this.context.state === 'suspended') {
      await this.context.resume();
    }

    return this.context;
  }

  private output: AudioNode | null = null;

  private createWaveform(context: AudioContext, harmonics: readonly number[]): PeriodicWave {
    return context.createPeriodicWave(
      new Float32Array(harmonics.length),
      new Float32Array(harmonics),
      { disableNormalization: false },
    );
  }

  private scheduleGeneration(
    nodes: readonly TreeNode[],
    startTime: number,
    articulationDuration: number,
    stereoWidth: number,
    sustain: boolean,
    releaseStart: number | null,
    stopTime: number | null,
  ): void {
    if (this.context === null || this.output === null || this.waveforms === null) {
      return;
    }

    const generation = nodes[0]?.generation ?? 0;
    const baseVoicePeak = Math.min(0.17, 0.26 / Math.sqrt(Math.max(1, nodes.length)));
    const voicePeak = baseVoicePeak
      * (sustain ? 0.68 * sustainedGenerationGain(generation) : 1);
    const width = Math.min(1, Math.max(0, stereoWidth));

    nodes.forEach((node) => {
      let oscillator: OscillatorNode | null = null;
      let envelope: GainNode | null = null;
      let panner: StereoPannerNode | null = null;
      let voice: ActiveVoice | null = null;

      try {
        oscillator = this.context!.createOscillator();
        envelope = this.context!.createGain();
        panner = this.context!.createStereoPanner();
        const pan = Math.min(0.92, Math.max(-0.92, node.pan * width));
        const attackEnd = startTime + Math.min(0.035, articulationDuration * 0.16);
        const voiceStopTime = stopTime ?? Number.POSITIVE_INFINITY;
        voice = { oscillator, envelope, panner, startTime, stopTime: voiceStopTime };
        this.activeVoices.add(voice);

        const waveform = this.waveforms!.get(node.waveform);

        if (waveform === undefined || !GENERATION_WAVEFORMS.includes(node.waveform)) {
          throw new Error(`Waveform is not available: ${node.waveform}`);
        }

        oscillator.setPeriodicWave(waveform);
        oscillator.frequency.setValueAtTime(node.frequency, startTime);
        oscillator.detune.setValueAtTime(node.detuneCents, startTime);
        panner.pan.setValueAtTime(pan, startTime);
        envelope.gain.setValueAtTime(0.0001, startTime);
        envelope.gain.exponentialRampToValueAtTime(voicePeak, attackEnd);

        if (sustain) {
          const settleEnd = attackEnd + Math.min(0.16, articulationDuration * 0.2);
          const sustainLevel = voicePeak * 0.52;
          envelope.gain.exponentialRampToValueAtTime(sustainLevel, settleEnd);

          if (stopTime !== null) {
            const voiceReleaseStart = Math.max(
              settleEnd,
              releaseStart ?? stopTime - Math.min(0.42, articulationDuration * 0.3),
            );
            envelope.gain.setValueAtTime(sustainLevel, voiceReleaseStart);
            envelope.gain.exponentialRampToValueAtTime(0.0001, stopTime);
          }
        } else {
          const bodyEnd = startTime + articulationDuration * 0.52;
          envelope.gain.exponentialRampToValueAtTime(voicePeak * 0.52, bodyEnd);

          if (stopTime !== null) {
            const voiceReleaseStart = Math.max(bodyEnd, releaseStart ?? bodyEnd);
            envelope.gain.setValueAtTime(voicePeak * 0.52, voiceReleaseStart);
            envelope.gain.exponentialRampToValueAtTime(0.0001, stopTime);
          }
        }

        oscillator.connect(envelope);
        envelope.connect(panner);
        panner.connect(this.output!);

        oscillator.onended = () => {
          if (voice !== null) {
            this.disconnectVoice(voice);
          }
        };

        oscillator.start(startTime);

        if (stopTime !== null) {
          oscillator.stop(stopTime + 0.02);
        }
      } catch (error) {
        if (voice !== null) {
          this.activeVoices.delete(voice);
        }

        if (oscillator !== null) {
          oscillator.onended = null;

          try {
            oscillator.stop();
          } catch {
            // A voice that never started needs only to be disconnected.
          }

          oscillator.disconnect();
        }

        envelope?.disconnect();
        panner?.disconnect();
        throw error;
      }
    });
  }
}
