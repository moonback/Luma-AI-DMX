import { useState } from 'react';
import { ArrowLeftRight, Check, Undo2 } from 'lucide-react';
import { Modal } from '../../components/ui';
import { useT } from '../../i18n';
import type { MusicTrack, ShowSectionPlan } from '../../../core/model/schemas';
import { SECTION_NAMES } from '../../../core/music/analyze';
import { ARTISTIC_STRATEGIES } from '../../../core/music/showPlanner';
import { EFFECT_NAMES, MOVE_NAMES } from './names';

interface Props {
  track: MusicTrack;
  onClose: () => void;
  onRestore: () => Promise<void>;
}

export function VariantCompareModal({ track, onClose, onRestore }: Props) {
  const t = useT();
  const planA = track.plan;
  const planB = track.previousPlan;
  const [busy, setBusy] = useState(false);

  if (!planA || !planB) {
    return (
      <Modal title={t('music.studio.compareAB')} onClose={onClose}>
        <p className="dim small">{t('music.studio.noPrevious')}</p>
      </Modal>
    );
  }

  const stratA = ARTISTIC_STRATEGIES[planA.variant % 5];
  const stratB = ARTISTIC_STRATEGIES[planB.variant % 5];

  const diffCount = planA.sections.filter((secA, i) => {
    const secB = planB.sections[i];
    if (!secB) return true;
    return (
      secA.energy !== secB.energy ||
      secA.movement !== secB.movement ||
      secA.effect !== secB.effect ||
      secA.palette.join(',') !== secB.palette.join(',')
    );
  }).length;

  const handleRestore = async () => {
    setBusy(true);
    await onRestore();
    setBusy(false);
    onClose();
  };

  return (
    <Modal
      wide
      title={t('music.studio.compareAB')}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            <Check size={14} />
            {t('music.studio.applyA')}
          </button>
          <button
            className="btn primary"
            disabled={busy}
            onClick={() => void handleRestore()}
          >
            <Undo2 size={14} />
            {t('music.studio.applyB')}
          </button>
        </>
      }
    >
      <div className="col" style={{ gap: 16 }} data-testid="variant-compare-modal">
        <div className="row" style={{ gap: 12, alignItems: 'stretch' }}>
          {/* Card A */}
          <div className="panel grow col" style={{ gap: 6, flex: 1, padding: 12 }}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <span className="badge cyan">{t('music.studio.planA')}</span>
              {stratA && <span className="small bold">{stratA.label}</span>}
            </div>
            <div className="small dim">{planA.summary || stratA?.desc}</div>
          </div>

          <div className="row" style={{ alignItems: 'center' }}>
            <ArrowLeftRight size={18} className="dim" />
          </div>

          {/* Card B */}
          <div className="panel grow col" style={{ gap: 6, flex: 1, padding: 12 }}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <span className="badge violet">{t('music.studio.planB')}</span>
              {stratB && <span className="small bold">{stratB.label}</span>}
            </div>
            <div className="small dim">{planB.summary || stratB?.desc}</div>
          </div>
        </div>

        <div className="row small dim" style={{ justifyContent: 'space-between' }}>
          <span>{t('music.studio.diffs', { n: diffCount })}</span>
        </div>

        <div className="table-wrap" style={{ maxHeight: 320, overflowY: 'auto' }}>
          <table className="table small">
            <thead>
              <tr>
                <th>#</th>
                <th>{t('music.col.section')}</th>
                <th>{t('music.studio.planA')}</th>
                <th>{t('music.studio.planB')}</th>
              </tr>
            </thead>
            <tbody>
              {track.analysis.sections.map((s, i) => {
                const secA: ShowSectionPlan | undefined = planA.sections[i];
                const secB: ShowSectionPlan | undefined = planB.sections[i];
                if (!secA || !secB) return null;
                const isDiff =
                  secA.energy !== secB.energy ||
                  secA.movement !== secB.movement ||
                  secA.effect !== secB.effect ||
                  secA.palette.join(',') !== secB.palette.join(',');

                return (
                  <tr key={i} className={isDiff ? 'row-diff' : ''}>
                    <td className="mono">{i + 1}</td>
                    <td>{SECTION_NAMES[s.label]}</td>
                    <td>
                      <div className="row wrap" style={{ gap: 4 }}>
                        <span className="mono">E{secA.energy}</span>
                        <span className="music-tag">{MOVE_NAMES[secA.movement]}</span>
                        <span className="music-tag effect">{EFFECT_NAMES[secA.effect]}</span>
                        <div className="row" style={{ gap: 2 }}>
                          {secA.palette.map((c) => (
                            <span key={c} className="music-palette-swatch" style={{ background: c }} />
                          ))}
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="row wrap" style={{ gap: 4 }}>
                        <span className="mono">E{secB.energy}</span>
                        <span className="music-tag">{MOVE_NAMES[secB.movement]}</span>
                        <span className="music-tag effect">{EFFECT_NAMES[secB.effect]}</span>
                        <div className="row" style={{ gap: 2 }}>
                          {secB.palette.map((c) => (
                            <span key={c} className="music-palette-swatch" style={{ background: c }} />
                          ))}
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </Modal>
  );
}
