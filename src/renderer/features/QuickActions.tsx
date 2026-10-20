import { useRef, useState } from 'react';
import { Download, GripVertical, HelpCircle, Pencil, Plus, Search, Upload, X, Zap } from 'lucide-react';
import { useStore } from '../store';
import { useT } from '../i18n';
import { act, newId } from '../api';
import { Empty, PageHead } from '../components/ui';
import { attributeClass } from '../../core/fixtures/attributes';
import type { RuntimeState } from '../../shared/commands';
import { moveCategoryBefore, moveQuickAction, parseQuickActions, quickActionSchema, renameCategory, type QuickAction } from '../../core/quick/quickActions';
import { ActionDialog, ActionTile, CategoryTabBar, TILE_CFG, type TileSize } from './QuickActionsParts';

const STORAGE_KEY = 'luma.quickActions';
const SIZE_KEY = 'luma.quickActionsSize';

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
const TILE_SIZES: { key: TileSize; label: string }[] = [
  { key: 'sm', label: 'S' },
  { key: 'md', label: 'M' },
  { key: 'lg', label: 'L' },
];


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
