import { GoogleGenAI, Modality, type FunctionCall, type LiveServerMessage, type Session } from '@google/genai';
import { act } from '../api';
import { createToolRunner } from './tools';
import { floatToPcm16Base64, MIC_RATE, pcm16Base64ToFloat, SPEAKER_RATE } from './pcm';

export type VoiceState = 'connecting' | 'listening' | 'speaking' | 'working';

const LOG = '[Voice]';

/**
 * One Gemini Live session: microphone → model → speaker, with the lighting tools of ./tools.
 * The real API key stays in the main process; the renderer only holds a single-use ephemeral token.
 * Returns null when no token could be obtained (the error is already shown); rejects when the microphone is refused.
 */
export async function startVoice(onState: (s: VoiceState) => void, onClose: () => void): Promise<{ stop: () => void } | null> {
  console.log(LOG, '▶ startVoice — requesting ephemeral token...');
  onState('connecting');

  const auth = await act({ type: 'ai.voiceToken' });
  if (!auth) {
    console.error(LOG, '✖ No token returned by ai.voiceToken — aborting.');
    return null;
  }
  console.log(LOG, '✔ Token obtained — model:', auth.model, '| token length:', auth.token?.length ?? 0);

  console.log(LOG, '🎤 Requesting microphone...');
  const mic = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
  console.log(LOG, '✔ Microphone granted — tracks:', mic.getTracks().map((t) => `${t.kind}/${t.label}`).join(', '));

  const inCtx = new AudioContext({ sampleRate: MIC_RATE });
  const outCtx = new AudioContext({ sampleRate: SPEAKER_RATE });
  const playing = new Set<AudioBufferSourceNode>();
  let playAt = 0;
  let session: Session | undefined;
  let stopped = false;
  let pending = 0;
  const run = createToolRunner();

  const idle = () => { if (!stopped && !pending && !playing.size) onState('listening'); };
  const flush = () => {
    console.log(LOG, '⏹ flush() — stopping', playing.size, 'audio source(s)');
    for (const s of playing) s.stop();
    playing.clear();
    playAt = 0;
  };
  const play = (b64: string) => {
    const samples = pcm16Base64ToFloat(b64);
    console.log(LOG, '🔊 play() — samples:', samples.length, '| approx duration:', (samples.length / SPEAKER_RATE).toFixed(2), 's');
    const buf = outCtx.createBuffer(1, samples.length, SPEAKER_RATE);
    buf.copyToChannel(samples, 0);
    const src = outCtx.createBufferSource();
    src.buffer = buf;
    src.connect(outCtx.destination);
    playAt = Math.max(playAt, outCtx.currentTime);
    src.start(playAt);
    playAt += buf.duration;
    playing.add(src);
    src.onended = () => { playing.delete(src); idle(); };
    onState('speaking');
  };

  const answer = async (fc: FunctionCall) => {
    console.log(LOG, '🔧 tool call received — name:', fc.name, '| id:', fc.id, '| args:', JSON.stringify(fc.args ?? {}));
    pending++;
    onState('working');
    let response: Record<string, unknown>;
    try {
      response = await run(fc.name ?? '', fc.args ?? {});
      console.log(LOG, '✔ tool response — name:', fc.name, '| response:', JSON.stringify(response));
    } catch (err) {
      console.error(LOG, '✖ tool threw — name:', fc.name, '| error:', err);
      response = { error: (err as Error).message };
    }
    // The proposal summary must be spoken as soon as it is ready.
    // NOTE: FunctionResponseScheduling.INTERRUPT is NOT supported on gemini-3.8-live (async-only model).
    // Scheduling is only supported on legacy gemini-3.1 models — omitting it here.
    pending--;
    if (!stopped) {
      console.log(LOG, '📤 sendToolResponse — name:', fc.name, '| id:', fc.id);
      session?.sendToolResponse({ functionResponses: [{ id: fc.id, name: fc.name, response }] });
    } else {
      console.warn(LOG, '⚠ session stopped before sendToolResponse could run — name:', fc.name);
    }
    idle();
  };

  const stop = () => {
    if (stopped) return;
    console.log(LOG, '🛑 stop() called — cleaning up session.');
    stopped = true;
    flush();
    mic.getTracks().forEach((t) => t.stop());
    void inCtx.close();
    void outCtx.close();
    session?.close();
    void act({ type: 'ai.resetThread' });
    onClose();
  };

  try {
    console.log(LOG, '🔌 Connecting to Gemini Live — model:', auth.model);
    console.log(LOG, '📋 systemInstruction + tools are locked server-side in the ephemeral token constraints.');

    // auth.token is already token.name (the ephemeral token identifier).
    // Per Google docs, ephemeral tokens work with v1beta only (NOT v1alpha).
    // systemInstruction and tools are locked server-side in liveConnectConstraints —
    // the constrained endpoint ignores any config the client sends, so we must not
    // duplicate them here (they are already enforced by the token).
    console.log(LOG, '🔑 Using ephemeral token — v1beta (constrained endpoint, config locked server-side).');
    const ai = new GoogleGenAI({ apiKey: auth.token, httpOptions: { apiVersion: 'v1beta' } });
    session = await ai.live.connect({
      model: auth.model,
      config: { responseModalities: [Modality.AUDIO] },
      callbacks: {
        onmessage: (m: LiveServerMessage) => {
          // Log every raw server message (truncated for audio chunks)
          const hasAudio = (m.serverContent?.modelTurn?.parts ?? []).some((p) => p.inlineData?.data);
          const hasTool = (m.toolCall?.functionCalls ?? []).length > 0;
          const interrupted = m.serverContent?.interrupted ?? false;
          console.log(
            LOG, '📨 server message —',
            'interrupted:', interrupted,
            '| audio chunks:', (m.serverContent?.modelTurn?.parts ?? []).filter((p) => p.inlineData?.data).length,
            '| text parts:', (m.serverContent?.modelTurn?.parts ?? []).filter((p) => p.text).map((p) => p.text),
            '| tool calls:', (m.toolCall?.functionCalls ?? []).map((f) => f.name),
            hasTool ? '← TOOL CALL' : hasAudio ? '← AUDIO' : '',
          );

          if (interrupted) flush();
          for (const part of m.serverContent?.modelTurn?.parts ?? []) if (part.inlineData?.data) play(part.inlineData.data);
          for (const fc of m.toolCall?.functionCalls ?? []) void answer(fc);
        },
        onerror: (e) => {
          console.error(LOG, '✖ WebSocket error from Gemini Live:', e);
          stop();
        },
        onclose: (e) => {
          console.warn(LOG, '🔌 WebSocket closed by server:', e);
          stop();
        },
      },
    });
    console.log(LOG, '✔ Session connected successfully.');

    // ScriptProcessor rather than an AudioWorklet: the renderer CSP (script-src 'self') forbids the blob module a worklet would need.
    const proc = inCtx.createScriptProcessor(2048, 1, 1);
    proc.onaudioprocess = (e) => {
      if (!stopped) session?.sendRealtimeInput({ audio: { data: floatToPcm16Base64(e.inputBuffer.getChannelData(0)), mimeType: `audio/pcm;rate=${MIC_RATE}` } });
    };
    inCtx.createMediaStreamSource(mic).connect(proc);
    proc.connect(inCtx.destination);
    console.log(LOG, '🎙 Microphone pipeline started — sending audio at', MIC_RATE, 'Hz.');

    console.log(LOG, '✔ Session is ready — waiting for voice input.');
    // NOTE: sendClientContent is NOT used here for system-prompt reinforcement.
    // On gemini-3.8-live, turn_complete=true unconditionally interrupts generation and
    // turn_complete=false causes the server to close the WebSocket. The systemInstruction
    // in the connect config is sufficient.
  } catch (err) {
    console.error(LOG, '✖ Fatal error during session setup:', err);
    stop();
    throw err;
  }

  onState('listening');
  return { stop };
}
