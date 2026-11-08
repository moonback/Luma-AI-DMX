/**
 * Console Simplifiée — vue débutant.
 * - Tuiles cliquables : clic = sélectionner/désélectionner, Maj+clic = plage, double-clic = ouvrir le modal
 * - Sélection multiple : toutes les actions du modal s'appliquent à TOUTES les machines sélectionnées
 * - Gestion des groupes : créer, sélectionner, supprimer directement depuis cette vue
 */
import { useRef, useState } from 'react';
import { Crosshair, Eraser, Lock, MousePointerClick, SlidersHorizontal } from 'lucide-react';
import { useStore, EMPTY_OBJ } from '../store';
import { useT } from '../i18n';
import { act } from '../api';
import { Empty, PageHead, useResolved } from '../components/ui';
import type { ResolvedFixture } from '../../core/fixtures/profiles';
import { FixtureTile } from './pantilt/FixtureTile';
import { GroupsPanel } from './pantilt/GroupsPanel';
import { SelectionModal } from './pantilt/SelectionModal';
import { useTileOrder } from './pantilt/useTileOrder';

// ─── Page ─────────────────────────────────────────────────────────────────────
export function PanTiltConsole() {
  const tr = useT();
  const locked = useStore((s) => s.simpleLocked);
  const programmer = useStore((s) => s.runtime?.programmer ?? EMPTY_OBJ) as Record<string, Record<string, number>>;
  const { fixtures, byId } = useResolved();
  const [picked, setSelIds] = useState<string[]>([]);
  const [selectionMode, setSelectionMode] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const lastClicked = useRef<string | null>(null);

  const { ordered, move } = useTileOrder(fixtures);
  const allIds = ordered.map((rf) => rf.fixture.id);
  // Une machine supprimée du patch sort de la sélection (et du compteur).
  const selIds = picked.filter((id) => allIds.includes(id));
  const heldCount = allIds.filter((id) => Object.keys(programmer[id] ?? {}).length > 0).length;
  const moverIds = fixtures
    .filter((rf) => rf.attributes.includes('pan') || rf.attributes.includes('tilt'))
    .map((rf) => rf.fixture.id);

  /** Clic : bascule la machine ; Maj+clic : ajoute toute la plage depuis le dernier clic. */
  const toggle = (id: string, range = false) => {
    const from = lastClicked.current ? allIds.indexOf(lastClicked.current) : -1;
    lastClicked.current = id;
    if (range && from >= 0) {
      const [a, b] = [from, allIds.indexOf(id)].sort((x, y) => x - y) as [number, number];
      setSelIds((prev) => [...new Set([...prev, ...allIds.slice(a, b + 1)])]);
      return;
    }
    setSelIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  };

  const openSingle = (id: string) => { lastClicked.current = id; setSelIds([id]); setModalOpen(true); };
  const toggleSelectionMode = () => {
    if (selectionMode) {
      setSelectionMode(false);
      setSelIds([]);
      lastClicked.current = null;
      return;
    }
    setSelectionMode(true);
  };
  const openModal = () => { if (selIds.length > 0) setModalOpen(true); };
  const closeModal = () => {
    setModalOpen(false);
    if (!selectionMode) setSelIds([]);
  };

  const selectedFixtures = selIds
    .map((id) => byId.get(id))
    .filter((rf): rf is ResolvedFixture => !!rf);

  return (
    <div className="page">
      {locked && (
        <div className="sc-lock-bar" role="status">
          <Lock size={14} /> <span>{tr('simple.locked')}</span>
          <button className="btn ghost sm" onClick={() => useStore.getState().setPage('dashboard')}>{tr('simple.leave')}</button>
        </div>
      )}
      <PageHead title={tr('pantilt.title')} subtitle={tr('pantilt.subtitle')}>
        <button
          className={`btn sm ${selectionMode ? 'primary' : 'ghost'}`}
          data-testid="pantilt-selection-mode"
          aria-pressed={selectionMode}
          onClick={toggleSelectionMode}
          title={selectionMode ? tr('pantilt.selectionModeExitHint') : tr('pantilt.selectionModeHint')}
        >
          <MousePointerClick size={14} />
          {selectionMode ? tr('pantilt.selectionModeActive') : tr('pantilt.selectionMode')}
        </button>
        {selectionMode && <>
          <button className="btn ghost sm" onClick={() => setSelIds(allIds)}>{tr('pantilt.selectAll')}</button>
          <button className="btn ghost sm" onClick={() => { setSelIds([]); lastClicked.current = null; }} disabled={selIds.length === 0}>{tr('pantilt.clearSelection')}</button>
          <button className="btn primary" disabled={selIds.length === 0} onClick={openModal}>
            <SlidersHorizontal size={14} />
            {tr('pantilt.adjustSelected', { n: selIds.length })}
          </button>
        </>}
        {moverIds.length > 0 && (
          <button className="btn" onClick={() =>
            void act({ type: 'programmer.set', fixtureIds: moverIds, values: { pan: 0.5, tilt: 0.5 }, confirmSpecial: false })
          }>
            <Crosshair size={14} /> {tr('pantilt.centerAll')}
          </button>
        )}
        {heldCount > 0 && (
          <span className="badge cyan" role="status" data-testid="pantilt-held" title={tr('pantilt.heldHint')}>{tr('pantilt.held', { n: heldCount })}</span>
        )}
        <button className="btn" disabled={heldCount === 0} title={tr('pantilt.heldHint')}
          onClick={() => void act({ type: 'programmer.release', fixtureIds: allIds })}>
          <Eraser size={14} /> {tr('pantilt.releaseAll')}
        </button>
      </PageHead>

      {fixtures.length === 0 ? (
        <Empty
          icon={<SlidersHorizontal size={32} />}
          title={tr('pantilt.noMovers')}
          action={
            <button className="btn primary" onClick={() => useStore.getState().setPage('fixtures')}>
              {tr('console.openPatch')}
            </button>
          }
        >
          {tr('pantilt.noMoversHint')}
        </Empty>
      ) : (
        <div className="sc-layout">

          {/* ── Panneau gauche : groupes ── */}
          <GroupsPanel
            selIds={selIds}
            onSelectGroup={(ids) => { setSelectionMode(true); setSelIds(ids); lastClicked.current = null; }}
          />

          {/* ── Zone principale : tuiles ── */}
          <div className={`sc-main ${selectionMode ? 'sc-main--selection' : ''}`}>
            {selectionMode && (
              <div className="sc-mode-bar" role="status">
                <MousePointerClick size={14} />
                <span>{tr('pantilt.selectionHint')}</span>
                <strong>{tr('pantilt.selectedCount', { n: selIds.length })}</strong>
              </div>
            )}
            {selectionMode && selIds.length > 0 && (
              <div className="sc-sel-bar">
                <span className="small">
                  <strong>{selIds.length}</strong> machine{selIds.length > 1 ? 's' : ''} sélectionnée{selIds.length > 1 ? 's' : ''}
                </span>
              </div>
            )}
            <div className="sc-tile-grid">
              {ordered.map((rf, i) => (
                <FixtureTile
                  key={rf.fixture.id}
                  rf={rf}
                  onDropFrom={(from) => move(from, rf.fixture.id)}
                  onNudge={(dir) => { const t = ordered[i + dir]; if (t) move(rf.fixture.id, t.fixture.id); }}
                  selected={selectionMode && selIds.includes(rf.fixture.id)}
                  selectionMode={selectionMode}
                  onToggle={(range) => toggle(rf.fixture.id, range)}
                  onOpen={() => openSingle(rf.fixture.id)}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {modalOpen && selectedFixtures.length > 0 && (
        <SelectionModal
          selected={selectedFixtures}
          onClose={closeModal}
          onRemove={(id) => setSelIds((prev) => prev.filter((x) => x !== id))}
          onStep={(dir) => {
            const next = allIds[(allIds.indexOf(selIds[0]!) + dir + allIds.length) % allIds.length];
            if (next) setSelIds([next]);
          }}
        />
      )}
    </div>
  );
}
