import { analyzeAudio } from '../core/music/analyze';
import type { MusicTrack, SongAnalysis } from '../core/model/schemas';
import { audioEngine } from './audioEngine';
import { act } from './api';

/**
 * Song import and synchronised playback, outside React (keeps playing across pages).
 * The project stores the analysis and the file's SHA-256 (a re-imported file is recognised without re-analysis); the audio
 * itself is saved on this machine by the main process and restored on demand.
 */
const ANALYSIS_RATE = 22050;

class MusicPlayer {
  private readonly buffers = new Map<string, AudioBuffer>();
  private ctx: AudioContext | null = null;
  private source: AudioBufferSourceNode | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private startedAt = 0;
  playing: { trackId: string; timelineId: string | null } | null = null;
  private readonly listeners = new Set<() => void>();
  /** Bumped on every change (playback or a restored file): the React snapshot. */
  revision = 0;

  subscribe(l: () => void): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }
  private changed(): void {
    this.revision++;
    for (const l of this.listeners) l();
  }

  hasAudio(hash: string): boolean {
    return this.buffers.has(hash);
  }

  /** Hash, decode and (unless `known`) analyse a file. Analysis runs in slices so the UI stays responsive. */
  async load(file: File, opts: { bpmRange: { min: number; max: number }; known: (hash: string) => boolean; onProgress: (p: number, step: string) => void }): Promise<{ hash: string; name: string; analysis: SongAnalysis | null }> {
    opts.onProgress(0, 'Lecture du fichier');
    const data = await file.arrayBuffer();
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', data)), (b) => b.toString(16).padStart(2, '0')).join('');
    opts.onProgress(0.02, 'Décodage');
    const buffer = await decode(data);
    this.buffers.set(hash, buffer);
    await act({ type: 'music.storeAudio', hash, data: new Uint8Array(data) });
    const name = file.name.replace(/\.[^.]+$/, '');
    if (opts.known(hash)) return { hash, name, analysis: null };
    // Mono 22.05 kHz for the analysis (the browser downmixes and resamples).
    const off = new OfflineAudioContext(1, Math.ceil(buffer.duration * ANALYSIS_RATE), ANALYSIS_RATE);
    const src = off.createBufferSource();
    src.buffer = buffer;
    src.connect(off.destination);
    src.start();
    const mono = (await off.startRendering()).getChannelData(0);
    // shortcut: analysis runs on the UI thread in cooperative slices (a Web Worker under file:// and the strict CSP is untested); move it to a worker if the UI stutters on long files.
    const analysis = await analyzeAudio(mono, ANALYSIS_RATE, {
      bpmMin: opts.bpmRange.min, bpmMax: opts.bpmRange.max,
      onProgress: (p) => opts.onProgress(0.05 + 0.95 * p, 'Analyse'),
      yieldFn: () => new Promise((r) => setTimeout(r, 0)),
    });
    return { hash, name, analysis };
  }

  /** Restores the audio saved on this machine; false when the file was never imported here. */
  async restore(hash: string): Promise<boolean> {
    if (this.buffers.has(hash)) return true;
    const data = await act({ type: 'music.loadAudio', hash });
    if (!data) return false;
    this.buffers.set(hash, await decode(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer));
    this.changed();
    return true;
  }

  position(): number {
    return this.ctx && this.playing ? Math.max(0, this.ctx.currentTime - this.startedAt) : 0;
  }

  /** Plays the track from `from` seconds; the generated timeline chases the playback position (timecode). */
  play(track: MusicTrack, from = 0): void {
    const buffer = this.buffers.get(track.hash);
    if (!buffer) throw new Error('Fichier audio non chargé : réimportez-le pour la lecture');
    this.stop();
    const ctx = new AudioContext();
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const out = ctx.createGain();
    src.connect(out);
    out.connect(ctx.destination);
    src.start(0, from);
    this.ctx = ctx;
    this.source = src;
    this.startedAt = ctx.currentTime - from;
    this.playing = { trackId: track.id, timelineId: track.created.timelineId };
    src.onended = () => { if (this.source === src) this.stop(); };
    // The live analyser listens to the player output: beats, followers, and the exact prediction from the analysis.
    audioEngine.startTrack(ctx, out, { sections: track.analysis.sections, bpm: track.analysis.bpm, position: () => this.position() });
    const tl = track.created.timelineId;
    if (tl) {
      const send = () => void window.luma.invoke({ type: 'timeline.timecode', seconds: this.position(), timelineId: tl });
      send();
      this.timer = setInterval(send, 100);
    }
    this.changed();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    const s = this.source;
    this.source = null;
    try { s?.stop(); } catch { /* already stopped */ }
    if (this.playing) audioEngine.stop();
    void this.ctx?.close().catch(() => undefined);
    this.ctx = null;
    this.playing = null;
    this.changed();
  }
}

async function decode(data: ArrayBuffer): Promise<AudioBuffer> {
  const ctx = new AudioContext();
  try {
    return await ctx.decodeAudioData(data.slice(0));
  } finally {
    void ctx.close();
  }
}

export const musicPlayer = new MusicPlayer();
