import { useRef, useState } from 'react';
import { Download, GripVertical, HelpCircle, LayoutGrid, Pencil, Plus, Search, Upload, Users, X, Zap } from 'lucide-react';
import { useStore } from '../store';
import { useT } from '../i18n';
import { act, newId } from '../api';
import { Empty, Field, Modal, PageHead } from '../components/ui';
import { attributeClass } from '../../core/fixtures/attributes';
import type { RuntimeState } from '../../shared/commands';
import { moveCategoryBefore, moveQuickAction, parseQuickActions, quickActionSchema, renameCategory, type QuickAction } from '../../core/quick/quickActions';

const KINDS = ['color', 'effect', 'cue', 'scene', 'palette'] as const;
const STORAGE_KEY = 'luma.quickActions';
const SIZE_KEY = 'luma.quickActionsSize';
type TileSize = 'sm' | 'md' | 'lg';

function loadActions(): QuickAction[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    return Array.isArray(raw) ? raw.flatMap((x) => { const r = quickActionSchema.safeParse(x); return r.success ? [r.data] : []; }) : [];
  } catch { return []; }
}

function loadSize(): TileSize {
  const v = localStorage.getItem(SIZE_KEY);
  return (v === 'sm' || v === 'md' || v === 'lg') ? v : 'md';
}

const FAMILY = { color: ['color'], position: ['position'], intensity: ['intensity'], beam: ['beam', 'special'] } as const;

// Badge color per action kind
const KIND_BADGE: Record<string, string> = {
  color:   'transparent',
  effect:  '#7c3aed',
  cue:     '#0891b2',
  scene:   '#059669',
  palette: '#d97706',
};

function isActive(a: QuickAction, rt: RuntimeState | null, armed: ReadonlySet<string>): boolean {
  if (!rt) return false;
  if (a.kind === 'effect') return rt.engine.effects.some((e) => e.effectId === a.ref && e.owner === 'manual');
  if (a.kind === 'cue') return rt.engine.playbacks.some((pb) => pb.cueListId === a.ref && pb.state !== 'idle' && (a.index === undefined || pb.index === a.index));
  return armed.has(a.id) && rt.engine.programmerCount > 0;
}

async function releaseFamily(ids: string[], classes: readonly string[]): Promise<void> {
  const prog = useStore.getState().runtime?.programmer ?? {};
  const attributes = [...new Set(ids.flatMap((id) => Object.keys(prog[id] ?? {})))].filter((attr) => classes.includes(attributeClass(attr)));
  if (attributes.length) await act({ type: 'programmer.release', fixtureIds: ids, attributes });
}

/** Resolves the fixture IDs an action should target. Priority: action groupIds → action fixtureIds → global selection → all. */
function resolveTargets(a: QuickAction): string[] {
  const st = useStore.getState();
  const p = st.project?.project;
  if (!p) return [];
  if (a.groupIds?.length) {
    const ids = [...new Set(a.groupIds.flatMap((gid) => p.groups.find((g) => g.id === gid)?.fixtureIds ?? []))];
    return ids.slice(0, 1024);
  }
  if (a.fixtureIds?.length) return a.fixtureIds.slice(0, 1024);
  return (st.selection.length ? st.selection : p.patch.map((f) => f.id)).slice(0, 1024);
}

