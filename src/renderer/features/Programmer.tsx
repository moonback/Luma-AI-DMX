import { useState } from 'react';
import { ArrowDown, ArrowUp, Copy, Eye, Palette as PaletteIcon, Pencil, Plus, Trash2, Upload } from 'lucide-react';
import { useStore, confirmAction } from '../store';
import { useT } from '../i18n';
import { act, newId } from '../api';
import { Empty, Field, Modal, PageHead, Panel, useResolved } from '../components/ui';
import type { Group, Palette, Scene } from '../../core/model/schemas';

function NameDialog({ title, initial, onSubmit, onClose, children }: { title: string; initial: string; onSubmit: (name: string) => void; onClose: () => void; children?: React.ReactNode }) {
  const tr = useT();
  const [name, setName] = useState(initial);
  const ok = () => { if (name.trim()) { onSubmit(name.trim()); onClose(); } };
  return (
    <Modal title={title} onClose={onClose} footer={<><button className="btn" onClick={onClose}>{tr('common.cancel')}</button><button className="btn primary" onClick={ok}>{tr('prog.validate')}</button></>}>
      <div className="col">
        <Field label={tr('prog.name')}><input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && ok()} /></Field>
        {children}
      </div>
    </Modal>
  );
}

function Groups() {
  const tr = useT();
  const groups = useStore((s) => s.project!.project.groups);
  const selection = useStore((s) => s.selection);
  const setSelection = useStore((s) => s.setSelection);
  const [dialog, setDialog] = useState<{ group?: Group } | null>(null);
  const move = (i: number, d: -1 | 1) => {
    const ids = groups.map((g) => g.id);
    [ids[i], ids[i + d]] = [ids[i + d]!, ids[i]!];
    void act({ type: 'group.reorder', ids });
  };
  return (
    <Panel title={tr('prog.groups')} actions={<button className="btn sm primary" disabled={!selection.length} title={selection.length ? tr('prog.fromSelectionHint') : tr('prog.needSelection')} onClick={() => setDialog({})}><Plus size={13} />{tr('prog.fromSelection')}</button>}>
      {groups.length === 0 ? <p className="muted" style={{ margin: 0 }}>{tr('prog.noGroups')}</p> : (
        <table className="table">
          <tbody>
            {groups.map((g, i) => {
              const inSel = g.fixtureIds.filter((id) => selection.includes(id)).length;
              const exact = inSel > 0 && inSel === g.fixtureIds.length && inSel === selection.length;
              return (
                <tr key={g.id} className={exact ? 'sel' : ''}>
                  <td style={{ width: 14 }}><span className="led" style={{ background: g.color }} /></td>
                  <td className="pick" title={tr('prog.selectHint')} onClick={() => setSelection(g.fixtureIds)}>{g.name}</td>
                  <td className="small">
                    {exact ? <span className="badge violet">{tr('prog.groupSelected')}</span>
                      : inSel > 0 ? <span className="badge cyan">{tr('prog.groupPartial', { sel: inSel, n: g.fixtureIds.length })}</span>
                      : <span className="muted">{tr('prog.groupCount', { n: g.fixtureIds.length })}</span>}
                  </td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {!exact && <button className="btn ghost sm" onClick={() => setSelection(g.fixtureIds)}>{tr('prog.select')}</button>}
                    <button className="btn ghost sm icon" title={tr('prog.replace')} aria-label={tr('prog.replace')} disabled={!selection.length} onClick={() => void act({ type: 'group.upsert', group: { ...g, fixtureIds: selection } })}><Upload size={12} /></button>
                    <button className="btn ghost sm icon" title={tr('prog.renameColor')} aria-label={tr('prog.renameColor')} onClick={() => setDialog({ group: g })}><Pencil size={12} /></button>
                    <button className="btn ghost sm icon" title={tr('prog.up')} aria-label={tr('prog.up')} disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp size={12} /></button>
                    <button className="btn ghost sm icon" title={tr('prog.down')} aria-label={tr('prog.down')} disabled={i === groups.length - 1} onClick={() => move(i, 1)}><ArrowDown size={12} /></button>
                    <button className="btn ghost sm icon" title={tr('prog.duplicate')} aria-label={tr('prog.duplicate')} onClick={() => void act({ type: 'group.upsert', group: { ...g, id: newId(), name: tr('prog.copySuffix', { name: g.name }).slice(0, 80) } })}><Copy size={12} /></button>
                    <button className="btn ghost sm icon" title={tr('prog.remove')} aria-label={tr('prog.remove')} onClick={async () => (await confirmAction({ title: tr('prog.removeGroup'), message: tr('prog.removeGroupMsg', { name: g.name }), confirmLabel: tr('prog.remove') })) && void act({ type: 'group.remove', id: g.id })}><Trash2 size={12} /></button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {dialog && <GroupDialog group={dialog.group} onClose={() => setDialog(null)} />}
    </Panel>
  );
}

function GroupDialog({ group, onClose }: { group?: Group; onClose: () => void }) {
  const tr = useT();
  const selection = useStore((s) => s.selection);
  const [color, setColor] = useState(group?.color ?? '#8B5CF6');
  return (
    <NameDialog title={group ? tr('prog.editGroup') : tr('prog.newGroup')} initial={group?.name ?? tr('console.group.defaultName', { n: selection.length })} onClose={onClose}
      onSubmit={(name) => void act({ type: 'group.upsert', group: { id: group?.id ?? newId(), name, color: color.toUpperCase(), fixtureIds: group?.fixtureIds ?? selection } })}>
      <Field label={tr('prog.groupColor')}><input type="color" value={color} onChange={(e) => setColor(e.target.value)} /></Field>
    </NameDialog>
  );
}

function Palettes() {
  const tr = useT();
  const palettes = useStore((s) => s.project!.project.palettes);
  const selection = useStore((s) => s.selection);
  const [creating, setCreating] = useState<null | 'color' | 'record'>(null);
  const [kind, setKind] = useState<Palette['kind']>('position');
  const [color, setColor] = useState('#8B00FF');
  return (
    <Panel title={tr('prog.palettes')} actions={<>
      <button className="btn sm" onClick={() => setCreating('color')}><PaletteIcon size={13} />{tr('prog.palColor')}</button>
      <button className="btn sm" disabled={!selection.length} title={tr('prog.palFromProgHint')} onClick={() => setCreating('record')}><Plus size={13} />{tr('prog.palFromProg')}</button>
    </>}>
      {palettes.length === 0 ? <p className="muted" style={{ margin: 0 }}>{tr('prog.palEmpty')}</p> : (
        <table className="table">
          <tbody>
            {palettes.map((p) => (
              <tr key={p.id}>
                <td style={{ width: 14 }}>{p.color ? <span className="led" style={{ background: p.color }} /> : null}</td>
                <td>{p.name}</td>
                <td><span className="badge">{tr(`prog.kind.${p.kind}`)}</span></td>
                <td style={{ textAlign: 'right' }}>
                  <button className="btn ghost sm" disabled={!selection.length} onClick={() => void act({ type: 'palette.apply', id: p.id, fixtureIds: selection })}>{tr('prog.apply')}</button>
                  <button className="btn ghost sm icon" title={tr('prog.duplicate')} aria-label={tr('prog.duplicate')} onClick={() => void act({ type: 'palette.upsert', palette: { ...p, id: newId(), name: tr('prog.copySuffix', { name: p.name }).slice(0, 80) } })}><Copy size={12} /></button>
                  <button className="btn ghost sm icon" title={tr('prog.remove')} aria-label={tr('prog.remove')} onClick={async () => (await confirmAction({ title: tr('prog.removePalette'), message: tr('prog.removeMsg', { name: p.name }), confirmLabel: tr('prog.remove') })) && void act({ type: 'palette.remove', id: p.id })}><Trash2 size={12} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {creating === 'color' && (
        <NameDialog title={tr('prog.newColorPalette')} initial={tr('prog.palColor')} onClose={() => setCreating(null)} onSubmit={(name) => void act({ type: 'palette.upsert', palette: { id: newId(), name, kind: 'color', color: color.toUpperCase(), values: {} } })}>
          <Field label={tr('prog.palColor')}><input type="color" value={color} onChange={(e) => setColor(e.target.value)} /></Field>
        </NameDialog>
      )}
      {creating === 'record' && (
        <NameDialog title={tr('prog.palFromProgTitle')} initial={tr('prog.palDefault')} onClose={() => setCreating(null)} onSubmit={(name) => void act({ type: 'palette.recordFromProgrammer', name, kind, fixtureId: selection[0]! })}>
          <Field label={tr('prog.palType')} hint={tr('prog.palTypeHint')}>
            <select className="select" value={kind} onChange={(e) => setKind(e.target.value as Palette['kind'])}>
              {(['position', 'intensity', 'beam', 'color'] as const).map((k) => <option key={k} value={k}>{tr(`prog.opt.${k}`)}</option>)}
            </select>
          </Field>
        </NameDialog>
      )}
    </Panel>
  );
}

export function SceneList() {
  const tr = useT();
  const scenes = useStore((s) => s.project!.project.scenes);
  const { byId } = useResolved();
  const setPreview = useStore((s) => s.setPreview);
  const [renaming, setRenaming] = useState<Scene | null>(null);
  const preview = async (s: Scene) => {
    const r = await act({ type: 'scene.preview', id: s.id });
    if (r) {
      setPreview({ label: s.id, title: tr('prog.previewLabel', { name: s.name }), values: r.values });
      useStore.getState().setPage('visualizer');
    }
  };
  return (
    <Panel title={tr('prog.scenes')} flush>
      {scenes.length === 0 ? (
        <Empty title={tr('prog.noScenes')}>{tr('prog.noScenesHint')}</Empty>
      ) : (
        <table className="table">
          <thead><tr><th>{tr('prog.name')}</th><th>{tr('prog.col.fixtures')}</th><th>{tr('prog.col.origin')}</th><th /></tr></thead>
          <tbody>
            {scenes.map((s) => (
              <tr key={s.id}>
                <td>{s.name}</td>
                <td className="muted small">{Object.keys(s.values).map((id) => byId.get(id)?.fixture.name ?? '?').slice(0, 4).join(', ')}{Object.keys(s.values).length > 4 ? '…' : ''}</td>
                <td>{s.origin === 'ai' ? <span className="badge violet">{tr('prog.originAi')}</span> : <span className="badge">{tr('prog.originManual')}</span>}</td>
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <button className="btn ghost sm" title={tr('prog.previewHint')} onClick={() => void preview(s)}><Eye size={12} />{tr('prog.preview')}</button>
                  <button className="btn ghost sm" title={tr('prog.loadHint')} onClick={() => void act({ type: 'scene.load', id: s.id })}>{tr('prog.load')}</button>
                  <button className="btn ghost sm icon" title={tr('prog.rename')} aria-label={tr('prog.rename')} onClick={() => setRenaming(s)}><Pencil size={12} /></button>
                  <button className="btn ghost sm icon" title={tr('prog.duplicate')} aria-label={tr('prog.duplicate')} onClick={() => void act({ type: 'scene.duplicate', id: s.id })}><Copy size={12} /></button>
                  <button className="btn ghost sm icon" title={tr('prog.remove')} aria-label={tr('prog.remove')} onClick={async () => (await confirmAction({ title: tr('prog.removeScene'), message: tr('prog.removeSceneMsg', { name: s.name }), confirmLabel: tr('prog.remove') })) && void act({ type: 'scene.remove', id: s.id })}><Trash2 size={12} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {renaming && <NameDialog title={tr('prog.renameScene')} initial={renaming.name} onClose={() => setRenaming(null)} onSubmit={(name) => void act({ type: 'scene.upsert', scene: { ...renaming, name } })} />}
    </Panel>
  );
}

export function Programmer() {
  const tr = useT();
  return (
    <div className="page">
      <PageHead title={tr('prog.title')} subtitle={tr('prog.subtitle')} />
      <div className="grid g2" style={{ alignItems: 'start' }}>
        <div className="col gap-lg"><Groups /><Palettes /></div>
        <SceneList />
      </div>
    </div>
  );
}
