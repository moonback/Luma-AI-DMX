import { act } from '../../api';
import { t } from '../../i18n';
import { confirmAction } from '../../store';

/** Before regenerating a track's show: asks for confirmation when its generated objects were edited by hand. */
export async function confirmOverwrite(trackId: string): Promise<boolean> {
  const r = await act({ type: 'music.generatedEdited', trackId });
  if (!r?.edited) return true;
  return confirmAction({ title: t('music.editedConfirm.title'), message: t('music.editedConfirm.message'), confirmLabel: t('music.editedConfirm.ok') });
}
