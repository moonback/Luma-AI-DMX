import { useState } from 'react';
import { act } from '../../api';
import { Field } from '../../components/ui';
import type { OpenRouterModel } from '../../../core/ai/providers/openrouter';
import { useT } from '../../i18n';

export function ModelPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const tr = useT();
  const [models, setModels] = useState<OpenRouterModel[] | null>(null);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const load = async (refresh = false) => {
    setLoading(true);
    const m = await act({ type: 'ai.listModels', refresh });
    setLoading(false);
    if (m) setModels(m);
  };
  const shown = (models ?? []).filter((m) => `${m.id} ${m.name}`.toLowerCase().includes(q.toLowerCase())).slice(0, 200);
  const current = models?.find((m) => m.id === value);
  const price = (v: number | null) => (v === null ? '?' : v === 0 ? tr('settings.ai.free') : `${v} $`);
  const info = current && tr('settings.ai.modelInfo', { name: current.name, context: current.contextLength ?? '?', input: price(current.promptPrice), output: price(current.completionPrice) })
    + tr(current.structuredOutputs ? 'settings.ai.infoStructured' : current.jsonMode ? 'settings.ai.infoJson' : 'settings.ai.infoPrompt');
  return (
    <Field label={tr('settings.ai.model')} hint={info || tr('settings.ai.modelHint')}>
      <div className="col">
        <div className="row">
          <input className="input mono" data-testid="ai-model" value={value} onChange={(e) => onChange(e.target.value.trim())} />
          <button className="btn" onClick={() => void load(models !== null)} disabled={loading}>{loading ? tr('common.loading') : models ? tr('settings.ai.refreshList') : tr('settings.ai.loadList')}</button>
        </div>
        {models && (
          <div className="panel" style={{ maxHeight: 260, overflow: 'auto' }}>
            <div style={{ padding: 8, position: 'sticky', top: 0, background: 'var(--panel)' }}><input className="input" placeholder={tr('settings.ai.search', { n: models.length })} value={q} onChange={(e) => setQ(e.target.value)} /></div>
            <table className="table small">
              <thead><tr><th>{tr('settings.ai.model')}</th><th>{tr('settings.ai.context')}</th><th>{tr('settings.ai.price')}</th><th>{tr('settings.ai.format')}</th></tr></thead>
              <tbody>
                {shown.map((m) => (
                  <tr key={m.id} className={`clickable ${m.id === value ? 'sel' : ''}`} onClick={() => onChange(m.id)}>
                    <td>{m.name}<div className="dim mono">{m.id}</div></td>
                    <td className="mono">{m.contextLength ?? '?'}</td>
                    <td className="mono">{price(m.promptPrice)} · {price(m.completionPrice)}</td>
                    <td>{m.structuredOutputs ? <span className="badge ok">{tr('settings.ai.structured')}</span> : m.jsonMode ? <span className="badge cyan">{tr('settings.ai.json')}</span> : <span className="badge">{tr('settings.ai.prompt')}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Field>
  );
}
