import { RotateCcw } from 'lucide-react';
import { Field, Panel } from '../../components/ui';
import { useT } from '../../i18n';
import { ASSISTANT_VOICES, DEFAULT_DIRECTOR_PROMPT, DEFAULT_VOICE_PROMPT } from '../../../core/ai/prompts';
import type { Settings } from '../../../core/settings/settings';

type Assistant = Settings['assistant'];

/** One system instruction text: the built-in default is shown until the operator edits it (null = default). */
function PromptField({ label, hint, value, fallback, onChange, testId }: { label: string; hint: string; value: string | null; fallback: string; onChange: (v: string | null) => void; testId: string }) {
  const tr = useT();
  return (
    <Field label={label} hint={hint}>
      <textarea className="textarea mono" rows={14} spellCheck={false} value={value ?? fallback} onChange={(e) => onChange(e.target.value)} data-testid={testId} />
      <div className="row small">
        <span className="dim">{tr(value === null ? 'settings.assistant.default' : 'settings.assistant.custom')}</span>
        <button className="btn sm" disabled={value === null} onClick={() => onChange(null)} data-testid={`${testId}-reset`}><RotateCcw size={12} />{tr('settings.assistant.reset')}</button>
      </div>
    </Field>
  );
}

/** Paramètres › Assistant: name, voice and the editable system instructions of the text and voice assistants. */
export function AssistantPanel({ value, onChange }: { value: Assistant; onChange: (v: Partial<Assistant>) => void }) {
  const tr = useT();
  return (
    <>
      <Panel title={tr('settings.assistant.identity')}>
        <div className="grid g2">
          <Field label={tr('settings.assistant.name')}>
            <input className="input" maxLength={40} value={value.name} onChange={(e) => onChange({ name: e.target.value })} data-testid="assistant-name" />
          </Field>
          <Field label={tr('settings.assistant.voice')} hint={tr('settings.assistant.voiceHint')}>
            <select className="select" value={value.voice} onChange={(e) => onChange({ voice: e.target.value as Assistant['voice'] })} data-testid="assistant-voice">
              {ASSISTANT_VOICES.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </Field>
        </div>
        <label className="check" title={tr('settings.assistant.autoApplyHint')}><input type="checkbox" checked={value.autoApply} onChange={(e) => onChange({ autoApply: e.target.checked })} data-testid="assistant-auto-apply" />{tr('settings.assistant.autoApply')}</label>
        {value.autoApply && <p className="small" style={{ color: '#f59e0b' }}>{tr('settings.assistant.autoApplyHint')}</p>}
      </Panel>
      <Panel title={tr('settings.assistant.prompts')}>
        <p className="small muted">{tr('settings.assistant.safety')}</p>
        <PromptField label={tr('settings.assistant.director')} hint={tr('settings.assistant.directorHint')} value={value.directorPrompt} fallback={DEFAULT_DIRECTOR_PROMPT} onChange={(directorPrompt) => onChange({ directorPrompt })} testId="assistant-director-prompt" />
        <PromptField label={tr('settings.assistant.voicePrompt')} hint={tr('settings.assistant.voicePromptHint')} value={value.voicePrompt} fallback={DEFAULT_VOICE_PROMPT} onChange={(voicePrompt) => onChange({ voicePrompt })} testId="assistant-voice-prompt" />
      </Panel>
    </>
  );
}
