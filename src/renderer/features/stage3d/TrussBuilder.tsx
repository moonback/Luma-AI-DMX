import { useMemo, useState } from 'react';
import { Check, FlipHorizontal2, RotateCw, X } from 'lucide-react';
import type { Project, Truss } from '../../../core/model/schemas';
import type { TrussSystem } from '../../../core/visualizer/connectors';
import { CATEGORY_LABEL, SYSTEM_LABEL, TRUSS_CATALOG, catalogPiece } from '../../../core/visualizer/trussCatalog';
import { assemblyFreeConnectors, billOfMaterials, chainPieces, type Anchor, type ChainSpec } from '../../../core/visualizer/assembly';
import { useT } from '../../i18n';

/**
 * Truss builder (docs/roadmap/truss-builder.md, phase 5): pick a free connector (orange sphere) or start a new
 * structure, pick a piece, rotate / flip / repeat it while its preview hangs in the 3D view, then add it.
 */
export interface BuildState extends Omit<ChainSpec, 'catalogId'> { anchor: Anchor | null; catalogId: string | null }
export const NEW_BUILD: BuildState = { anchor: null, catalogId: null, connIdx: 0, roll: 0, count: 1, vertical: true };
/** Ids of the preview pieces (never saved: the scene gets fresh ids on validation). */
export const GHOST_PREFIX = 'ghost-';
const MAX_REPEAT = 20;

/** Builder opened on a selected assembly piece: anchored on its highest free connector (not the one on the floor). */
export function buildOn(trusses: readonly Truss[], pieceId: string | undefined): BuildState {
  const free = pieceId ? assemblyFreeConnectors(trusses).filter((f) => f.pieceId === pieceId).sort((a, b) => b.connector.pos.z - a.connector.pos.z)[0] : undefined;
  return { ...NEW_BUILD, anchor: free ? { pieceId: free.pieceId, connector: free.connector.id } : null };
}

/** New structures start standing at the middle of the deck. */
const startOf = (vis: Project['visualizer']) => ({ x: 0, y: vis.stageDepth / 2, z: 0 });

