/**
 * Web Worker for offline song analysis.
 *
 * The renderer transfers the mono Float32Array (zero-copy via Transferable) and receives
 * the SongAnalysis back. Running the analysis off the UI thread means the interface stays
 * fully responsive during long imports, and the cooperative `yieldFn` slicing is no longer
 * needed (kept as a no-op fallback for any future non-worker use).
 *
 * Message protocol
 * ─────────────────
 * IN  { samples: Float32Array, sampleRate: number, bpmMin: number, bpmMax: number }
 *     The `samples` buffer is transferred (not copied): the sender must not use it after postMessage.
 *
 * OUT { type: 'progress', p: number, step: string }
 *     Progress updates, 0..1.
 *
 * OUT { type: 'done', analysis: SongAnalysis }
 *     Final result.
 *
 * OUT { type: 'error', message: string }
 *     Fatal error during analysis.
 */

import { analyzeAudio } from '../core/music/analyze';
import type { SongAnalysis } from '../core/model/schemas';

export interface WorkerRequest {
  samples: Float32Array;
  sampleRate: number;
  bpmMin: number;
  bpmMax: number;
}

export type WorkerMessage =
  | { type: 'progress'; p: number; step: string }
  | { type: 'done'; analysis: SongAnalysis }
  | { type: 'error'; message: string };

self.onmessage = async (ev: MessageEvent<WorkerRequest>) => {
  const { samples, sampleRate, bpmMin, bpmMax } = ev.data;
  try {
    const analysis = await analyzeAudio(samples, sampleRate, {
      bpmMin,
      bpmMax,
      onProgress: (p) => {
        const msg: WorkerMessage = { type: 'progress', p, step: 'Analyse' };
        self.postMessage(msg);
      },
      // No yieldFn needed in a worker: we have a dedicated thread.
    });
    const msg: WorkerMessage = { type: 'done', analysis };
    self.postMessage(msg);
  } catch (err) {
    const msg: WorkerMessage = {
      type: 'error',
      message: err instanceof Error ? err.message : String(err),
    };
    self.postMessage(msg);
  }
};