async function toggle(a: QuickAction, active: boolean, missing: string): Promise<boolean | undefined> {
  const st = useStore.getState();
  const p = st.project?.project;
  if (!p) return undefined;
  const ids = resolveTargets(a);
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

// ── Tile size config ─────────────────────────────────────────────────────────
const TILE_CFG: Record<TileSize, { minW: number; minH: number; fontSize: string }> = {
  sm: { minW: 90,  minH: 52, fontSize: '0.78rem' },
  md: { minW: 130, minH: 72, fontSize: '0.88rem' },
  lg: { minW: 170, minH: 92, fontSize: '1rem' },
};

const TILE_SIZES: { key: TileSize; label: string }[] = [
  { key: 'sm', label: 'S' },
  { key: 'md', label: 'M' },
  { key: 'lg', label: 'L' },
];

// ── Action Tile ──────────────────────────────────────────────────────────────
function ActionTile({
  a, active, editing, size, dragKey,
  onDragStart, onDragEnd, onDrop, onClick, onDelete,
}: {
  a: QuickAction; active: boolean; editing: boolean; size: TileSize; dragKey: string;
  onDragStart(): void; onDragEnd(): void; onDrop(e: React.DragEvent): void;
  onClick(): void; onDelete(): void;
}) {
  const tr = useT();
  const cfg = TILE_CFG[size];
  const isDragging = dragKey === `tile:${a.id}`;
  const isTarget = dragKey.startsWith('tile:') && !isDragging;
  const isColor = a.kind === 'color';
  return (
    <div
      draggable
      onDragStart={(e) => { e.stopPropagation(); onDragStart(); }}
      onDragEnd={onDragEnd}
      onDragOver={(e) => { if (dragKey.startsWith('tile:')) e.preventDefault(); }}
      onDrop={onDrop}
      style={{
        position: 'relative',
        opacity: isDragging ? 0.35 : 1,
        cursor: 'grab',
        borderRadius: 10,
        outline: isTarget ? '2px dashed var(--accent, #22d3ee)' : undefined,
        transition: 'opacity 0.1s',
      }}
    >
      <button
        className="btn lg"
        aria-pressed={active}
        style={{
          width: '100%',
          minHeight: cfg.minH,
          minWidth: cfg.minW,
          flexDirection: 'column',
          gap: 4,
          fontSize: cfg.fontSize,
          borderRadius: 10,
          ...(isColor ? { background: a.color, color: '#000', textShadow: '0 0 3px rgba(255,255,255,0.6)' } : {}),
          ...(active ? { boxShadow: '0 0 0 3px #22d3ee, 0 0 16px rgba(34,211,238,0.4)' } : {}),
        }}
        title={editing ? tr('quick.editHint') : undefined}
        onClick={onClick}
      >
        <b style={{ lineHeight: 1.2 }}>{a.name}</b>
        {size !== 'sm' && a.kind !== 'color' && (
          <span style={{
            background: KIND_BADGE[a.kind] ?? '#555',
            borderRadius: 4,
            padding: '2px 6px',
            fontSize: '0.68rem',
            letterSpacing: '0.03em',
            color: '#fff',
            opacity: 0.95,
          }}>
            {tr(`quick.kind.${a.kind}`)}
          </span>
        )}
        {size !== 'sm' && isColor && (
          <span style={{ fontSize: '0.68rem', opacity: 0.7 }}>{tr('quick.kind.color')}</span>
        )}
        {/* Machine target badge */}
        {size !== 'sm' && (a.groupIds?.length || a.fixtureIds?.length) && (
          <span
            title={tr('quick.targetBadgeHint')}
            style={{
              display: 'flex', alignItems: 'center', gap: 3,
              background: 'rgba(0,0,0,0.35)',
              borderRadius: 4,
              padding: '1px 5px',
              fontSize: '0.65rem',
              color: isColor ? 'rgba(0,0,0,0.7)' : 'var(--fg-muted, #aaa)',
            }}
          >
            <Users size={9} />
            {a.groupIds?.length ? a.groupIds.length : a.fixtureIds?.length}
          </span>
        )}
      </button>
      {editing && (
        <button
          className="btn danger sm icon"
          style={{
            position: 'absolute',
            top: 5,
            right: 5,
            padding: '3px 5px',
            borderRadius: 6,
            lineHeight: 1,
          }}
          aria-label={tr('common.delete')}
          onClick={(e) => {
            e.stopPropagation();
            if (window.confirm(tr('quick.deleteConfirm').replace('{name}', a.name))) onDelete();
          }}
        >
          <X size={13} />
        </button>
      )}
    </div>
  );
}

// ── Category tab bar ─────────────────────────────────────────────────────────
function CategoryTabBar({
  categories, activeTab, setActiveTab, editing, dragKey,
  onDragStartCat, onDragEndCat, onDropOnTab,
  renamingCat, renameValue, setRenameValue, startRename, commitRename, cancelRename,
}: {
  categories: string[]; activeTab: string; setActiveTab(c: string): void;
  editing: boolean; dragKey: string;
  onDragStartCat(cat: string): void; onDragEndCat(): void; onDropOnTab(targetCat: string): void;
  renamingCat: string | null; renameValue: string;
  setRenameValue(v: string): void; startRename(cat: string): void;
  commitRename(): void; cancelRename(): void;
}) {
  const tr = useT();
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        overflowX: 'auto',
        borderBottom: '1px solid var(--border, #333)',
        paddingBottom: 0,
        flexShrink: 0,
        scrollbarWidth: 'thin',
      }}
    >
      {/* "All" tab */}
      <button
        className={`btn sm ${activeTab === '__all__' ? 'primary' : ''}`}
        style={{ flexShrink: 0, borderRadius: '6px 6px 0 0', borderBottom: 'none' }}
        onClick={() => setActiveTab('__all__')}
      >
        {tr('quick.tabAll')}
      </button>

      {categories.map((cat) => {
        const isActive = activeTab === cat;
        const isDraggingThis = dragKey === `cat:${cat}`;
        const isDropTarget = dragKey.startsWith('cat:') && !isDraggingThis;
        return (
          <div
            key={cat}
            style={{
              display: 'flex',
              alignItems: 'center',
              opacity: isDraggingThis ? 0.4 : 1,
              outline: isDropTarget ? '2px dashed var(--accent, #22d3ee)' : undefined,
              borderRadius: '6px 6px 0 0',
              flexShrink: 0,
            }}
            onDragOver={(e) => { if (dragKey.startsWith('cat:')) e.preventDefault(); }}
            onDrop={(e) => { e.preventDefault(); onDropOnTab(cat); }}
          >
            {editing && (
              <span
                draggable
                onDragStart={(e) => { e.stopPropagation(); onDragStartCat(cat); }}
                onDragEnd={onDragEndCat}
                style={{ cursor: 'grab', color: 'var(--fg-muted, #888)', lineHeight: 0, padding: '0 2px' }}
                title={tr('quick.dragCategory')}
              >
                <GripVertical size={14} />
              </span>
            )}
            {renamingCat === cat ? (
              <input
                autoFocus
                className="input"
                style={{ fontSize: '0.85rem', fontWeight: 600, padding: '2px 6px', width: 110, height: 28, borderRadius: 4 }}
                value={renameValue}
                maxLength={40}
                onChange={(e) => setRenameValue(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') cancelRename(); }}
              />
            ) : (
              <button
                className={`btn sm ${isActive ? 'primary' : ''}`}
                style={{ borderRadius: '6px 6px 0 0', borderBottom: 'none' }}
                onClick={() => setActiveTab(cat)}
                onDoubleClick={editing ? () => startRename(cat) : undefined}
                title={editing ? tr('quick.renameCategoryHint') : cat || tr('quick.uncategorized')}
              >
                {cat || tr('quick.uncategorized')}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Machine picker (used inside ActionDialog) ────────────────────────────────
/** Mode: 'all' = follow global selection, 'groups' = pick groups, 'fixtures' = pick individual fixtures */
type TargetMode = 'all' | 'groups' | 'fixtures';

function MachinePicker({
  mode, setMode,
  selectedGroups, setSelectedGroups,
  selectedFixtures, setSelectedFixtures,
}: {
  mode: TargetMode; setMode(m: TargetMode): void;
  selectedGroups: string[]; setSelectedGroups(ids: string[]): void;
  selectedFixtures: string[]; setSelectedFixtures(ids: string[]): void;
}) {
  const tr = useT();
  const p = useStore((s) => s.project!.project);
  const toggleId = (list: string[], id: string): string[] =>
    list.includes(id) ? list.filter((x) => x !== id) : [...list, id];

  return (
    <div>
      {/* Mode selector */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
        {(['all', 'groups', 'fixtures'] as TargetMode[]).map((m) => (
          <button
            key={m}
            type="button"
            className={`btn sm ${mode === m ? 'primary' : ''}`}
            style={{ flex: 1 }}
            onClick={() => setMode(m)}
          >
            {tr(`quick.target.${m}`)}
          </button>
        ))}
      </div>

      {/* Group chips */}
      {mode === 'groups' && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {p.groups.length === 0 && (
            <span style={{ fontSize: '0.82rem', color: 'var(--fg-muted, #888)' }}>{tr('quick.target.noGroups')}</span>
          )}
          {p.groups.map((g) => {
            const on = selectedGroups.includes(g.id);
            return (
              <button
                key={g.id}
                type="button"
                className={`btn sm ${on ? 'primary' : ''}`}
                style={{
                  borderLeft: `3px solid ${g.color}`,
                  paddingLeft: 8,
                  opacity: on ? 1 : 0.65,
                }}
                onClick={() => setSelectedGroups(toggleId(selectedGroups, g.id))}
              >
                {g.name}
              </button>
            );
          })}
        </div>
      )}

      {/* Fixture chips */}
      {mode === 'fixtures' && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 160, overflowY: 'auto' }}>
          {p.patch.length === 0 && (
            <span style={{ fontSize: '0.82rem', color: 'var(--fg-muted, #888)' }}>{tr('quick.target.noFixtures')}</span>
          )}
          {p.patch.map((f) => {
            const on = selectedFixtures.includes(f.id);
            return (
              <button
                key={f.id}
                type="button"
                className={`btn sm ${on ? 'primary' : ''}`}
                style={{ opacity: on ? 1 : 0.65 }}
                onClick={() => setSelectedFixtures(toggleId(selectedFixtures, f.id))}
              >
                {f.name}
              </button>
            );
          })}
        </div>
      )}

      {/* Summary */}
      {mode !== 'all' && (
        <div style={{ marginTop: 6, fontSize: '0.78rem', color: 'var(--fg-muted, #888)' }}>
          {mode === 'groups'
            ? tr('quick.target.groupsSummary').replace('{n}', String(selectedGroups.length))
            : tr('quick.target.fixturesSummary').replace('{n}', String(selectedFixtures.length))}
        </div>
      )}
    </div>
  );
}

// ── Action Dialog ────────────────────────────────────────────────────────────
function ActionDialog({ initial, categories, onSave, onClose }: { initial?: QuickAction; categories: string[]; onSave: (a: QuickAction) => void; onClose: () => void }) {
  const tr = useT();
  const p = useStore((s) => s.project!.project);
  const [kind, setKind] = useState<(typeof KINDS)[number]>(initial?.kind ?? 'color');
  const [category, setCategory] = useState(initial ? initial.category ?? '' : categories[categories.length - 1] ?? '');
  const [name, setName] = useState(initial?.name ?? '');
  const [color, setColor] = useState(initial?.kind === 'color' ? initial.color : '#FF0000');
  const [ref, setRef] = useState(initial && initial.kind !== 'color' ? initial.ref : '');
  const [index, setIndex] = useState(initial?.kind === 'cue' && initial.index !== undefined ? String(initial.index) : '');

  // Machine targeting state
  const initMode = (): TargetMode => {
    if (initial?.groupIds?.length) return 'groups';
    if (initial?.fixtureIds?.length) return 'fixtures';
    return 'all';
  };
  const [targetMode, setTargetMode] = useState<TargetMode>(initMode);
  const [selectedGroups, setSelectedGroups] = useState<string[]>(initial?.groupIds ?? []);
  const [selectedFixtures, setSelectedFixtures] = useState<string[]>(initial?.fixtureIds ?? []);

  const options = kind === 'effect' ? p.effects : kind === 'scene' ? p.scenes : kind === 'palette' ? p.palettes : kind === 'cue' ? p.cueLists : [];
  const chosen = options.find((o) => o.id === ref) ?? options[0];
  const submit = () => {
    const label = name.trim() || chosen?.name || color;
    const a = kind === 'color' ? { kind, color } : chosen ? { kind, ref: chosen.id, ...(kind === 'cue' && index !== '' ? { index: Number(index) } : {}) } : null;
    const targeting = targetMode === 'groups' && selectedGroups.length
      ? { groupIds: selectedGroups }
      : targetMode === 'fixtures' && selectedFixtures.length
        ? { fixtureIds: selectedFixtures }
        : {};
    const parsed = a && quickActionSchema.safeParse({ id: initial?.id ?? newId(), name: label, ...(category.trim() ? { category } : {}), ...targeting, ...a });
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
      <Field label={tr('quick.target')} hint={tr('quick.targetHint')}>
        <MachinePicker
          mode={targetMode}
          setMode={setTargetMode}
          selectedGroups={selectedGroups}
          setSelectedGroups={setSelectedGroups}
          selectedFixtures={selectedFixtures}
          setSelectedFixtures={setSelectedFixtures}
        />
      </Field>
    </Modal>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────
export function QuickActionsPage() {
  const tr = useT();
  const [actions, setActions] = useState(loadActions);
  const [dialog, setDialog] = useState(null as QuickAction | 'new' | null);
  const [editing, setEditing] = useState(false);
  const [size, setSize] = useState<TileSize>(loadSize);
  const [search, setSearch] = useState('');
  const [showSubtitleFull, setShowSubtitleFull] = useState(false);
  // active tab: '__all__' | category string
  const [activeTab, setActiveTab] = useState('__all__');
  // drag: 'tile:<id>' | 'cat:<name>'
  const [dragKey, setDragKey] = useState('');
  const [armed, setArmed] = useState(new Set<string>());
  // inline category rename
  const [renamingCat, setRenamingCat] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const rt = useStore((s) => s.runtime);
  const fileRef = useRef<HTMLInputElement>(null);

  const categories = [...new Set(actions.map((a) => a.category ?? ''))];

  const toast = useStore.getState().toast;
  const update = (next: QuickAction[]) => {
    setActions(next);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { toast({ kind: 'warn', title: tr('quick.notSaved') }); }
  };
  const save = (a: QuickAction) => {
    const old = actions.find((x) => x.id === a.id);
    if (!old) { update([...actions, a]); setActiveTab(a.category ?? ''); return; }
    const next = actions.map((x) => (x.id === a.id ? a : x));
    update(old.category === a.category ? next : moveQuickAction(next, a.id, a.category));
  };

  // ── Click ──────────────────────────────────────────────────────────────────
  const click = async (a: QuickAction) => {
    const others = isActive(a, rt, armed) ? [] : actions.filter((o) => o.id !== a.id && o.category === a.category && isActive(o, rt, armed));
    for (const o of others) await toggle(o, true, tr('quick.missing'));
    const on = await toggle(a, isActive(a, rt, armed), tr('quick.missing'));
    setArmed((cur) => {
      const next = new Set(cur);
      others.forEach((o) => next.delete(o.id));
      if (on === undefined) return next;
      if (on && a.kind === 'color') actions.forEach((x) => x.kind === 'color' && next.delete(x.id));
      if (on) next.add(a.id); else next.delete(a.id);
      return next;
    });
  };

  // ── Drag ───────────────────────────────────────────────────────────────────
  const dropOnTile = (e: React.DragEvent, cat: string, beforeId?: string) => {
    e.preventDefault(); e.stopPropagation();
    if (dragKey.startsWith('tile:')) update(moveQuickAction(actions, dragKey.slice(5), cat || undefined, beforeId));
    setDragKey('');
  };
  const dropOnTab = (targetCat: string) => {
    if (dragKey.startsWith('cat:')) update(moveCategoryBefore(actions, dragKey.slice(4), targetCat));
    if (dragKey.startsWith('tile:')) update(moveQuickAction(actions, dragKey.slice(5), targetCat || undefined));
    setDragKey('');
  };

  // ── Rename ─────────────────────────────────────────────────────────────────
  const startRename = (cat: string) => { setRenamingCat(cat); setRenameValue(cat); };
  const commitRename = () => {
    if (renamingCat !== null && renameValue.trim() !== renamingCat) {
      update(renameCategory(actions, renamingCat, renameValue));
      if (activeTab === renamingCat) setActiveTab(renameValue.trim() || '');
    }
    setRenamingCat(null);
  };
  const cancelRename = () => setRenamingCat(null);

  // ── Size ────────────────────────────────────────────────────────────────────
  const setAndSaveSize = (next: TileSize) => {
    setSize(next);
    try { localStorage.setItem(SIZE_KEY, next); } catch { /* ignore */ }
  };

  // ── Import / export ────────────────────────────────────────────────────────
  const importFile = async (f: File | undefined) => {
    if (!f) return;
    const r = parseQuickActions(await f.text(), actions, newId);
    if (!r.actions.length) { toast({ kind: 'error', title: tr('quick.importNone') }); return; }
    update([...actions, ...r.actions]);
    toast({ kind: 'success', title: tr('quick.imported', { n: r.actions.length }), ...(r.skipped ? { detail: tr('quick.skipped', { n: r.skipped }) } : {}) });
  };
  const exportFile = () => {
    const el = document.createElement('a');
    el.href = URL.createObjectURL(new Blob([JSON.stringify({ actions }, null, 2)], { type: 'application/json' }));
    el.download = 'quick-actions.json';
    el.click();
    URL.revokeObjectURL(el.href);
  };

  // ── Filtered actions ───────────────────────────────────────────────────────
  const q = search.trim().toLowerCase();
  const visibleActions = actions.filter((a) => {
    if (q && !a.name.toLowerCase().includes(q) && !(a.category ?? '').toLowerCase().includes(q)) return false;
    if (activeTab === '__all__') return true;
    return (a.category ?? '') === activeTab;
  });

  // Group for "all" view
  const visibleCats = activeTab === '__all__'
    ? [...new Set(visibleActions.map((a) => a.category ?? ''))]
    : [activeTab];

  const cfg = TILE_CFG[size];

  return (
    <div className="page" style={{ display: 'flex', flexDirection: 'column', gap: 0, overflow: 'hidden', height: '100%' }}>
      {/* ── Toolbar ── */}
      <PageHead title={tr('quick.title')} subtitle={tr('quick.subtitle')}>
        {/* Subtitle help icon */}
        <button
          className="btn sm icon"
          title={tr('quick.subtitleFull')}
          onClick={() => setShowSubtitleFull((v) => !v)}
          style={{ color: showSubtitleFull ? 'var(--accent, #22d3ee)' : undefined }}
        >
          <HelpCircle size={15} />
        </button>

        {/* Search */}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <Search size={13} style={{ position: 'absolute', left: 7, color: 'var(--fg-muted, #888)', pointerEvents: 'none' }} />
          <input
            className="input"
            style={{ paddingLeft: 26, width: 160, height: 30, fontSize: '0.82rem' }}
            placeholder={tr('quick.search')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button className="btn sm icon" style={{ position: 'absolute', right: 2 }} onClick={() => setSearch('')}>
              <X size={11} />
            </button>
          )}
        </div>

        {/* Tile size — 3 explicit buttons */}
        <div
          style={{ display: 'flex', gap: 1, alignItems: 'center', background: 'var(--bg-raised, #222)', borderRadius: 6, padding: '2px' }}
          title={tr('quick.tileSize')}
        >
          {TILE_SIZES.map(({ key, label }) => (
            <button
              key={key}
              className={`btn sm ${size === key ? 'primary' : ''}`}
              style={{ minWidth: 28, padding: '2px 6px', borderRadius: 4, fontWeight: size === key ? 700 : 400 }}
              onClick={() => setAndSaveSize(key)}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Edit mode toggle */}
        <button
          className={`btn ${editing ? 'primary' : ''}`}
          disabled={!actions.length}
          onClick={() => setEditing(!editing)}
          title={editing ? tr('quick.done') : tr('quick.edit')}
        >
          <Pencil size={14} />
          <span style={{ marginLeft: 5 }}>{editing ? tr('quick.done') : tr('quick.edit')}</span>
        </button>

        {/* Import */}
        <button className="btn" onClick={() => fileRef.current?.click()} title={tr('quick.import')}>
          <Upload size={14} />
          <span style={{ marginLeft: 5 }}>{tr('quick.import')}</span>
        </button>

        {/* Export */}
        <button className="btn" disabled={!actions.length} onClick={exportFile} title={tr('quick.export')}>
          <Download size={14} />
          <span style={{ marginLeft: 5 }}>{tr('quick.export')}</span>
        </button>

        {/* Add */}
        <button className="btn primary" onClick={() => setDialog('new')}>
          <Plus size={14} />
          {tr('quick.add')}
        </button>

        <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={(e) => { void importFile(e.target.files?.[0]); e.target.value = ''; }} />
      </PageHead>

      {/* ── Expanded subtitle ── */}
      {showSubtitleFull && (
        <div style={{
          margin: '0 8px 0',
          padding: '8px 14px',
          background: 'var(--bg-raised, #1e1e1e)',
          borderRadius: 8,
          border: '1px solid var(--border, #333)',
          fontSize: '0.82rem',
          color: 'var(--fg-muted, #aaa)',
          lineHeight: 1.5,
        }}>
          {tr('quick.subtitleFull')}
        </div>
      )}

      {/* ── Editing mode banner ── */}
      {editing && (
        <div style={{
          margin: '6px 8px 0',
          padding: '7px 14px',
          background: 'rgba(34,211,238,0.07)',
          border: '1px solid rgba(34,211,238,0.25)',
          borderRadius: 8,
          fontSize: '0.82rem',
          color: 'var(--accent, #22d3ee)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexShrink: 0,
        }}>
          <Pencil size={13} />
          <span><strong>{tr('quick.editingMode')}</strong> — {tr('quick.editingModeHint')}</span>
        </div>
      )}

      {actions.length === 0 ? (
        <Empty icon={<Zap size={32} />} title={tr('quick.empty')}>
          <p style={{ color: 'var(--fg-muted, #aaa)', marginBottom: 14, textAlign: 'center' }}>{tr('quick.emptyHint')}</p>
          <button className="btn primary" style={{ display: 'inline-flex', gap: 6 }} onClick={() => setDialog('new')}>
            <Plus size={15} />
            {tr('quick.add')}
          </button>
        </Empty>
      ) : (
        <>
          {/* ── Category tabs ── */}
          <CategoryTabBar
            categories={categories}
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            editing={editing}
            dragKey={dragKey}
            onDragStartCat={(cat) => setDragKey(`cat:${cat}`)}
            onDragEndCat={() => setDragKey('')}
            onDropOnTab={dropOnTab}
            renamingCat={renamingCat}
            renameValue={renameValue}
            setRenameValue={setRenameValue}
            startRename={startRename}
            commitRename={commitRename}
            cancelRename={cancelRename}
          />

          {/* ── Tiles area ── */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '14px 8px', display: 'flex', flexDirection: 'column', gap: 22 }}>
            {visibleActions.length === 0 ? (
              <div style={{ color: 'var(--fg-muted, #888)', padding: '28px', textAlign: 'center' }}>
                {tr('quick.noResults')}
              </div>
            ) : (
              visibleCats.map((cat) => {
                const catActions = visibleActions.filter((a) => (a.category ?? '') === cat);
                if (!catActions.length) return null;
                return (
                  <section key={cat}>
                    {/* Show category label only in "all" view */}
                    {activeTab === '__all__' && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                        {editing && (
                          <span
                            draggable
                            onDragStart={(e) => { e.stopPropagation(); setDragKey(`cat:${cat}`); }}
                            onDragEnd={() => setDragKey('')}
                            style={{ cursor: 'grab', color: 'var(--fg-muted, #888)', lineHeight: 0 }}
                            title={tr('quick.dragCategory')}
                          >
                            <GripVertical size={14} />
                          </span>
                        )}
                        <h3 style={{ margin: 0, fontSize: '0.88rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--fg-muted, #999)' }}>
                          {cat || tr('quick.uncategorized')}
                        </h3>
                        <span style={{
                          fontSize: '0.72rem',
                          color: 'var(--fg-muted, #666)',
                          background: 'var(--bg-raised, #222)',
                          borderRadius: 10,
                          padding: '1px 7px',
                          fontWeight: 500,
                        }}>
                          {catActions.length}
                        </span>
                        {editing && cat !== '' && (
                          <button className="btn sm icon" title={tr('quick.renameCategory')} onClick={() => startRename(cat)}>
                            <Pencil size={11} />
                          </button>
                        )}
                      </div>
                    )}
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: `repeat(auto-fill, minmax(${cfg.minW}px, 1fr))`,
                        gap: size === 'sm' ? 7 : 11,
                      }}
                      onDragOver={(e) => { if (dragKey.startsWith('tile:')) e.preventDefault(); }}
                      onDrop={(e) => dropOnTile(e, cat)}
                    >
                      {catActions.map((a) => (
                        <ActionTile
                          key={a.id}
                          a={a}
                          active={isActive(a, rt, armed)}
                          editing={editing}
                          size={size}
                          dragKey={dragKey}
                          onDragStart={() => setDragKey(`tile:${a.id}`)}
                          onDragEnd={() => setDragKey('')}
                          onDrop={(e) => dropOnTile(e, cat, a.id)}
                          onClick={() => editing ? setDialog(a) : void click(a)}
                          onDelete={() => update(actions.filter((x) => x.id !== a.id))}
                        />
                      ))}
                    </div>
                  </section>
                );
              })
            )}
          </div>
        </>
      )}
      {dialog && <ActionDialog key={dialog === 'new' ? 'new' : dialog.id} initial={dialog === 'new' ? undefined : dialog} categories={categories.filter(Boolean)} onSave={save} onClose={() => setDialog(null)} />}
    </div>
  );
}
