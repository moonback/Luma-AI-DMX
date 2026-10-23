import { useMemo, useState, type ReactNode } from 'react';
import { Anchor, Archive, Armchair, Blocks, Cable, Cloud, Disc3, Drum, Fence, Guitar, Keyboard, Mic, Piano, Plus, Server, SlidersHorizontal, Snowflake, Sparkles, Speaker, Star, Tent, Clock, RectangleHorizontal, type LucideIcon } from 'lucide-react';
import { useStore } from '../../store';
import { useT } from '../../i18n';
import { JUNCTION_ARMS } from '../../../core/visualizer/truss';
import { LIBRARY, librarySearchText, type LibraryGroup, type LibraryItem } from '../../../core/visualizer/library';
import { ASSEMBLIES, type Assembly } from '../../../core/visualizer/assemblies';
import type { PropKind } from '../../../core/visualizer/equipment';
import type { Truss } from '../../../core/model/schemas';
import { LIBRARY_MIME, addAssembly, addSceneElement } from '../../sceneActions';
import { useThumbnail } from '../stage3d/thumbnails';
import { markRecent, toggleFavorite, useLibraryPrefs } from './libraryPrefs';

/* Library tiles of the Construire panel: 3D thumbnails (drawn glyph meanwhile), favourites, quick add, click-to-place
   and drag onto the 2D / 3D views; ready-made assemblies; the whole-library search with favourites and recent items. */

/** Lower-case, accent-free text for the catalogue search ("Écran" matches "ecran"). */
export const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

const ICONS: Partial<Record<PropKind, LucideIcon>> = {
  'line-array': Speaker, sub: Speaker, 'pa-stand': Speaker, 'audio-rack': Server, drums: Drum, cymbal: Disc3, guitar: Guitar, amp: Speaker,
  keyboard: Keyboard, piano: Piano, 'music-stand': Mic, 'fog-machine': Cloud, 'spark-machine': Sparkles, 'co2-jet': Snowflake,
  backdrop: RectangleHorizontal, arch: RectangleHorizontal, 'dj-booth': Disc3, console: SlidersHorizontal, 'flight-case': Archive,
  chair: Armchair, barrier: Fence, cable: Cable, hoist: Anchor, 'truss-base': Blocks, canopy: Tent,
};

/** Small top view of a library item or stage element (drawn, so every piece reads at a glance whatever the icon set). */
export function LibraryGlyph({ item, size = 28 }: { item: { kind: LibraryItem['kind']; preset: Record<string, unknown> }; size?: number }) {
  const s = { stroke: 'currentColor', strokeWidth: 2, fill: 'none', strokeLinecap: 'round' as const };
  const Icon = item.kind === 'prop' ? ICONS[item.preset.kind as PropKind] : undefined;
  if (Icon) return <span className="lib-glyph-icon" style={{ width: size, height: size }} aria-hidden><Icon /></span>;
  let body: ReactNode;
  if (item.kind === 'truss') {
    const p = item.preset as Partial<Truss>;
    const arms = JUNCTION_ARMS[p.shape ?? 'line'];
    if (arms) body = <>{arms.map((a) => <line key={a} x1={14} y1={14} x2={14 + 10 * Math.cos((a * Math.PI) / 180)} y2={14 - 10 * Math.sin((a * Math.PI) / 180)} {...s} strokeWidth={4} />)}<rect x={11} y={11} width={6} height={6} fill="currentColor" /></>;
    else if (p.shape === 'totem') body = <><rect x={11} y={3} width={6} height={20} {...s} /><line x1={6} y1={25} x2={22} y2={25} {...s} /></>;
    else if (p.shape === 'circle') body = <circle cx={14} cy={14} r={10} {...s} strokeWidth={3} />;
    else if (p.shape === 'square') body = <rect x={4} y={4} width={20} height={20} {...s} strokeWidth={3} />;
    else if (p.section === 'triangle') body = <><path d="M4 18h20M4 18l4-7h12l4 7M8 11l4 7l4-7l4 7" {...s} strokeWidth={1.6} /></>;
    else {
      const len = Math.min(24, 4 + (p.length ?? 2) * 5);
      body = <><line x1={14 - len / 2} y1={14} x2={14 + len / 2} y2={14} {...s} strokeWidth={4} />{p.support === 'towers' && <><line x1={2} y1={14} x2={2} y2={26} {...s} /><line x1={26} y1={14} x2={26} y2={26} {...s} /></>}</>;
    }
  } else if (item.kind === 'prop') {
    const k = item.preset.kind;
    if (k === 'column' || k === 'mic') body = <><circle cx={14} cy={k === 'mic' ? 7 : 14} r={k === 'mic' ? 3 : 8} {...s} />{k === 'mic' && <line x1={14} y1={10} x2={14} y2={25} {...s} />}</>;
    else if (k === 'stairs') body = <path d="M4 24h6v-6h6v-6h6v-6h2" {...s} />;
    else if (k === 'drape') body = <path d="M4 4v20M9 4v20M14 4v20M19 4v20M24 4v20" {...s} strokeWidth={1.5} />;
    else if (k === 'monitor') body = <path d="M4 22h20L8 10z" {...s} />;
    else if (k === 'speaker') body = <><rect x={8} y={3} width={12} height={22} {...s} /><circle cx={14} cy={17} r={4} {...s} /></>;
    else if (k === 'table') body = <path d="M3 10h22M6 10v14M22 10v14" {...s} />;
    else body = <rect x={k === 'riser' ? 2 : 6} y={k === 'riser' ? 9 : 6} width={k === 'riser' ? 24 : 16} height={k === 'riser' ? 10 : 16} {...s} />;
  } else if (item.kind === 'performer') body = <><circle cx={14} cy={7} r={4} {...s} /><path d="M7 25c0-6 3-10 7-10s7 4 7 10" {...s} /></>;
  else if (item.kind === 'screen') body = <><rect x={3} y={7} width={22} height={13} {...s} />{item.preset.cabinet ? <path d="M10 7v13M18 7v13M3 13.5h22" {...s} strokeWidth={1} /> : null}</>;
  else body = <path d="M14 4l8 10-8 10-8-10z" {...s} />;
  return <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden>{body}</svg>;
}

