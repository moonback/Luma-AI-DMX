import { useRef, useState } from 'react';
import { Download, GripVertical, LayoutGrid, Pencil, Plus, Search, Upload, X, Zap } from 'lucide-react';
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

// ── Tile size config ─────────────────────────────────────────────────────────
const TILE_CFG: Record<TileSize, { minW: number; minH: number; fontSize: string }> = {
  sm: { minW: 90,  minH: 48, fontSize: '0.78rem' },
  md: { minW: 130, minH: 64, fontSize: '0.88rem' },
  lg: { minW: 170, minH: 84, fontSize: '1rem' },
};

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
        borderRadius: 8,
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
          gap: 2,
          fontSize: cfg.fontSize,
          ...(a.kind === 'color' ? { background: a.color, color: '#000', textShadow: '0 0 3px #fff' } : {}),
          ...(active ? { boxShadow: '0 0 0 3px #22d3ee, 0 0 14px #22d3ee' } : {}),
        }}
        title={editing ? tr('quick.editHint') : undefined}
        onClick={onClick}
      >
        <b style={{ lineHeight: 1.2 }}>{a.name}</b>
        {size !== 'sm' && <span style={{ opacity: 0.65, fontSize: '0.72rem' }}>{tr(`quick.kind.${a.kind}`)}</span>}
      </button>
      {editing && (
        <button
          className="btn danger sm icon"
          style={{ position: 'absolute', top: 3, right: 3, padding: '1px 3px' }}
          aria-label={tr('common.delete')}
          onClick={onDelete}
        >
          <X size={10} />
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

// ── Main Page ────────────────────────────────────────────────────────────────
export function QuickActionsPage() {
  const tr = useT();
  const [actions, setActions] = useState(loadActions);
  const [dialog, setDialog] = useState(null as QuickAction | 'new' | null);
  const [editing, setEditing] = useState(false);
  const [size, setSize] = useState<TileSize>(loadSize);
  const [search, setSearch] = useState('');
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

  // ── Size toggle ────────────────────────────────────────────────────────────
  const cycleSize = () => {
    const next: TileSize = size === 'sm' ? 'md' : size === 'md' ? 'lg' : 'sm';
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
        {/* Search */}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <Search size={13} style={{ position: 'absolute', left: 7, color: 'var(--fg-muted, #888)', pointerEvents: 'none' }} />
          <input
            className="input"
            style={{ paddingLeft: 26, width: 160, height: 28, fontSize: '0.82rem' }}
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
        {/* Tile size */}
        <button className="btn sm icon" title={tr('quick.tileSize')} onClick={cycleSize}>
          <LayoutGrid size={14} />
          <span style={{ fontSize: '0.7rem', marginLeft: 2 }}>{size.toUpperCase()}</span>
        </button>
        <button className={`btn ${editing ? 'primary' : ''}`} disabled={!actions.length} onClick={() => setEditing(!editing)}><Pencil size={14} /></button>
        <button className="btn" onClick={() => fileRef.current?.click()}><Upload size={14} /></button>
        <button className="btn" disabled={!actions.length} onClick={exportFile}><Download size={14} /></button>
        <button className="btn primary" onClick={() => setDialog('new')}><Plus size={14} />{tr('quick.add')}</button>
        <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={(e) => { void importFile(e.target.files?.[0]); e.target.value = ''; }} />
      </PageHead>

      {actions.length === 0 ? (
        <Empty icon={<Zap size={32} />} title={tr('quick.empty')}>{tr('quick.emptyHint')}</Empty>
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
          <div style={{ flex: 1, overflowY: 'auto', padding: '12px 6px', display: 'flex', flexDirection: 'column', gap: 20 }}>
            {visibleActions.length === 0 ? (
              <div style={{ color: 'var(--fg-muted, #888)', padding: '24px', textAlign: 'center' }}>
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
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
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
                        <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 600 }}>
                          {cat || tr('quick.uncategorized')}
                        </h3>
                        <span style={{ fontSize: '0.75rem', color: 'var(--fg-muted, #888)' }}>
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
                        gap: size === 'sm' ? 6 : 10,
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
