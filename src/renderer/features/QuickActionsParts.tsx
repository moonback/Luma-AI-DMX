import { useState } from 'react';
import { GripVertical, Users, X } from 'lucide-react';
import { useStore } from '../store';
import { useT } from '../i18n';
import { newId } from '../api';
import { Field, Modal } from '../components/ui';
import { quickActionSchema, type QuickAction } from '../../core/quick/quickActions';

export const KINDS = ['color', 'effect', 'cue', 'scene', 'palette'] as const;
export type TileSize = 'sm' | 'md' | 'lg';
export const TILE_CFG: Record<TileSize, { minW: number; minH: number; fontSize: string }> = {
  sm: { minW: 90,  minH: 52, fontSize: '0.78rem' },
  md: { minW: 130, minH: 72, fontSize: '0.88rem' },
  lg: { minW: 170, minH: 92, fontSize: '1rem' },
};


// Badge color per action kind
const KIND_BADGE: Record<string, string> = {
  color:   'transparent',
  effect:  '#7c3aed',
  cue:     '#0891b2',
  scene:   '#059669',
  palette: '#d97706',
};

// ── Action Tile ──────────────────────────────────────────────────────────────
export function ActionTile({
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
export function CategoryTabBar({
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

export function MachinePicker({
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
export function ActionDialog({ initial, categories, onSave, onClose }: { initial?: QuickAction; categories: string[]; onSave: (a: QuickAction) => void; onClose: () => void }) {
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