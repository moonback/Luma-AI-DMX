import { useState } from 'react';
import { ClipboardCopy, FileText, Play, Square } from 'lucide-react';
import { act } from '../../api';
import { confirmAction, useStore } from '../../store';
import { Field, Panel } from '../../components/ui';
import type { TestPatternKind } from '../../../core/engine/testPattern';

const PATTERNS: { id: TestPatternKind; label: string; hint: string }[] = [
  { id: 'signature', label: 'Signature (canal n = n mod 256)', hint: 'Lisez quelques canaux sur le testeur : la valeur reçue doit être le numéro du canal modulo 256 (canal 300 → 44).' },
  { id: 'walk', label: 'Balayage (un canal à 255, 2 par seconde)', hint: 'Vérifie l’ordre des canaux et qu’aucun canal n’est sauté.' },
  { id: 'ramp', label: 'Rampe 0 → 255 → 0 sur 10 s', hint: 'Tous les canaux ensemble : continuité des valeurs et fluidité.' },
  { id: 'zero', label: 'Zéro partout', hint: 'Contrôle qu’aucune valeur parasite n’arrive.' },
];

/** Hardware validation campaign: raw test patterns and the session report to paste into docs/HARDWARE.md. */
export function HardwarePanel() {
  const active = useStore((s) => s.runtime?.testPattern ?? null);
  const universeCount = useStore((s) => s.project?.project.show.universes ?? 1);
  const [kind, setKind] = useState<TestPatternKind>('signature');
  const [universe, setUniverse] = useState(1);
  const [report, setReport] = useState<string | null>(null);
  const start = async () => {
    const ok = await confirmAction({
      title: 'Lancer une mire de test',
      message: `L’univers ${universe} va recevoir des valeurs brutes : tous les canaux sont pilotés, reset, lampe et strobe compris.\nÀ utiliser avec un testeur DMX ou la page d’état d’un nœud, jamais avec des projecteurs devant du public.`,
      confirmLabel: 'Lancer la mire',
    });
    if (ok) await act({ type: 'output.testPattern', pattern: kind, universes: [universe], confirmed: true });
  };
  const loadReport = async () => setReport((await act({ type: 'hardware.report' }))?.markdown ?? null);
  return (
    <Panel title="Campagne matériel (testeur DMX)">
      {active && (
        <div className="row" style={{ marginBottom: 8 }} data-testid="test-pattern-active">
          <span className="badge warn">Mire « {active.kind} » active sur U{active.universes.join(', U')} — le show est remplacé</span>
          <button className="btn danger sm" onClick={() => void act({ type: 'output.testPattern', pattern: null })}><Square size={12} />Arrêter la mire</button>
        </div>
      )}
      <div className="grid g2">
        <Field label="Mire" hint={PATTERNS.find((p) => p.id === kind)?.hint}>
          <select className="select" data-testid="test-pattern-kind" value={kind} onChange={(e) => setKind(e.target.value as TestPatternKind)}>{PATTERNS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select>
        </Field>
        <Field label="Univers local">
          <select className="select" value={universe} onChange={(e) => setUniverse(Number(e.target.value))}>{Array.from({ length: universeCount }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}</select>
        </Field>
      </div>
      <div className="row wrap">
        <button className="btn" data-testid="test-pattern-start" onClick={() => void start()}><Play size={13} />Lancer la mire</button>
        <button className="btn" data-testid="hardware-report" onClick={() => void loadReport()}><FileText size={13} />Rapport de session</button>
      </div>
      <p className="small dim">Protocole et critères d’acceptation : docs/HARDWARE.md. STOP OUTPUT coupe aussi les mires. Pour mesurer la reconnexion, débranchez puis rebranchez l’interface : la durée de chaque coupure est enregistrée.</p>
      {report && (
        <div className="col">
          <textarea className="input mono small" readOnly data-testid="hardware-report-text" style={{ minHeight: 220, width: '100%' }} value={report} />
          <div className="row"><button className="btn sm" onClick={() => void navigator.clipboard.writeText(report).then(() => useStore.getState().toast({ kind: 'success', title: 'Rapport copié' }))}><ClipboardCopy size={12} />Copier (Markdown)</button></div>
        </div>
      )}
    </Panel>
  );
}