function Thumb({ item }: { item: LibraryItem }) {
  const url = useThumbnail(item);
  return url ? <img className="lib-thumb" src={url} alt="" width={44} height={44} draggable={false} /> : <LibraryGlyph item={item} />;
}

/** One library tile: click arms a click-to-place, drag drops on the views, "+" adds at a free spot, ☆ favourite. */
export function EquipTile({ item }: { item: LibraryItem }) {
  const tr = useT();
  const placing = useStore((s) => s.placing);
  const fav = useLibraryPrefs().fav.includes(item.id);
  const on = placing?.label === item.label;
  return (
    <div className={`scene-lib-item equip-tile ${on ? 'on' : ''}`}>
      <button className="equip-tile-main" draggable data-testid={`lib-${item.id}`} title={tr('equip.tileHint', { name: item.label })} aria-pressed={on}
        onClick={() => { markRecent(item.id); useStore.getState().setPlacing(on ? null : { kind: item.kind, label: item.label, preset: { ...item.preset } }); }}
        onDragStart={(e) => { markRecent(item.id); e.dataTransfer.setData(LIBRARY_MIME, item.id); e.dataTransfer.effectAllowed = 'copy'; }}>
        <Thumb item={item} />
        <span>{item.label}</span>
      </button>
      <button className={`equip-tile-fav ${fav ? 'on' : ''}`} onClick={() => toggleFavorite(item.id)} aria-pressed={fav} title={tr(fav ? 'equip.favRemove' : 'equip.favAdd')} aria-label={tr(fav ? 'equip.favRemove' : 'equip.favAdd')} data-testid={`fav-${item.id}`}><Star size={11} /></button>
      <button className="equip-tile-add" onClick={() => { markRecent(item.id); addSceneElement(item.kind, undefined, item.preset); }} title={tr('equip.quickAdd')} aria-label={tr('equip.quickAdd')} data-testid={`quick-${item.id}`}><Plus size={11} /></button>
    </div>
  );
}

