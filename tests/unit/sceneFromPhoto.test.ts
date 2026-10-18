import { describe, expect, it, vi } from 'vitest';
import { parsePhotoScene, sceneFromPhotoWithOpenRouter } from '../../src/core/ai/sceneFromPhoto';

let n = 0;
const id = () => `id-${++n}`;

describe('scène depuis une photo', () => {
  it('répare et valide la réponse du modèle', () => {
    const s = parsePhotoScene({
      summary: 'Deux ponts et un écran',
      stageWidth: 500, stageDepth: 9,
      trusses: [
        { name: 'Face', shape: 'line', x: 0, y: -1, height: 6.2, length: 12, rotation: 0, support: 'hung' },
        { shape: 'totem', x: -5, y: 2, height: 99 }, // champs manquants, hauteur hors bornes
        { shape: 'hexagon', x: 0, y: 0 }, // forme inconnue → ignorée
      ],
      props: [{ kind: 'speaker', x: 4, y: 0.5, width: 0.6, depth: 0.6, height: 1.2, color: 'red' }],
      screens: [{ x: 0, y: 7, width: 8, height: 4.5, elevation: 2, color: '#112233' }],
    }, id);
    expect(s.stageWidth).toBe(200);
    expect(s.trusses.map((t) => t.shape)).toEqual(['line', 'totem']);
    expect(s.trusses[1]).toMatchObject({ height: 30, support: 'towers', name: 'Structure 2' });
    expect(s.props[0]).toMatchObject({ kind: 'speaker', color: '#2a2f3a', elevation: 0 });
    expect(s.screens[0]).toMatchObject({ source: 'color', color: '#112233', image: null });
    expect(s.dropped).toBe(1);
  });

  it('tolère une réponse vide', () => {
    expect(parsePhotoScene(null, id)).toMatchObject({ trusses: [], props: [], screens: [], stageWidth: 12, stageDepth: 8 });
  });

  it('envoie la photo comme contenu image', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ model: 'v/vision', choices: [{ message: { content: JSON.stringify({ summary: 'ok', stageWidth: 10, stageDepth: 6, trusses: [{ shape: 'line', x: 0, y: 0, height: 5, length: 10, rotation: 0, support: 'towers' }], props: [], screens: [] }) } }] })));
    const r = await sceneFromPhotoWithOpenRouter('data:image/jpeg;base64,AAAA', { apiKey: 'sk-or-v1-x', model: 'v/vision', effort: 'low', timeoutMs: 5000, fetchImpl: fetchImpl as unknown as typeof fetch }, id);
    const body = JSON.parse((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.messages[1].content[1]).toEqual({ type: 'image_url', image_url: { url: 'data:image/jpeg;base64,AAAA' } });
    expect(r.trusses).toHaveLength(1);
  });
});
