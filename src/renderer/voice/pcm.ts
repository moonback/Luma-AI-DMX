/** Gemini Live audio: 16-bit little-endian PCM, base64 on the wire. 16 kHz from the microphone, 24 kHz to the speaker. */
export const MIC_RATE = 16000;
export const SPEAKER_RATE = 24000;

export function floatToPcm16Base64(samples: Float32Array): string {
  const pcm = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) pcm[i] = Math.round(Math.max(-1, Math.min(1, samples[i]!)) * 32767);
  let bin = '';
  const bytes = new Uint8Array(pcm.buffer);
  // Chunked: spreading a whole buffer into fromCharCode overflows the call stack on long chunks.
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export function pcm16Base64ToFloat(b64: string): Float32Array<ArrayBuffer> {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const pcm = new Int16Array(bytes.buffer, 0, bytes.length >> 1);
  const out = new Float32Array(pcm.length);
  for (let i = 0; i < pcm.length; i++) out[i] = pcm[i]! / 32768;
  return out;
}
