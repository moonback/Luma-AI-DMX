import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const corpusDir = path.join(root, 'tests/eval/corpus');
const index = JSON.parse(readFileSync(path.join(corpusDir, 'corpus.json'), 'utf8'));
const schema = JSON.parse(readFileSync(path.join(corpusDir, 'schema.json'), 'utf8'));
const errors = [];
const ids = new Set();
const report = { schemaVersion: index.schemaVersion, total: index.tracks?.length ?? 0, verified: 0, errors, tracks: [] };

const fail = (id, message) => errors.push(`${id}: ${message}`);
const finite = (n) => typeof n === 'number' && Number.isFinite(n);
const checkRange = (id, label, start, end, duration) => {
  if (!finite(start) || !finite(end) || start < 0 || end <= start) fail(id, `${label}: intervalle temporel invalide`);
  if (finite(duration) && end > duration + 0.05) fail(id, `${label}: dépasse la durée audio`);
};

if (index.schemaVersion !== 1) fail('corpus', 'schemaVersion doit être 1');
if (!Array.isArray(index.tracks)) fail('corpus', 'tracks doit être un tableau');

for (const entry of index.tracks ?? []) {
  const id = entry.trackId;
  if (!id || ids.has(id)) { fail(String(id ?? 'unknown'), 'trackId absent ou dupliqué'); continue; }
  ids.add(id);
  const file = path.join(corpusDir, 'annotations', `${id}.json`);
  if (!existsSync(file)) { fail(id, 'fichier d’annotation manquant'); continue; }
  let track;
  try { track = JSON.parse(readFileSync(file, 'utf8')); }
  catch { fail(id, 'JSON invalide'); continue; }
  if (track.trackId !== id || track.schemaVersion !== schema.properties.schemaVersion.const) fail(id, 'identité/version incohérente');
  const duration = track.metadata?.durationSeconds;
  if (!finite(duration) || duration <= 0) fail(id, 'durée audio invalide');
  if (!/^[a-fA-F0-9]{64}$/.test(track.audio?.sha256 ?? '')) fail(id, 'SHA-256 audio absent/invalide');
  if (!track.audio?.source) fail(id, 'source audio non renseignée');
  if (!Array.isArray(track.tempoSegments) || !track.tempoSegments.length) fail(id, 'aucun segment tempo');
  for (const [i, s] of (track.tempoSegments ?? []).entries()) {
    checkRange(id, `tempoSegments[${i}]`, s.startSeconds, s.endSeconds, duration);
    if (!finite(s.bpm) || s.bpm < 20 || s.bpm > 400) fail(id, `tempoSegments[${i}]: BPM invalide`);
  }
  let previousBeat = -1;
  for (const [i, b] of (track.beats ?? []).entries()) {
    if (!finite(b.timeSeconds) || b.timeSeconds <= previousBeat) fail(id, `beats[${i}]: temps non strictement croissant`);
    if (b.timeSeconds < 0 || b.timeSeconds > duration + 0.05) fail(id, `beats[${i}]: hors durée`);
    if (!Number.isInteger(b.bar) || b.bar < 1 || !Number.isInteger(b.beat) || b.beat < 1) fail(id, `beats[${i}]: index de mesure/temps invalide`);
    previousBeat = b.timeSeconds;
  }
  for (const [i, b] of (track.bars ?? []).entries()) checkRange(id, `bars[${i}]`, b.startSeconds, b.endSeconds, duration);
  for (const [i, s] of (track.sections ?? []).entries()) checkRange(id, `sections[${i}]`, s.startSeconds, s.endSeconds, duration);
  if (track.review?.status === 'verified') report.verified++;
  report.tracks.push({ trackId: id, title: track.metadata?.title ?? '', status: track.review?.status ?? 'unknown', beats: track.beats?.length ?? 0, bars: track.bars?.length ?? 0, sections: track.sections?.length ?? 0 });
}
const min = index.target?.minimumTracks ?? 20;
const max = index.target?.maximumTracks ?? 30;
if (report.total < min) fail('corpus', `corpus incomplet: ${report.total}/${min} morceaux minimum`);
if (report.total > max) fail('corpus', `corpus trop grand: ${report.total}/${max} maximum`);
if (report.verified !== report.total) fail('corpus', `seulement ${report.verified}/${report.total} morceaux vérifiés`);
report.passed = errors.length === 0;
const outDir = path.join(root, 'test-results');
mkdirSync(outDir, { recursive: true });
writeFileSync(path.join(outDir, 'song-corpus-eval.json'), JSON.stringify({ generatedAt: new Date().toISOString(), ...report }, null, 2) + '\n');
console.log(JSON.stringify({ passed: report.passed, total: report.total, verified: report.verified, errors }, null, 2));
if (!report.passed) process.exitCode = 1;
