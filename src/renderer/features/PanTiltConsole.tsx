/**
 * Console Simplifiée — vue débutant.
 * - Tuiles cliquables : clic = sélectionner/désélectionner, Maj+clic = plage, double-clic = ouvrir le modal
 * - Sélection multiple : toutes les actions du modal s'appliquent à TOUTES les machines sélectionnées
 * - Gestion des groupes : créer, sélectionner, supprimer directement depuis cette vue
 */
import { useRef, useState } from 'react';
import { Crosshair, Eraser, SlidersHorizontal } from 'lucide-react';
import { useStore } from '../store';
import { useT } from '../i18n';
import { act } from '../api';
import { Empty, PageHead, useResolved } from '../components/ui';
import type { ResolvedFixture } from '../../core/fixtures/profiles';
import { FixtureTile } from './pantilt/FixtureTile';
import { GroupsPanel } from './pantilt/GroupsPanel';
import { SelectionModal } from './pantilt/SelectionModal';

// ─── Page ─────────────────────────────────────────────────────────────────────
export function PanTiltConsole() {
  const tr = useT();
  const { fixtures, byId } = useResolved();
  const [picked, setSelIds] = useState<string[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const lastClicked = useRef<string | null>(null);

  const allIds = fixtures.map((rf) => rf.fixture.id);
  // Une machine supprimée du patch sort de la sélection (et du compteur).
  const selIds = picked.filter((id) => allIds.includes(id));
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

  const openSingle = (id: string) => { setSelIds([id]); setModalOpen(true); };
  const openModal = () => { if (selIds.length > 0) setModalOpen(true); };
  const closeModal = () => setModalOpen(false);

  const selectedFixtures = selIds
    .map((id) => byId.get(id))
    .filter((rf): rf is ResolvedFixture => !!rf);

  return (
    <div className="page">
      <PageHead title={tr('pantilt.title')} subtitle={tr('pantilt.subtitle')}>
        <button className="btn ghost sm" onClick={() => setSelIds(allIds)}>Tout sélectionner</button>
        <button className="btn ghost sm" onClick={() => setSelIds([])} disabled={selIds.length === 0}>Désélectionner</button>
        <button className="btn primary" disabled={selIds.length === 0} onClick={openModal}>
          <SlidersHorizontal size={14} />
          Régler {selIds.length > 0 ? `(${selIds.length})` : ''}
        </button>
        {moverIds.length > 0 && (
          <button className="btn" onClick={() =>
            void act({ type: 'programmer.set', fixtureIds: moverIds, values: { pan: 0.5, tilt: 0.5 }, confirmSpecial: false })
          }>
            <Crosshair size={14} /> {tr('pantilt.centerAll')}
          </button>
        )}
        <button className="btn" disabled={allIds.length === 0}
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
            onSelectGroup={(ids) => setSelIds(ids)}
          />

          {/* ── Zone principale : tuiles ── */}
          <div className="sc-main">
            {selIds.length > 0 && (
              <div className="sc-sel-bar">
                <span className="small">
                  <strong>{selIds.length}</strong> machine{selIds.length > 1 ? 's' : ''} sélectionnée{selIds.length > 1 ? 's' : ''}
                </span>
                <button className="btn primary sm" onClick={openModal}>
                  <SlidersHorizontal size={13} /> Ouvrir les réglages
                </button>
              </div>
            )}
            <div className="sc-tile-grid">
              {fixtures.map((rf) => (
                <FixtureTile
                  key={rf.fixture.id}
                  rf={rf}
                  selected={selIds.includes(rf.fixture.id)}
                  onToggle={(range) => toggle(rf.fixture.id, range)}
                  onOpen={() => openSingle(rf.fixture.id)}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {modalOpen && selectedFixtures.length > 0 && (
        <SelectionModal selected={selectedFixtures} onClose={closeModal} />
      )}
    </div>
  );
}
