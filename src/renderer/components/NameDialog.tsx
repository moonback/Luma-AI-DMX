import { useState } from 'react';
import { useStore } from '../store';
import { useT } from '../i18n';
import { act, newId } from '../api';
import { Field, Modal } from './ui';
import type { Group } from '../../core/model/schemas';

const GROUP_COLORS = ['#8B5CF6', '#22D3EE', '#F59E0B', '#34D399', '#F472B6', '#60A5FA'];

export function NameDialog({ title, initial, onSubmit, onClose, children }: { title: string; initial: string; onSubmit: (name: string) => void; onClose: () => void; children?: React.ReactNode }) {
  const tr = useT();
  const [name, setName] = useState(initial);
  const ok = () => { if (name.trim()) { onSubmit(name.trim()); onClose(); } };
  return (
    <Modal title={title} onClose={onClose} footer={<><button className="btn" onClick={onClose}>{tr('common.cancel')}</button><button className="btn primary" onClick={ok}>{tr('prog.validate')}</button></>}>
      <div className="col">
        <Field label={tr('prog.name')}><input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && ok()} /></Field>
        {children}
      </div>
    </Modal>
  );
}

/** The one group create / edit dialog, shared by Live Console, Simple Console and Library. */
export function GroupDialog({ group, fixtureIds, onClose }: { group?: Group; fixtureIds: string[]; onClose: () => void }) {
  const tr = useT();
  const groups = useStore((s) => s.project!.project.groups);
  const [color, setColor] = useState(group?.color ?? GROUP_COLORS[groups.length % GROUP_COLORS.length]!);
  const submit = async (name: string) => {
    const r = await act({ type: 'group.upsert', group: { id: group?.id ?? newId(), name, color: color.toUpperCase(), fixtureIds: group?.fixtureIds ?? fixtureIds } });
    if (r && !group) useStore.getState().toast({ kind: 'success', title: tr('console.group.created', { name }), detail: tr('console.group.createdDetail') });
  };
  return (
    <NameDialog title={group ? tr('prog.editGroup') : tr('prog.newGroup')} initial={group?.name ?? tr('console.group.defaultName', { n: groups.length + 1 })} onClose={onClose} onSubmit={(name) => void submit(name)}>
      <Field label={tr('prog.groupColor')}><input type="color" value={color} onChange={(e) => setColor(e.target.value)} /></Field>
    </NameDialog>
  );
}
