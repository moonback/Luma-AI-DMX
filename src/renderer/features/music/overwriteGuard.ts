import { act } from '../../api';
import { t } from '../../i18n';
import { confirmAction, useStore } from '../../store';

/** A section label only shapes the plan: the show changes once the section (or the show) is regenerated. */
export function notifyRelabeled(): void {
  useStore.getState().toast({ kind: 'info', title: t('music.relabeled'), detail: t('music.relabeledHint') });
}

/** Before regenerating a track's show: asks for confirmation when its generated objects were edited by hand. */
export async function confirmOverwrite(trackId: string): Promise<boolean> {
  const r = await act({ type: 'music.generatedEdited', trackId });
  if (!r?.edited) return true;
  return confirmAction({ title: t('music.editedConfirm.title'), message: t('music.editedConfirm.message'), confirmLabel: t('music.editedConfirm.ok') });
}