/** Scene with the pieces the builder would add, or why they can't be added (used connector, other system…). */
export function buildResult(vis: Project['visualizer'], b: BuildState, ids: readonly string[]): { trusses: Truss[]; next: Anchor | null } | { error: string } {
  if (!b.catalogId) return { trusses: vis.trusses, next: b.anchor };
  try {
    return chainPieces(vis.trusses, b.anchor, { ...b, catalogId: b.catalogId }, ids, startOf(vis));
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
export const ghostIds = (b: BuildState) => Array.from({ length: b.count }, (_, i) => `${GHOST_PREFIX}${i}`);

export function TrussBuilder({ vis, build, setBuild, onAdd, onClose }: {
  vis: Project['visualizer'];
  build: BuildState;
  setBuild: (b: BuildState) => void;
  onAdd: () => void;
  onClose: () => void;
}) {
  const t = useT();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const anchorTruss = build.anchor ? vis.trusses.find((x) => x.id === build.anchor!.pieceId) : undefined;
  // A connector only takes pieces of its own system (the "hide unusable pieces" filter is always on).
  const locked = anchorTruss?.catalogId ? catalogPiece(anchorTruss.catalogId)?.system : undefined;
  const [chosen, setChosen] = useState<TrussSystem>('quatro');
  const system = locked ?? chosen;
  const pieces = useMemo(() => {
    const q = query.trim().toLowerCase();
    return TRUSS_CATALOG.filter((p) => p.system === system && (!category || p.category === category) && (!q || p.label.toLowerCase().includes(q)));
  }, [system, category, query]);
  const result = buildResult(vis, build, ghostIds(build));
  const bom = billOfMaterials(vis.trusses);
  const pick = (catalogId: string) => setBuild({ ...build, catalogId, connIdx: 0, roll: 0 });

  return (
    <aside className="stage3d-inspector truss-builder" aria-label={t('truss.title')} data-testid="truss-builder" onPointerDown={(e) => e.stopPropagation()}>
      <div className="stage3d-inspector-head">
        <span className="stage3d-inspector-title">{t('truss.title')}</span>
        <button className="chip-link" onClick={onClose} aria-label={t('truss.close')} title={t('truss.close')}><X size={12} /></button>
      </div>

      {anchorTruss && build.anchor
        ? (
          <div className="row small" style={{ gap: 6 }}>
            <span className="grow">{t('truss.anchor', { name: anchorTruss.name, c: build.anchor.connector })}</span>
            <button className="btn ghost sm" onClick={() => setBuild({ ...build, anchor: null })} data-testid="truss-restart">{t('truss.restart')}</button>
          </div>
        )
        : (
          <label className="row small" style={{ gap: 6 }}>
            <span className="grow">{t('truss.firstPiece')}</span>
            <input type="checkbox" checked={!!build.vertical} onChange={(e) => setBuild({ ...build, vertical: e.target.checked })} data-testid="truss-upright" />
            {t('truss.upright')}
          </label>
        )}
      <span className="small dim">{t('truss.hint')}</span>

      <label className="row small" style={{ gap: 6 }} title={locked ? t('truss.systemLocked') : undefined}>
        <span className="grow">{t('truss.system')}</span>
        <select className="select" style={{ height: 26 }} value={system} disabled={!!locked} onChange={(e) => setChosen(e.target.value as TrussSystem)} data-testid="truss-system">
          {(Object.keys(SYSTEM_LABEL) as TrussSystem[]).map((s) => <option key={s} value={s}>{SYSTEM_LABEL[s]}</option>)}
        </select>
      </label>
      <div className="chips">
        <button className={`chip ${!category ? 'on' : ''}`} onClick={() => setCategory(null)}>{t('truss.all')}</button>
        {Object.entries(CATEGORY_LABEL).filter(([c]) => TRUSS_CATALOG.some((p) => p.category === c)).map(([c, label]) => (
          <button key={c} className={`chip ${category === c ? 'on' : ''}`} onClick={() => setCategory(c)}>{label}</button>
        ))}
      </div>
      <input className="input" placeholder={t('truss.search')} aria-label={t('truss.search')} value={query} onChange={(e) => setQuery(e.target.value)} data-testid="truss-search" />

      <div className="col truss-builder-list" role="listbox" aria-label={t('truss.title')}>
        {pieces.map((p) => (
          <button key={p.id} role="option" aria-selected={build.catalogId === p.id} className={`btn ghost sm ${build.catalogId === p.id ? 'on' : ''}`} onClick={() => pick(p.id)} data-testid={`truss-piece-${p.id}`}>
            <span className="grow">{p.label}</span>
            <span className="mono dim">{p.weightKg} kg</span>
          </button>
        ))}
        {!pieces.length && <span className="small muted">{t('truss.empty')}</span>}
      </div>

      {build.catalogId && (
        <>
          {'error' in result && <span className="small" style={{ color: 'var(--danger, #ef4444)' }} data-testid="truss-error">{result.error}</span>}
          <div className="row" style={{ gap: 4, flexWrap: 'wrap' }}>
            <button className="btn ghost sm" onClick={() => setBuild({ ...build, roll: build.roll + 1 })} title={t('truss.rotateTitle')} data-testid="truss-rotate"><RotateCw size={12} />{t('truss.rotate')}</button>
            <button className="btn ghost sm" onClick={() => setBuild({ ...build, connIdx: build.connIdx + 1 })} disabled={!build.anchor} title={t('truss.flipTitle')} data-testid="truss-flip"><FlipHorizontal2 size={12} />{t('truss.flip')}</button>
            <label className="row small" style={{ gap: 4 }}>
              {t('truss.repeat')}
              <input type="number" className="input" style={{ width: 52, height: 26 }} min={1} max={MAX_REPEAT} value={build.count} onChange={(e) => setBuild({ ...build, count: Math.max(1, Math.min(MAX_REPEAT, Math.round(Number(e.target.value)) || 1)) })} data-testid="truss-repeat" />
            </label>
          </div>
          <div className="row" style={{ gap: 4 }}>
            <button className="btn sm grow" onClick={onAdd} disabled={'error' in result} title={t('truss.validateTitle')} data-testid="truss-add"><Check size={12} />{t('truss.validate')}</button>
            <button className="btn ghost sm" onClick={() => setBuild({ ...build, catalogId: null })} title={t('truss.cancelTitle')} data-testid="truss-cancel">{t('truss.cancel')}</button>
          </div>
        </>
      )}
      {bom.total > 0 && <span className="small dim" data-testid="truss-total">{t('truss.total', { n: bom.total, kg: bom.weightKg })}</span>}
    </aside>
  );
}
