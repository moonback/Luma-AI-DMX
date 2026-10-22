import type { SongAnalysis, ShowPlan } from '../model/schemas';

export interface ArtisticQualityReport {
  score: number; // 0..100 global score
  metrics: {
    contrast: number;     // 0..100: dynamic contrast between calm and peak moments
    variety: number;      // 0..100: diversity of looks, movements and effects
    narrative: number;    // 0..100: global narrative arc (intro exposition, climax, outro)
    vocalClarity: number; // 0..100: respect of singer focus and vocal presence
  };
  notices: string[];
  summary: string;
}

/**
 * Evaluates the artistic quality, narrative arc and aesthetic balance of a ShowPlan.
 * Implementation of Phase 3 artistic quality audit (recommendations from output.md).
 */
export function evaluateArtisticQuality(
  plan: ShowPlan,
  analysis: SongAnalysis,
): ArtisticQualityReport {
  const sections = plan.sections;
  const notices: string[] = [];

  if (!sections.length) {
    return {
      score: 0,
      metrics: { contrast: 0, variety: 0, narrative: 0, vocalClarity: 0 },
      notices: ['Le plan ne contient aucune section'],
      summary: 'Show vide',
    };
  }

  // 1. Dynamic contrast (0..100)
  const energies = sections.map((s) => s.energy);
  const minE = Math.min(...energies);
  const maxE = Math.max(...energies);
  const range = maxE - minE;
  let contrast = Math.min(100, Math.round((range / 4) * 100));

  if (range <= 1 && sections.length > 2) {
    notices.push('Manque de contraste dynamique : l’énergie reste quasi-constante tout au long du show');
    contrast = Math.max(20, contrast - 30);
  } else if (range >= 3) {
    notices.push('Excellent contraste dynamique entre passages calmes et temps forts');
  }

  // 2. Variety & Monotony check (0..100)
  const uniqueMovements = new Set(sections.map((s) => s.movement)).size;
  const uniqueEffects = new Set(sections.map((s) => s.effect)).size;
  const uniquePalettes = new Set(sections.map((s) => s.palette.join(','))).size;

  let variety = Math.min(
    100,
    Math.round(((uniqueMovements / 3) * 0.35 + (uniqueEffects / 3) * 0.35 + (uniquePalettes / 2) * 0.3) * 100),
  );

  // Check monotony: same effect on 3+ consecutive sections
  let repeatEffect = 1;
  for (let i = 1; i < sections.length; i++) {
    if (sections[i]!.effect !== 'none' && sections[i]!.effect === sections[i - 1]!.effect) {
      repeatEffect++;
      if (repeatEffect >= 3) {
        notices.push(`Effet « ${sections[i]!.effect} » répété sur ${repeatEffect} sections consécutives`);
        variety = Math.max(30, variety - 15);
      }
    } else {
      repeatEffect = 1;
    }
  }

  // 3. Narrative arc (0..100)
  let narrative = 80;
  const first = sections[0]!;
  const last = sections[sections.length - 1]!;
  const peakSections = sections.filter((_, i) => {
    const l = analysis.sections[i]?.label;
    return l === 'chorus' || l === 'drop';
  });

  // Intro should not immediately expose max energy
  if (first.energy >= 5 && sections.length > 2) {
    narrative -= 20;
    notices.push('L’intro démarre à énergie maximale sans installer d’atmosphère préalable');
  } else {
    narrative += 10;
  }

  // Outro should resolve gracefully
  if (last.energy <= 2) {
    narrative += 10;
  }

  // Peaks should be noticeably stronger than verse
  if (peakSections.length > 0) {
    const avgPeakE = peakSections.reduce((s, p) => s + p.energy, 0) / peakSections.length;
    const verseSections = sections.filter((_, i) => analysis.sections[i]?.label === 'verse');
    if (verseSections.length > 0) {
      const avgVerseE = verseSections.reduce((s, v) => s + v.energy, 0) / verseSections.length;
      if (avgPeakE <= avgVerseE) {
        narrative -= 25;
        notices.push('Les refrains ne se détachent pas suffisamment des couplets en énergie');
      }
    }
  }

  narrative = Math.max(10, Math.min(100, narrative));

  // 4. Vocal clarity (0..100)
  let vocalClarity = 90;
  const sungSections = sections.filter((_, i) => analysis.sections[i]?.hasVocals);
  if (sungSections.length > 0) {
    // Sung sections should keep singers visible or have moderate movement
    const erraticSung = sungSections.filter((s) => s.movement === 'ballyhoo' || s.movement === 'random');
    if (erraticSung.length > 0) {
      vocalClarity -= 20;
      notices.push('Mouvements très agités pendant des passages chantés (risque pour la lisibilité vocale)');
    }
  }
  vocalClarity = Math.max(20, Math.min(100, vocalClarity));

  // Global weighted score
  const score = Math.round(contrast * 0.3 + variety * 0.25 + narrative * 0.3 + vocalClarity * 0.15);

  const summary = score >= 80
    ? 'Direction artistique remarquable : show narratif, contrasté et lisible'
    : score >= 60
      ? 'Direction artistique solide avec bon équilibre global'
      : 'Show fonctionnel mais nécessitant plus de relief ou de variété';

  return {
    score,
    metrics: { contrast, variety, narrative, vocalClarity },
    notices,
    summary,
  };
}
