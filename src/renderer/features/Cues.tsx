import { useState } from 'react';
import { ArrowDown, ArrowUp, ChevronRight, ListOrdered, Pause, Play, Plus, SkipBack, Square, Trash2 } from 'lucide-react';
import { useStore, confirmAction } from '../store';
import { act, newId } from '../api';
import { useT } from '../i18n';
import { Empty, Field, Modal, NumberInput, PageHead, Panel } from '../components/ui';
import type { Cue, CueList } from '../../core/model/schemas';

const CURVES = ['linear', 'easeIn', 'easeOut', 'easeInOut', 'snap'] as const;
/** Badge colour per playback state, so the operator reads the state at a glance. */
const STATE_BADGE = { idle: '', delay: 'warn', fading: 'cyan', holding: 'ok', paused: 'warn' } as const;

function ListDialog({ list, onClose }: { list?: CueList; onClose: () => void }) {
  const tr = useT();
  const [name, setName] = useState(list?.name ?? tr('cues.list.defaultName'));
  const [priority, setPriority] = useState(list?.priority ?? 50);
  const [loop, setLoop] = useState(list?.loop ?? false);
  const save = async () => {
    const id = list?.id ?? newId();
    if (await act({ type: 'cueList.upsert', cueList: { id, name: name.trim() || tr('cues.list.fallback'), priority, loop, cues: list?.cues ?? [] } })) {
      useStore.getState().setCueList(id);
      onClose();
    }
  };
  return (
    <Modal title={list ? tr('cues.list.props') : tr('cues.list.create')} onClose={onClose} footer={<><button className="btn" onClick={onClose}>{tr('common.cancel')}</button><button className="btn primary" onClick={() => void save()}>{tr('common.validate')}</button></>}>
      <div className="grid g2">
        <Field label={tr('cues.list.name')}><input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label={tr('cues.list.priority')} hint={tr('cues.list.priorityHint')}><NumberInput value={priority} min={1} max={99} onChange={setPriority} /></Field>
        <label className="check"><input type="checkbox" checked={loop} onChange={(e) => setLoop(e.target.checked)} />{tr('cues.list.loop')}</label>
      </div>
    </Modal>
  );
}