function AssemblyTile({ a }: { a: Assembly }) {
  const tr = useT();
  const placing = useStore((s) => s.placing);
  const key = `assembly:${a.id}`;
  const on = placing?.kind === 'assembly' && placing.assembly === a.id;
  return (
    <div className={`scene-lib-item equip-tile ${on ? 'on' : ''}`}>
      <button className="equip-tile-main" draggable data-testid={`asm-${a.id}`} title={`${a.label} : ${a.hint}`} aria-pressed={on}
        onClick={() => { markRecent(key); useStore.getState().setPlacing(on ? null : { kind: 'assembly', label: a.label, assembly: a.id }); }}
        onDragStart={(e) => { markRecent(key); e.dataTransfer.setData(LIBRARY_MIME, key); e.dataTransfer.effectAllowed = 'copy'; }}>
        <span className="lib-glyph-icon" aria-hidden><Blocks /></span>
        <span>{a.label}</span>
      </button>
      <button className="equip-tile-add" onClick={() => { markRecent(key); addAssembly(a.id); }} title={tr('equip.quickAdd')} aria-label={tr('equip.quickAdd')} data-testid={`quick-asm-${a.id}`}><Plus size={11} /></button>
    </div>
  );
}

/** Tiles of a category (filtered by the search), then its ready-made assemblies; with a `title`, nothing at all when empty. */
export function LibraryTiles({ items, query, group, title }: { items: LibraryItem[]; query: string; group?: LibraryGroup; title?: string }) {
  const tr = useT();
  const q = fold(query.trim());
  const shown = q ? items.filter((x) => fold(librarySearchText(x)).includes(q)) : items;
  const asm = ASSEMBLIES.filter((a) => a.group === group && (!q || fold(a.label).includes(q)));
  if (!shown.length && !asm.length) return title ? null : <p className="scene-hint">{q ? tr('build.none', { q: query.trim() }) : tr('build.empty')}</p>;
  return (
    <>
      {title && <h3 className="equip-subhead">{title}</h3>}
      <div className="scene-library">{shown.map((item) => <EquipTile key={item.id} item={item} />)}</div>
      {asm.length > 0 && (
        <>
          <h3 className="equip-subhead">{tr('equip.assemblies')}</h3>
          <div className="scene-library">{asm.map((a) => <AssemblyTile key={a.id} a={a} />)}</div>
        </>
      )}
    </>
  );
}

const resolve = (id: string): ReactNode => {
  if (id.startsWith('assembly:')) { const a = ASSEMBLIES.find((x) => `assembly:${x.id}` === id); return a ? <AssemblyTile key={id} a={a} /> : null; }
  const item = LIBRARY.find((x) => x.id === id);
  return item ? <EquipTile key={id} item={item} /> : null;
};

/** Whole-library search (instant, accent-insensitive, tags included) with favourites and recent items when empty. */
export function LibraryHome({ children }: { children: ReactNode }) {
  const tr = useT();
  const [query, setQuery] = useState('');
  const { fav, recent } = useLibraryPrefs();
  const q = fold(query.trim());
  const results = useMemo(() => (q ? LIBRARY.filter((x) => fold(librarySearchText(x)).includes(q)) : []), [q]);
  const asm = q ? ASSEMBLIES.filter((a) => fold(a.label).includes(q)) : [];
  return (
    <div className="equip-home">
      <input className="input" type="search" placeholder={tr('equip.searchAll')} aria-label={tr('equip.searchAria')} value={query} onChange={(e) => setQuery(e.target.value)} data-testid="lib-search-all" />
      {q ? (
        <section data-testid="lib-results">
          <h3 className="equip-subhead">{tr('equip.results', { n: results.length + asm.length })}</h3>
          {results.length + asm.length ? (
            <div className="scene-library">{results.map((x) => <EquipTile key={x.id} item={x} />)}{asm.map((a) => <AssemblyTile key={a.id} a={a} />)}</div>
          ) : <p className="scene-hint">{tr('equip.noResults', { q: query.trim() })}</p>}
        </section>
      ) : (
        <>
          {fav.length > 0 && <section data-testid="lib-favorites"><h3 className="equip-subhead"><Star size={12} /> {tr('equip.favorites')}</h3><div className="scene-library">{fav.map(resolve)}</div></section>}
          {recent.length > 0 && <section data-testid="lib-recent"><h3 className="equip-subhead"><Clock size={12} /> {tr('equip.recent')}</h3><div className="scene-library">{recent.map(resolve)}</div></section>}
          {children}
        </>
      )}
    </div>
  );
}
