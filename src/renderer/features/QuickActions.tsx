import { useRef, useState } from 'react';
import { Download, Pencil, Plus, Upload, X, Zap } from 'lucide-react';
import { useStore } from '../store';
import { useT } from '../i18n';
import { act, newId } from '../api';
import { Empty, Field, Modal, PageHead } from '../components/ui';
import { attributeClass } from '../../core/fixtures/attributes';
import type { RuntimeState } from '../../shared/commands';
import { moveQuickAction, parseQuickActions, quickActionSchema, type QuickAction } from '../../core/quick/quickActions';

const KINDS = ['color', 'effect', 'cue', 'scene', 'palette'] as const;
const STORAGE_KEY = 'luma.quickActions';

// shortcut: actions live in this browser profile (localStorage), not in the project file; move them into the project schema if they must travel with the show file.
function loadActions(): QuickAction[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    return Array.isArray(raw) ? raw.flatMap((x) => { const r = quickActionSchema.safeParse(x); return r.success ? [r.data] : []; }) : [];
  } catch {
    return [];
  }
}

const FAMILY = { color: ['color'], position: ['position'], intensity: ['intensity'], beam: ['beam', 'special'] } as const;

/** Effects and cues are live in the engine; colours, palettes and scenes live in the programmer, so they are remembered by the page (`armed`). */
function isActive(a: QuickAction, rt: RuntimeState | null, armed: ReadonlySet<string>): boolean {
  if (!rt) return false;
  if (a.kind === 'effect') return rt.engine.effects.some((e) => e.effectId === a.ref && e.owner === 'manual');
  if (a.kind === 'cue') return rt.engine.playbacks.some((pb) => pb.cueListId === a.ref && pb.state !== 'idle' && (a.index === undefined || pb.index === a.index));
  return armed.has(a.id) && rt.engine.programmerCount > 0;
}

/** Releases the programmer attributes of the given classes on `ids` (nothing else the user set). */
async function releaseFamily(ids: string[], classes: readonly string[]): Promise<void> {
  const prog = useStore.getState().runtime?.programmer ?? {};
  const attributes = [...new Set(ids.flatMap((id) => Object.keys(prog[id] ?? {})))].filter((attr) => classes.includes(attributeClass(attr)));
  if (attributes.length) await act({ type: 'programmer.release', fixtureIds: ids, attributes });
}

/**
 * Click on a tile: switches the action on, or off when it is already active. Acts on the selection (every fixture when nothing is selected).
 * Resolves to the new on/off state of programmer-based actions (color, palette, scene), undefined when nothing changed or for live ones.
 */
async function toggle(a: QuickAction, active: boolean, missing: string): Promise<boolean | undefined> {
  const st = useStore.getState();
  const p = st.project?.project;
  if (!p) return undefined;
  const ids = (st.selection.length ? st.selection : p.patch.map((f) => f.id)).slice(0, 1024);
  if (a.kind === 'color') {
    if (active) { await releaseFamily(ids, FAMILY.color); return false; }
    return ids.length && (await act({ type: 'programmer.setColor', fixtureIds: ids, color: a.color })) ? true : undefined;
  }
  const known = { effect: p.effects, scene: p.scenes, palette: p.palettes, cue: p.cueLists }[a.kind];
  if (!known.some((x) => x.id === a.ref)) { st.toast({ kind: 'error', title: missing, detail: a.name }); return undefined; }
  if (a.kind === 'effect') {
    if (!active) await act({ type: 'effect.start', id: a.ref });
    else for (const e of st.runtime?.engine.effects ?? []) if (e.effectId === a.ref && e.owner === 'manual') await act({ type: 'effect.stop', instanceId: e.instanceId });
  } else if (a.kind === 'cue') {
    if (active) await act({ type: 'cue.stop', listId: a.ref });
    else await act(a.index === undefined ? { type: 'cue.go', listId: a.ref } : { type: 'cue.goto', listId: a.ref, index: a.index });
  } else if (a.kind === 'scene') {
    const values = p.scenes.find((s) => s.id === a.ref)!.values;
    if (!active) return (await act({ type: 'scene.load', id: a.ref })) ? true : undefined;
    await act({ type: 'programmer.release', fixtureIds: Object.keys(values), attributes: [...new Set(Object.values(values).flatMap((v) => Object.keys(v)))] });
    return false;
  } else {
    const kind = p.palettes.find((x) => x.id === a.ref)!.kind;
    if (active) { await releaseFamily(ids, FAMILY[kind]); return false; }
    return ids.length && (await act({ type: 'palette.apply', id: a.ref, fixtureIds: ids })) ? true : undefined;
  }
  return undefined;
}

