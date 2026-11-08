import { Check } from 'lucide-react';
import type { MusicTrack } from '../../../core/model/schemas';
import { useT } from '../../i18n';

export const SHOW_STEPS = ['track', 'intent', 'show', 'play'] as const;
export type ShowStep = (typeof SHOW_STEPS)[number];

/** Where the user stands in the Song to Show flow: no track → import; no plan → intent; plan → retouch; playing → play. */
export function currentShowStep(track: Pick<MusicTrack, 'id' | 'plan'> | null, playingTrackId: string | null): ShowStep {
  if (!track) return 'track';
  if (playingTrackId === track.id && track.plan) return 'play';
  return track.plan ? 'show' : 'intent';
}

/** Light stepper over the page: nothing is hidden, it highlights the current step and jumps to its panel. */
export function ShowStepper({ current, onPick }: { current: ShowStep; onPick: (step: ShowStep) => void }) {
  const t = useT();
  const at = SHOW_STEPS.indexOf(current);
  return (
    <ol className="show-stepper" aria-label={t('music.steps.label')} data-testid="music-stepper">
      {SHOW_STEPS.map((id, i) => (
        <li key={id} className={i === at ? 'current' : i < at ? 'done' : ''}>
          <button type="button" onClick={() => onPick(id)} aria-current={i === at ? 'step' : undefined} data-testid={`music-step-${id}`}>
            <span className="show-stepper-n">{i < at ? <Check size={12} /> : i + 1}</span>
            <span className="col" style={{ alignItems: 'flex-start' }}>
              <b>{t(`music.steps.${id}`)}</b>
              {i === at && <span className="small dim">{t(`music.steps.${id}.hint`)}</span>}
            </span>
          </button>
        </li>
      ))}
    </ol>
  );
}
