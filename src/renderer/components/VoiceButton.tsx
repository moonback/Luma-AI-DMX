import { useEffect, useRef, useState } from 'react';
import { Mic, MicOff } from 'lucide-react';
import { useStore } from '../store';
import { useT } from '../i18n';
import { startVoice, type VoiceState } from '../voice/session';

/** Starts / stops the Gemini Live voice assistant. The session ends with the component: the microphone never stays open behind another page. */
export function VoiceButton() {
  const tr = useT();
  const hasKey = useStore((s) => s.runtime?.ai.hasVoiceKey ?? false);
  const [state, setState] = useState<VoiceState | 'off'>('off');
  const handle = useRef<{ stop: () => void } | null>(null);
  useEffect(() => () => handle.current?.stop(), []);

  const toggle = async () => {
    if (state !== 'off') { handle.current?.stop(); return; }
    try {
      handle.current = await startVoice(setState, () => { handle.current = null; setState('off'); });
      if (!handle.current) setState('off');
    } catch (err) {
      setState('off');
      useStore.getState().toast({ kind: 'error', title: tr('voice.micError'), detail: (err as Error).message });
    }
  };

  const on = state !== 'off';
  return (
    <button className={`btn ${on ? 'primary' : ''}`} data-testid="voice-toggle" onClick={() => void toggle()} disabled={!hasKey && !on} title={hasKey ? undefined : tr('voice.noKey')}>
      {on ? <MicOff size={14} /> : <Mic size={14} />}
      {on ? `${tr(`voice.${state}`)} · ${tr('voice.stop')}` : tr('voice.start')}
    </button>
  );
}