/** Creates an action, or edits `initial` (same id, so its tile keeps its place). */
function ActionDialog({ initial, categories, onSave, onClose }: { initial?: QuickAction; categories: string[]; onSave: (a: QuickAction) => void; onClose: () => void }) {
  const tr = useT();
  const p = useStore((s) => s.project!.project);
  const [kind, setKind] = useState<(typeof KINDS)[number]>(initial?.kind ?? 'color');
  const [category, setCategory] = useState(initial ? initial.category ?? '' : categories[categories.length - 1] ?? '');
  const [name, setName] = useState(initial?.name ?? '');
  const [color, setColor] = useState(initial?.kind === 'color' ? initial.color : '#FF0000');
  const [ref, setRef] = useState(initial && initial.kind !== 'color' ? initial.ref : '');
  const [index, setIndex] = useState(initial?.kind === 'cue' && initial.index !== undefined ? String(initial.index) : '');
  const options = kind === 'effect' ? p.effects : kind === 'scene' ? p.scenes : kind === 'palette' ? p.palettes : kind === 'cue' ? p.cueLists : [];
  const chosen = options.find((o) => o.id === ref) ?? options[0];
  const submit = () => {
    const label = name.trim() || chosen?.name || color;
    const a = kind === 'color' ? { kind, color } : chosen ? { kind, ref: chosen.id, ...(kind === 'cue' && index !== '' ? { index: Number(index) } : {}) } : null;
    const parsed = a && quickActionSchema.safeParse({ id: initial?.id ?? newId(), name: label, ...(category.trim() ? { category } : {}), ...a });
    if (parsed?.success) { onSave(parsed.data); onClose(); }
  };
  return (
    <Modal title={tr(initial ? 'quick.editTitle' : 'quick.add')} onClose={onClose} footer={<><button className="btn" onClick={onClose}>{tr('common.cancel')}</button><button className="btn primary" disabled={kind !== 'color' && !chosen} onClick={submit}>{tr(initial ? 'quick.save' : 'common.create')}</button></>}>
      <Field label={tr('quick.kind')}>
        <select className="input" value={kind} onChange={(e) => { setKind(e.target.value as typeof kind); setRef(''); }}>
          {KINDS.map((k) => <option key={k} value={k}>{tr(`quick.kind.${k}`)}</option>)}
        </select>
      </Field>
      <Field label={tr('quick.category')} hint={tr('quick.categoryHint')}>
        <input className="input" list="quick-categories" maxLength={40} value={category} onChange={(e) => setCategory(e.target.value)} />
        <datalist id="quick-categories">{categories.map((c) => <option key={c} value={c} />)}</datalist>
      </Field>
      <Field label={tr('quick.name')}><input className="input" value={name} placeholder={chosen?.name ?? ''} onChange={(e) => setName(e.target.value)} /></Field>
      {kind === 'color' ? (
        <Field label={tr('quick.color')}><input type="color" value={color} onChange={(e) => setColor(e.target.value)} /></Field>
      ) : (
        <Field label={tr(`quick.kind.${kind}`)} error={options.length ? null : tr('quick.noneInProject')}>
          <select className="input" value={chosen?.id ?? ''} onChange={(e) => setRef(e.target.value)}>
            {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </Field>
      )}
      {kind === 'cue' && <Field label={tr('quick.cueIndex')} hint={tr('quick.cueIndexHint')}><input className="input" type="number" min={1} value={index === '' ? '' : Number(index) + 1} onChange={(e) => setIndex(e.target.value === '' ? '' : String(Math.max(0, Number(e.target.value) - 1)))} /></Field>}
    </Modal>
  );
}

export function QuickActionsPage() {
  const tr = useT();
  const [actions, setActions] = useState(loadActions);
  const [dialog, setDialog] = useState(null as QuickAction | 'new' | null);
  const [editing, setEditing] = useState(false);
  const [dragId, setDragId] = useState(''); // '' = nothing being dragged
  const [armed, setArmed] = useState(new Set<string>());
  const rt = useStore((s) => s.runtime);
  const click = async (a: QuickAction) => {
    // Within a category only one action stays on: switching to another one first turns the active one(s) off.
    const others = isActive(a, rt, armed) ? [] : actions.filter((o) => o.id !== a.id && o.category === a.category && isActive(o, rt, armed));
    for (const o of others) await toggle(o, true, tr('quick.missing'));
    const on = await toggle(a, isActive(a, rt, armed), tr('quick.missing'));
    setArmed((cur) => {
      const next = new Set(cur);
      others.forEach((o) => next.delete(o.id));
      if (on === undefined) return next;
      if (on && a.kind === 'color') actions.forEach((x) => x.kind === 'color' && next.delete(x.id)); // one colour at a time
      if (on) next.add(a.id); else next.delete(a.id);
      return next;
    });
  };
  const file = useRef<HTMLInputElement>(null);
  // Sections follow the array order: a category sits where its first action sits.
  const categories = [...new Set(actions.map((a) => a.category ?? ''))];
  const drop = (e: React.DragEvent, category: string, beforeId?: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (dragId) update(moveQuickAction(actions, dragId, category || undefined, beforeId));
    setDragId('');
  };
  const toast = useStore.getState().toast;
  const update = (next: QuickAction[]) => {
    setActions(next);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { toast({ kind: 'warn', title: tr('quick.notSaved') }); }
  };
  const save = (a: QuickAction) => {
    const old = actions.find((x) => x.id === a.id);
    if (!old) return update([...actions, a]);
    const next = actions.map((x) => (x.id === a.id ? a : x));
    update(old.category === a.category ? next : moveQuickAction(next, a.id, a.category));
  };
  const importFile = async (f: File | undefined) => {
    if (!f) return;
    const r = parseQuickActions(await f.text(), actions, newId);
    if (!r.actions.length) { toast({ kind: 'error', title: tr('quick.importNone') }); return; }
    update([...actions, ...r.actions]);
    toast({ kind: 'success', title: tr('quick.imported', { n: r.actions.length }), ...(r.skipped ? { detail: tr('quick.skipped', { n: r.skipped }) } : {}) });
  };
  const exportFile = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify({ actions }, null, 2)], { type: 'application/json' }));
    a.download = 'quick-actions.json';
    a.click();
    URL.revokeObjectURL(a.href);
  };
  return (
    <div className="page">
      <PageHead title={tr('quick.title')} subtitle={tr('quick.subtitle')}>
        <button className={`btn ${editing ? 'primary' : ''}`} disabled={!actions.length} onClick={() => setEditing(!editing)}><Pencil size={14} />{tr('quick.edit')}</button>
        <button className="btn" onClick={() => file.current?.click()}><Upload size={14} />{tr('quick.import')}</button>
        <button className="btn" disabled={!actions.length} onClick={exportFile}><Download size={14} />{tr('quick.export')}</button>
        <button className="btn primary" onClick={() => setDialog('new')}><Plus size={14} />{tr('quick.add')}</button>
        <input ref={file} type="file" accept=".json,application/json" hidden onChange={(e) => { void importFile(e.target.files?.[0]); e.target.value = ''; }} />
      </PageHead>
      {actions.length === 0 ? (
        <Empty icon={<Zap size={32} />} title={tr('quick.empty')}>{tr('quick.emptyHint')}</Empty>
      ) : (
        <div className="col gap-lg" title={tr('quick.dragHint')}>
          {categories.map((cat) => (
            <section key={cat} onDragOver={(e) => dragId && e.preventDefault()} onDrop={(e) => drop(e, cat)} style={{ outline: dragId ? '1px dashed var(--border, #555)' : undefined, borderRadius: 8, padding: 6 }}>
              <h3 style={{ margin: '0 0 8px' }}>{cat || tr('quick.uncategorized')}</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
                {actions.filter((a) => (a.category ?? '') === cat).map((a) => (
                  <div key={a.id} draggable onDragStart={() => setDragId(a.id)} onDragEnd={() => setDragId('')} onDragOver={(e) => dragId && e.preventDefault()} onDrop={(e) => drop(e, cat, a.id)} style={{ position: 'relative', opacity: dragId === a.id ? 0.4 : 1, cursor: 'grab' }}>
                    <button className="btn lg" aria-pressed={isActive(a, rt, armed)} style={{ width: '100%', minHeight: 72, flexDirection: 'column', ...(a.kind === 'color' ? { background: a.color, color: '#000', textShadow: '0 0 3px #fff' } : {}), ...(isActive(a, rt, armed) ? { boxShadow: '0 0 0 3px #22d3ee, 0 0 14px #22d3ee' } : {}) }} title={editing ? tr('quick.editHint') : undefined} onClick={() => (editing ? setDialog(a) : void click(a))}>
                      <b>{a.name}</b><span className="small">{tr(`quick.kind.${a.kind}`)}</span>
                    </button>
                    {editing && <button className="btn danger sm icon" style={{ position: 'absolute', top: 4, right: 4 }} aria-label={tr('common.delete')} onClick={() => update(actions.filter((x) => x.id !== a.id))}><X size={12} /></button>}
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
      {dialog && <ActionDialog key={dialog === 'new' ? 'new' : dialog.id} initial={dialog === 'new' ? undefined : dialog} categories={categories.filter(Boolean)} onSave={save} onClose={() => setDialog(null)} />}
    </div>
  );
}
