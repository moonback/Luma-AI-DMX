import { useState } from 'react';
import { Plus, Trash2, Users } from 'lucide-react';
import { useStore } from '../../store';
import { act, newId } from '../../api';

const GROUP_COLORS = ['#8B5CF6', '#22D3EE', '#F59E0B', '#34D399', '#F472B6', '#60A5FA'];

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
  const [groupName, setGroupName] = useState('');

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

  const createGroup = async () => {
    if (selIds.length === 0) return;
    const name = groupName.trim() || `Groupe ${groups.length + 1}`;
    const color = GROUP_COLORS[groups.length % GROUP_COLORS.length]!;
    const r = await act({ type: 'group.upsert', group: { id: newId(), name, color, fixtureIds: selIds } });
    if (r) {
      useStore.getState().toast({ kind: 'success', title: `Groupe « ${name} » créé` });
      setCreating(false);
      setGroupName('');
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
          onClick={() => { setGroupName(`Groupe ${groups.length + 1}`); setCreating(true); }}
        >
          <Plus size={12} /> Nouveau groupe
        </button>
      </div>

      {/* Formulaire de création */}
      {creating && (
        <div className="sc-group-create">
          <input
            className="input"
            autoFocus
            value={groupName}
            placeholder="Nom du groupe"
            onChange={(e) => setGroupName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void createGroup();
              if (e.key === 'Escape') setCreating(false);
            }}
          />
          <button className="btn primary sm" onClick={() => void createGroup()}>Créer</button>
          <button className="btn ghost sm" onClick={() => setCreating(false)}>Annuler</button>
        </div>
      )}

      {/* Liste des groupes existants */}
      {groups.length === 0 && !creating ? (
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
