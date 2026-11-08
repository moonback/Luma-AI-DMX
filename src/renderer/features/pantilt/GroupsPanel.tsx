import { useState } from 'react';
import { Plus, Trash2, Users } from 'lucide-react';
import { useStore } from '../../store';
import { act } from '../../api';
import { GroupDialog } from '../../components/NameDialog';

// ─── Panneau de gestion des groupes ──────────────────────────────────────────
export function GroupsPanel({
  selIds,
  onSelectGroup,
}: {
  selIds: string[];
  onSelectGroup: (ids: string[]) => void;
}) {
  const groups = useStore((s) => s.project!.project.groups);
  const [creating, setCreating] = useState(false);

  // Un groupe est "actif" si toutes ses machines sont dans la sélection
  const isGroupActive = (fixtureIds: string[]) =>
    fixtureIds.length > 0 && fixtureIds.every((id) => selIds.includes(id));

  const toggleGroup = (fixtureIds: string[]) => {
    if (isGroupActive(fixtureIds)) {
      // Désactiver : retirer les machines du groupe de la sélection
      onSelectGroup(selIds.filter((id) => !fixtureIds.includes(id)));
    } else {
      // Activer : ajouter les machines du groupe à la sélection
      const merged = [...new Set([...selIds, ...fixtureIds])];
      onSelectGroup(merged);
    }
  };

  const removeGroup = async (id: string, name: string) => {
    await act({ type: 'group.remove', id });
    useStore.getState().toast({ kind: 'info', title: `Groupe « ${name} » supprimé` });
  };

  return (
    <div className="sc-groups-panel">
      <div className="sc-groups-header">
        <span className="small muted" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Users size={13} /> Groupes
        </span>
        <button
          className="btn ghost sm"
          disabled={selIds.length === 0}
          title={selIds.length === 0 ? 'Sélectionnez des machines d\'abord' : 'Créer un groupe avec la sélection'}
          onClick={() => setCreating(true)}
        >
          <Plus size={12} /> Nouveau groupe
        </button>
      </div>

      {/* Formulaire de création */}
      {creating && <GroupDialog fixtureIds={selIds} onClose={() => setCreating(false)} />}

      {/* Liste des groupes existants */}
      {groups.length === 0 ? (
        <span className="small muted" style={{ padding: '4px 0' }}>Aucun groupe — sélectionnez des machines et cliquez « Nouveau groupe »</span>
      ) : (
        <div className="sc-groups-list">
          {groups.map((g) => (
            <div key={g.id} className="sc-group-row">
              <button
                className={`sc-group-btn ${isGroupActive(g.fixtureIds) ? 'sc-group-btn--on' : ''}`}
                style={{ borderLeft: `3px solid ${g.color}` }}
                onClick={() => toggleGroup(g.fixtureIds)}
                title={isGroupActive(g.fixtureIds) ? 'Cliquer pour désélectionner' : `Sélectionner le groupe (${g.fixtureIds.length} machines)`}
              >
                <span className="sc-group-name">{g.name}</span>
                <span className="sc-group-count muted small">{g.fixtureIds.length} machines</span>
              </button>
              <button
                className="btn ghost sm icon"
                title="Supprimer ce groupe"
                onClick={() => void removeGroup(g.id, g.name)}
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