export function Cues() {
  const tr = useT();
  const project = useStore((s) => s.project!.project);
  const listId = useStore((s) => s.cueListId);
  const setCueList = useStore((s) => s.setCueList);
  const rt = useStore((s) => s.runtime);
  const [dialog, setDialog] = useState<{ list?: CueList } | null>(null);
  const list = project.cueLists.find((l) => l.id === listId);
  const pb = rt?.engine.playbacks.find((p) => p.cueListId === listId);
  const running = !!pb && pb.state !== 'idle';
  const save = (cues: Cue[]) => list && void act({ type: 'cueList.upsert', cueList: { ...list, cues } });
  const update = (i: number, patch: Partial<Cue>) => list && save(list.cues.map((c, k) => (k === i ? { ...c, ...patch } : c)));
  const addCue = () => {
    if (!list) return;
    const last = list.cues.at(-1);
    save([...list.cues, { id: newId(), number: Math.floor(last?.number ?? 0) + 1, name: tr('cues.defaultName', { n: list.cues.length + 1 }), description: '', sceneId: project.scenes[0]?.id ?? null, fade: 2, delay: 0, curve: 'linear', trigger: { type: 'manual' }, effectIds: [] }]);
  };
  const move = (i: number, d: -1 | 1) => {
    if (!list || !list.cues[i + d]) return;
    const cues = [...list.cues];
    [cues[i], cues[i + d]] = [cues[i + d]!, cues[i]!];
    save(cues.map((c, k) => ({ ...c, number: k + 1 })));
  };
  const nextName = list && (pb?.nextIndex !== null && pb?.nextIndex !== undefined ? list.cues[pb.nextIndex]?.name : list.cues[0]?.name);

  return (
    <div className="page">
      <PageHead title={tr('cues.title')} subtitle={tr('cues.subtitle')}>
        <select className="select" style={{ width: 220 }} value={listId ?? ''} onChange={(e) => setCueList(e.target.value || null)} aria-label={tr('cues.listSelect')}>
          {project.cueLists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
        {list && <button className="btn" onClick={() => setDialog({ list })}>{tr('cues.properties')}</button>}
        {list && <button className="btn danger icon" title={tr('cues.removeList')} onClick={async () => (await confirmAction({ title: tr('cues.removeList'), message: tr('cues.removeListMsg', { name: list.name, n: list.cues.length }), confirmLabel: tr('common.delete') })) && void act({ type: 'cueList.remove', id: list.id })}><Trash2 size={14} /></button>}
        <button className="btn" onClick={() => setDialog({})}><Plus size={14} />{tr('cues.newList')}</button>
      </PageHead>
      {!list ? (
        <Empty icon={<ListOrdered size={32} />} title={tr('cues.noList')} action={<button className="btn primary" onClick={() => setDialog({})}>{tr('cues.createList')}</button>} />
      ) : (
        <div className="col gap-lg">
          <Panel>
            <div className="row gap-lg">
              <button className="btn go-btn" data-testid="go" onClick={() => void act({ type: 'cue.go', listId: list.id })} disabled={!list.cues.length} title={tr('cues.goTitle')}>GO</button>
              <button className="btn lg" onClick={() => void act({ type: 'cue.back', listId: list.id })} title={tr('cues.backTitle')}><SkipBack size={16} />{tr('cues.back')}</button>
              {pb?.state === 'paused' ? (
                <button className="btn lg accent" onClick={() => void act({ type: 'cue.resume', listId: list.id })} title={tr('cues.resumeTitle')}><Play size={16} />{tr('cues.resume')}</button>
              ) : (
                <button className="btn lg" onClick={() => void act({ type: 'cue.pause', listId: list.id })} disabled={!running} title={tr('cues.pauseTitle')}><Pause size={16} />{tr('cues.pause')}</button>
              )}
              <button className="btn lg danger" onClick={() => void act({ type: 'cue.stop', listId: list.id })} disabled={!running} title={tr('cues.stopTitle')}><Square size={16} />{tr('cues.stop')}</button>
              <div className="col grow" style={{ gap: 4 }}>
                <div className="row between">
                  <span className="row" data-testid="cue-state">
                    <span className={`badge ${STATE_BADGE[pb?.state ?? 'idle']}`}>{tr(`cues.state.${pb?.state ?? 'idle'}`)}</span>
                    {running && <b className="cue-now">{pb.cueName}</b>}
                  </span>
                  <span className="mono muted">{running ? tr('cues.remaining', { s: pb.remaining.toFixed(1) }) : ''}</span>
                </div>
                <div className="progress"><div style={{ width: `${(pb?.progress ?? 0) * 100}%` }} /></div>
                <span className="small dim">{tr('cues.next', { name: nextName ?? '–' })} · {tr('cues.priority', { n: list.priority })}{list.loop ? ` · ${tr('cues.loop')}` : ''}</span>
              </div>
            </div>
          </Panel>
          <Panel flush title={tr('cues.count', { n: list.cues.length })} actions={<button className="btn sm primary" onClick={addCue} disabled={!project.scenes.length} title={project.scenes.length ? '' : tr('cues.needScene')}><Plus size={13} />{tr('cues.add')}</button>}>
            {list.cues.length === 0 ? <Empty title={tr('cues.empty')}>{project.scenes.length ? tr('cues.emptyHint') : tr('cues.emptyNoScene')}</Empty> : (
              <table className="table" data-testid="cue-table">
                <thead><tr><th>{tr('cues.col.number')}</th><th>{tr('cues.col.name')}</th><th>{tr('cues.col.scene')}</th><th>{tr('cues.col.fade')}</th><th>{tr('cues.col.delay')}</th><th>{tr('cues.col.curve')}</th><th>{tr('cues.col.trigger')}</th><th>{tr('cues.col.effects')}</th><th /></tr></thead>
                <tbody>
                  {list.cues.map((c, i) => {
                    const current = running && pb.index === i;
                    const next = pb?.nextIndex === i;
                    return (
                    <tr key={c.id} className={`${current ? 'active' : ''} ${next ? 'next' : ''}`} aria-current={current ? 'step' : undefined}>
                      <td className="mono cue-num">
                        {current ? <Play size={11} className="cue-mark now" aria-label={tr('cues.current')} /> : next ? <ChevronRight size={12} className="cue-mark" aria-label={tr('cues.nextMark')} /> : null}
                        {c.number}
                      </td>
                      <td><input className="input" defaultValue={c.name} key={c.name} onBlur={(e) => e.target.value.trim() && e.target.value !== c.name && update(i, { name: e.target.value.trim() })} /></td>
                      <td>
                        <select className="select" value={c.sceneId ?? ''} onChange={(e) => update(i, { sceneId: e.target.value || null })}>
                          <option value="">{tr('cues.sceneNone')}</option>
                          {project.scenes.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                      </td>
                      <td style={{ width: 80 }}><NumberInput value={c.fade} min={0} max={600} step={0.1} onChange={(v) => update(i, { fade: v })} /></td>
                      <td style={{ width: 80 }}><NumberInput value={c.delay} min={0} max={600} step={0.1} onChange={(v) => update(i, { delay: v })} /></td>
                      <td>
                        <select className="select" value={c.curve} onChange={(e) => update(i, { curve: e.target.value as Cue['curve'] })}>
                          {CURVES.map((k) => <option key={k} value={k}>{tr(`cues.curve.${k}`)}</option>)}
                        </select>
                      </td>
                      <td>
                        <div className="row">
                          <select className="select" style={{ width: 96 }} value={c.trigger.type} onChange={(e) => update(i, { trigger: e.target.value === 'follow' ? { type: 'follow', wait: 0 } : { type: 'manual' } })}>
                            <option value="manual">{tr('cues.trigger.manual')}</option><option value="follow">{tr('cues.trigger.follow')}</option>
                          </select>
                          {c.trigger.type === 'follow' && <div style={{ width: 70 }} title={tr('cues.followWait')}><NumberInput value={c.trigger.wait} min={0} max={3600} step={0.1} onChange={(v) => update(i, { trigger: { type: 'follow', wait: v } })} /></div>}
                        </div>
                      </td>
                      <td>
                        <select className="select" multiple style={{ height: 46, minWidth: 120 }} value={c.effectIds} onChange={(e) => update(i, { effectIds: [...e.target.selectedOptions].map((o) => o.value) })} title={tr('cues.effectsTitle')}>
                          {project.effects.map((fx) => <option key={fx.id} value={fx.id}>{fx.name}</option>)}
                        </select>
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <button className="btn ghost sm" onClick={() => void act({ type: 'cue.goto', listId: list.id, index: i })} title={tr('cues.gotoTitle')}>{tr('cues.goto')}</button>
                        <button className="btn ghost sm icon" disabled={i === 0} onClick={() => move(i, -1)} title={tr('cues.up')}><ArrowUp size={12} /></button>
                        <button className="btn ghost sm icon" disabled={i === list.cues.length - 1} onClick={() => move(i, 1)} title={tr('cues.down')}><ArrowDown size={12} /></button>
                        <button className="btn ghost sm icon" onClick={async () => (await confirmAction({ title: tr('cues.removeCue'), message: tr('cues.removeCueMsg', { name: c.name }), confirmLabel: tr('common.delete') })) && save(list.cues.filter((_, k) => k !== i))} title={tr('common.delete')}><Trash2 size={12} /></button>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </Panel>
        </div>
      )}
      {dialog && <ListDialog list={dialog.list} onClose={() => setDialog(null)} />}
    </div>
  );
}
