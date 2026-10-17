import { useEffect, useState } from 'react';
import { FolderOpen, KeyRound } from 'lucide-react';
import { useStore, confirmAction } from '../store';
import { act } from '../api';
import { Field, NumberInput, PageHead, Panel, Tabs } from '../components/ui';
import { SHORTCUTS, type Settings } from '../../core/settings/settings';
import type { RecoveryEntry } from '../../core/project/store';

const TABS = [
  { id: 'general', label: 'Général' }, { id: 'appearance', label: 'Apparence' }, { id: 'engine', label: 'Moteur & sécurité' },
  { id: 'network', label: 'Réseau / DMX' }, { id: 'ai', label: 'IA et fournisseurs' }, { id: 'audio', label: 'Audio' },
  { id: 'shortcuts', label: 'Raccourcis' }, { id: 'logs', label: 'Logs & diagnostics' }, { id: 'backups', label: 'Sauvegardes' },
] as const;
type TabId = (typeof TABS)[number]['id'];

export function SettingsPage() {
  const [s, setS] = useState<Settings | null>(null);
  const [saved, setSaved] = useState<Settings | null>(null);
  const [tab, setTab] = useState<TabId>('general');
  const [key, setKey] = useState('');
  const [recovery, setRecovery] = useState<RecoveryEntry[]>([]);
  const rt = useStore((st) => st.runtime);
  const project = useStore((st) => st.project!);
  useEffect(() => { void act({ type: 'settings.get' }).then((x) => { if (x) { setS(x); setSaved(x); } }); }, []);
  useEffect(() => { if (tab === 'backups') void act({ type: 'project.listRecovery' }).then((x) => setRecovery(x ?? [])); }, [tab]);
  const reduced = !!s?.appearance.reducedMotion;
  const scale = s?.appearance.uiScale ?? 1;
  useEffect(() => { document.documentElement.classList.toggle('reduced-motion', reduced); document.documentElement.style.zoom = String(scale); }, [reduced, scale]);
  if (!s) return <div className="page">Chargement…</div>;
  const dirty = JSON.stringify(s) !== JSON.stringify(saved);
  const set = <K extends keyof Settings>(k: K, v: Partial<Settings[K]>) => setS({ ...s, [k]: { ...(s[k] as object), ...v } });
  const save = async () => { if (await act({ type: 'settings.update', settings: s })) { setSaved(s); useStore.getState().toast({ kind: 'success', title: 'Paramètres enregistrés' }); } };

  return (
    <div className="page">
      <PageHead title="Settings" subtitle="Paramètres de l’application (enregistrés sur cette machine, hors projet)">
        <button className="btn" disabled={!dirty} onClick={() => setS(saved)}>Annuler les modifications</button>
        <button className="btn primary" disabled={!dirty} onClick={() => void save()} data-testid="settings-save">Enregistrer</button>
      </PageHead>
      <Tabs tabs={TABS} value={tab} onChange={setTab} />
      <div style={{ maxWidth: 860 }}>
        {tab === 'general' && (
          <Panel title="Général">
            <div className="grid g2">
              <Field label="Sauvegarde automatique de récupération (minutes)" hint="0 = désactivée. Écrite dans le dossier de données, sans écraser votre fichier."><NumberInput value={s.general.autosaveMinutes} min={0} max={60} onChange={(v) => set('general', { autosaveMinutes: v })} /></Field>
              <label className="check"><input type="checkbox" checked={s.general.confirmDangerous} onChange={(e) => set('general', { confirmDangerous: e.target.checked })} />Confirmer les actions dangereuses</label>
              <Field label="Projets récents">
                <div className="col small">{s.general.recentProjects.length ? s.general.recentProjects.map((p) => <button key={p} className="btn ghost sm" style={{ justifyContent: 'flex-start' }} onClick={async () => (!project.dirty || (await confirmAction({ title: 'Modifications non enregistrées', message: 'Ouvrir sans enregistrer le projet actuel ?', confirmLabel: 'Ouvrir' }))) && void act({ type: 'project.open', path: p })}><FolderOpen size={12} />{p}</button>) : <span className="dim">Aucun</span>}</div>
              </Field>
            </div>
          </Panel>
        )}
        {tab === 'appearance' && (
          <Panel title="Apparence">
            <div className="grid g2">
              <label className="check"><input type="checkbox" checked={s.appearance.reducedMotion} onChange={(e) => set('appearance', { reducedMotion: e.target.checked })} />Réduire les animations</label>
              <Field label="Échelle de l’interface"><NumberInput value={s.appearance.uiScale} min={0.8} max={1.4} step={0.05} onChange={(v) => set('appearance', { uiScale: v })} /></Field>
            </div>
          </Panel>
        )}
        {tab === 'engine' && (
          <Panel title="Moteur et sécurité">
            <div className="grid g2">
              <Field label="Fréquence du moteur (Hz)" hint="10–44 Hz. Mesurée en direct dans la barre d’état."><NumberInput value={s.engine.rateHz} min={10} max={44} onChange={(v) => set('engine', { rateHz: v })} /></Field>
              <Field label="Politique de blackout" hint="Le blackout n’est pas universellement sûr : choisissez selon vos appareils.">
                <select className="select" value={s.engine.blackoutPolicy} onChange={(e) => set('engine', { blackoutPolicy: e.target.value as Settings['engine']['blackoutPolicy'] })}>
                  <option value="intensity">Intensités à 0 (positions et couleurs maintenues)</option>
                  <option value="intensity-shutter">Intensités à 0 + shutter fermé (si le profil le déclare)</option>
                  <option value="all-zero">Tous les canaux à 0 (attention : pan/tilt et fonctions bougent)</option>
                </select>
              </Field>
              <Field label="Fréquence strobe maximale (Hz)" hint="Plafond appliqué à tous les effets strobe (sécurité photosensible)."><NumberInput value={s.engine.maxStrobeHz} min={1} max={25} onChange={(v) => set('engine', { maxStrobeHz: v })} /></Field>
              <div />
              <Field label="Priorité couche IA"><NumberInput value={s.engine.priorities.ai} min={1} max={99} onChange={(v) => set('engine', { priorities: { ...s.engine.priorities, ai: v } })} /></Field>
              <Field label="Priorité timeline"><NumberInput value={s.engine.priorities.timeline} min={1} max={99} onChange={(v) => set('engine', { priorities: { ...s.engine.priorities, timeline: v } })} /></Field>
              <Field label="Priorité audio réactif"><NumberInput value={s.engine.priorities.audio} min={1} max={99} onChange={(v) => set('engine', { priorities: { ...s.engine.priorities, audio: v } })} /></Field>
            </div>
            <p className="small dim" style={{ marginBottom: 0 }}>Politique de fusion : le contrôle manuel est toujours prioritaire. Entre sources de même priorité : intensité = HTP, autres attributs = LTP. Une priorité supérieure remplace. Les listes de cues et effets ont leur propre priorité.</p>
          </Panel>
        )}
        {tab === 'network' && (
          <Panel title="Réseau, Art-Net, sACN, USB-DMX">
            <p className="muted" style={{ marginTop: 0 }}>La configuration détaillée des sorties (destinations, univers, interfaces, priorité sACN, port USB) se fait dans <button className="btn sm" onClick={() => useStore.getState().setPage('output')}>DMX Output</button>.</p>
            <table className="table small"><tbody>
              <tr><td>Sorties configurées</td><td>{s.outputs.map((o) => o.name).join(', ')}</td></tr>
              <tr><td>Identifiant sACN (CID)</td><td className="mono">{s.sacn?.cid ?? '—'}</td></tr>
              <tr><td>Armement au démarrage</td><td>Jamais : les sorties réelles démarrent désarmées à chaque lancement.</td></tr>
            </tbody></table>
          </Panel>
        )}
        {tab === 'ai' && (
          <Panel title="IA et fournisseurs">
            <div className="grid g2">
              <Field label="Fournisseur">
                <select className="select" value={s.ai.provider} onChange={(e) => set('ai', { provider: e.target.value as Settings['ai']['provider'] })}>
                  <option value="local">Local déterministe (sans réseau)</option>
                  <option value="anthropic">Claude (Anthropic API)</option>
                </select>
              </Field>
              <Field label="Modèle"><input className="input mono" value={s.ai.model} onChange={(e) => set('ai', { model: e.target.value })} disabled={s.ai.provider === 'local'} /></Field>
              <Field label="Effort de raisonnement">
                <select className="select" value={s.ai.effort} onChange={(e) => set('ai', { effort: e.target.value as Settings['ai']['effort'] })} disabled={s.ai.provider === 'local'}>
                  <option value="low">Faible (rapide)</option><option value="medium">Moyen</option><option value="high">Élevé</option>
                </select>
              </Field>
              <Field label="Délai maximal (s)"><NumberInput value={s.ai.timeoutSec} min={5} max={300} onChange={(v) => set('ai', { timeoutSec: v })} /></Field>
              <label className="check"><input type="checkbox" checked={s.ai.fallbackToLocal} onChange={(e) => set('ai', { fallbackToLocal: e.target.checked })} />Repli sur le mode local si le fournisseur est indisponible</label>
              <label className="check" title="Protection photosensible"><input type="checkbox" checked={s.ai.allowStrobe} onChange={(e) => set('ai', { allowStrobe: e.target.checked })} />Autoriser l’IA à proposer des effets strobe</label>
            </div>
            {s.ai.provider === 'anthropic' && (
              <div className="col" style={{ marginTop: 14 }}>
                <Field label="Clé API Anthropic" hint="Chiffrée par le système (safeStorage) dans le processus principal. Jamais renvoyée à l’interface, jamais écrite dans un projet.">
                  <div className="row">
                    <input className="input mono" type="password" autoComplete="off" placeholder={rt?.ai.hasKey ? '•••••••• (enregistrée)' : 'sk-ant-…'} value={key} onChange={(e) => setKey(e.target.value)} />
                    <button className="btn primary" disabled={key.trim().length < 10} onClick={() => void act({ type: 'ai.setKey', key: key.trim() }).then((r) => r && setKey(''))}><KeyRound size={13} />Enregistrer</button>
                    <button className="btn danger" disabled={!rt?.ai.hasKey} onClick={() => void act({ type: 'ai.setKey', key: null })}>Supprimer</button>
                  </div>
                </Field>
                <span className="small">État : {rt?.ai.hasKey ? <span className="badge ok">clé configurée</span> : <span className="badge warn">aucune clé — le mode local sera utilisé</span>}{rt?.ai.lastError ? <span className="badge err" style={{ marginLeft: 6 }}>{rt.ai.lastError}</span> : null}</span>
              </div>
            )}
          </Panel>
        )}
        {tab === 'audio' && (
          <Panel title="Audio">
            <p className="muted" style={{ margin: 0 }}>Source, sensibilité, lissage et réactions se règlent dans <button className="btn sm" onClick={() => useStore.getState().setPage('audio')}>Audio Reactive</button>. Les réglages d’analyse sont enregistrés dans le projet.</p>
          </Panel>
        )}
        {tab === 'shortcuts' && (
          <Panel title="Raccourcis clavier" flush>
            <table className="table"><tbody>{SHORTCUTS.map((k) => <tr key={k.keys}><td className="mono" style={{ width: 220 }}>{k.keys}</td><td>{k.action}</td></tr>)}</tbody></table>
          </Panel>
        )}
        {tab === 'logs' && (
          <Panel title="Logs et diagnostics">
            <div className="grid g2">
              <Field label="Niveau de journalisation">
                <select className="select" value={s.logs.level} onChange={(e) => set('logs', { level: e.target.value as Settings['logs']['level'] })}>
                  <option value="debug">Debug</option><option value="info">Info</option><option value="warn">Avertissements</option><option value="error">Erreurs</option>
                </select>
              </Field>
              <div className="row"><button className="btn" onClick={() => useStore.getState().toggleDiag()}>Ouvrir la console de diagnostic</button></div>
            </div>
          </Panel>
        )}
        {tab === 'backups' && (
          <Panel title="Sauvegardes et récupération">
            <p className="small muted" style={{ marginTop: 0 }}>Chaque enregistrement conserve la version précédente (.bak). La sauvegarde automatique écrit une copie de récupération séparée.</p>
            {recovery.length === 0 ? <p className="muted">Aucune copie de récupération.</p> : (
              <table className="table small"><tbody>
                {recovery.map((r) => (
                  <tr key={r.file}><td>{r.kind === 'backup' ? <span className="badge">.bak</span> : <span className="badge cyan">auto</span>}</td><td className="mono">{r.name}</td><td>{new Date(r.modifiedAt).toLocaleString()}</td>
                    <td><button className="btn sm" onClick={async () => (!project.dirty || (await confirmAction({ title: 'Ouvrir une copie de récupération', message: 'Le projet actuel contient des modifications non enregistrées. Continuer ?', confirmLabel: 'Ouvrir' }))) && void act({ type: 'project.openRecovery', file: r.file })}>Ouvrir</button></td></tr>
                ))}
              </tbody></table>
            )}
            <div className="row"><button className="btn" onClick={() => void act({ type: 'project.export' })}>Exporter une copie du projet…</button></div>
          </Panel>
        )}
      </div>
    </div>
  );
}
