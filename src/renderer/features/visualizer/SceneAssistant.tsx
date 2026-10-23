import { useState } from 'react';
import { Wand2 } from 'lucide-react';
import { useT } from '../../i18n';
import { addEquipmentFromText } from '../../sceneActions';

/** Construire panel: describe equipment to add in words; previewed (understood, ambiguous, unavailable) before it is applied. */
export function SceneAssistant() {
  const tr = useT();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const run = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    try { if (await addEquipmentFromText(text)) setText(''); } finally { setBusy(false); }
  };
  return (
    <section className="scene-assistant" aria-label={tr('assist.title')} data-testid="scene-assistant">
      <h3 className="equip-subhead"><Wand2 size={12} /> {tr('assist.title')}</h3>
      <textarea className="input" rows={2} value={text} placeholder={tr('assist.placeholder')} aria-label={tr('assist.title')} data-testid="scene-assistant-text"
        onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void run(); } }} />
      <div className="row" style={{ gap: 6 }}>
        <button className="btn sm primary" disabled={!text.trim() || busy} onClick={() => void run()} data-testid="scene-assistant-run"><Wand2 size={12} />{tr('assist.run')}</button>
        <span className="small dim grow">{tr('assist.hint')}</span>
      </div>
    </section>
  );
}
