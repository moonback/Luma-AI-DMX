import { suggestIntents } from '../../src/core/music/suggest';
import { parseIntent } from '../../src/core/music/songToShow';
import { suggestIntentsWithOpenRouter } from '../../src/core/ai/providers/openrouter';
import type { SongAnalysis, SongSection } from '../../src/core/model/schemas';

function section(label: SongSection['label'], energy: number, extra: Partial<SongSection> = {}): SongSection {
  return { start: 0, end: 10, label, cluster: 0, energy, brightness: 0.5, density: 1, bassShare: 0.5, ...extra } as SongSection;
}

function song(sections: SongSection[], key: Partial<SongAnalysis['key']> = {}): SongAnalysis {
  return {
    version: 1, duration: 60, bpm: 120, tempoStable: true, beats: [], downbeats: [], events: [],
    sections, key: { tonic: 0, mode: 'major', confidence: 0.1, ...key },
  } as SongAnalysis;
}

describe('suggestIntents', () => {
  it('propose des consignes adaptées au morceau, dans l’ordre de pertinence, sans doublon', () => {
    const s = suggestIntents(song([
      section('intro', 0.2, { bassShare: 0.7 }),
      section('verse', 0.2, { bassShare: 0.7 }),
      section('chorus', 0.9, { bassShare: 0.7, density: 4 }),
      section('drop', 0.9, { bassShare: 0.7, density: 4 }),
    ], { mode: 'minor', confidence: 0.5 }));
    expect(s).toEqual(['couplets sobres', 'refrains explosifs', 'strobe sur les drops', 'lumières sur les basses', 'couleurs froides']);
  });

  it('propose une ambiance calme pour un morceau doux et uniforme, sans contraste ni drop', () => {
    expect(suggestIntents(song([section('verse', 0.2), section('chorus', 0.25)]))).toEqual(['ambiance calme']);
  });

  it('ne propose rien sans sections', () => {
    expect(suggestIntents(song([]))).toEqual([]);
  });

  it('suggestions IA : réponse dédoublonnée, limitée à 5, et refusée si vide', async () => {
    const answer = (suggestions: unknown) => new Response(JSON.stringify({ model: 'm/x', choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ suggestions }) } }] }), { status: 200 });
    const opts = (fetchImpl: typeof fetch) => ({ apiKey: 'k', model: 'm/x', effort: 'low' as const, timeoutMs: 1000, fetchImpl });
    const many = await suggestIntentsWithOpenRouter('', 'structure', opts((async () => answer(['couplets sobres', 'couplets sobres', 'refrains explosifs', 'couleurs froides', 'strobe sur les drops', 'ambiance calme', 'beaucoup de mouvement'])) as unknown as typeof fetch));
    expect(many.suggestions).toEqual(['couplets sobres', 'refrains explosifs', 'couleurs froides', 'strobe sur les drops', 'ambiance calme']);
    await expect(suggestIntentsWithOpenRouter('', 'structure', opts((async () => answer(['  '])) as unknown as typeof fetch))).rejects.toThrow(/exploitable/);
  });

  it('chaque consigne est comprise par parseIntent comme le texte tapé à la main', () => {
    expect(parseIntent('couplets sobres').verseShift).toBe(-1);
    expect(parseIntent('refrains explosifs').peakShift).toBe(1);
    expect(parseIntent('strobe sur les drops').strobe).toBe('want');
    expect(parseIntent('lumières sur les basses').bassFollow).toBe(true);
    expect(parseIntent('couleurs froides').warmth).toBe('cold');
    expect(parseIntent('couleurs chaudes').warmth).toBe('warm');
    expect(parseIntent('beaucoup de mouvement').moreMovement).toBe(true);
    expect(parseIntent('ambiance calme').globalShift).toBe(-1);
  });
});
