import { useState } from 'react';
import { Award, ChevronDown, ChevronUp, Sparkles, AlertCircle } from 'lucide-react';
import { useT } from '../../i18n';
import type { SongAnalysis, ShowPlan } from '../../../core/model/schemas';
import { evaluateArtisticQuality, type ArtisticQualityReport } from '../../../core/music/artisticQuality';

interface Props {
  plan?: ShowPlan | null;
  analysis: SongAnalysis;
}

export function ArtisticQualityBadge({ plan, analysis }: Props) {
  const t = useT();
  const [expanded, setExpanded] = useState(false);

  if (!plan) return null;

  const report: ArtisticQualityReport = evaluateArtisticQuality(plan, analysis);
  const { score, metrics, notices } = report;

  const scoreBadgeColor =
    score >= 80 ? 'cyan' : score >= 60 ? 'violet' : score >= 40 ? 'amber' : 'red';

  return (
    <div className="artistic-quality-card col" data-testid="artistic-quality-card">
      <div
        className="row clickable"
        style={{ justifyContent: 'space-between', alignItems: 'center', gap: 12 }}
        onClick={() => setExpanded(!expanded)}
      >
        <div className="row" style={{ alignItems: 'center', gap: 8 }}>
          <Sparkles size={16} style={{ color: '#22d3ee' }} />
          <span className="small bold">{t('music.studio.qualityTitle')}</span>
          <span className={`badge ${scoreBadgeColor}`}>
            <Award size={12} style={{ marginRight: 4 }} />
            {score}/100
          </span>
        </div>
        <button
          className="btn ghost sm icon"
          title={expanded ? t('nav.collapse') : t('nav.expand')}
        >
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>

      {expanded && (
        <div className="col" style={{ gap: 8, marginTop: 8 }}>
          <div className="grid g2" style={{ gap: 8 }}>
            <div className="col" style={{ gap: 3 }}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span className="small dim">{t('music.studio.contrast')}</span>
                <span className="small mono">{metrics.contrast}%</span>
              </div>
              <div className="meter"><div style={{ width: `${metrics.contrast}%` }} /></div>
            </div>
            <div className="col" style={{ gap: 3 }}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span className="small dim">{t('music.studio.variety')}</span>
                <span className="small mono">{metrics.variety}%</span>
              </div>
              <div className="meter"><div style={{ width: `${metrics.variety}%` }} /></div>
            </div>
            <div className="col" style={{ gap: 3 }}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span className="small dim">{t('music.studio.narrative')}</span>
                <span className="small mono">{metrics.narrative}%</span>
              </div>
              <div className="meter"><div style={{ width: `${metrics.narrative}%` }} /></div>
            </div>
            <div className="col" style={{ gap: 3 }}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span className="small dim">{t('music.studio.vocalClarity')}</span>
                <span className="small mono">{metrics.vocalClarity}%</span>
              </div>
              <div className="meter"><div style={{ width: `${metrics.vocalClarity}%` }} /></div>
            </div>
          </div>

          {notices.length > 0 && (
            <div className="col" style={{ gap: 4, marginTop: 4 }}>
              {notices.map((n, i) => (
                <div key={i} className="row small" style={{ gap: 6, color: '#fcd34d' }}>
                  <AlertCircle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
                  <span>{n}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
