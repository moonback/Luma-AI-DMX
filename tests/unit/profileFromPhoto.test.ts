import { describe, expect, it, vi } from 'vitest';
import { parsePhotoProfile, profileFromPhotoWithOpenRouter } from '../../src/core/ai/profileFromPhoto';

describe('profil depuis une photo du manuel', () => {
  it('répare la réponse sans jamais retirer de canal', () => {
    const { profile, dropped } = parsePhotoProfile({
      summary: 'Lyre 2 modes',
      manufacturer: 'Acme', name: 'Spot 60', type: 'moving-head-spot',
      modes: [
        { name: '9ch', channels: [
          { name: 'Pan', attribute: 'pan', fine: false, default: 128, ranges: [] },
          { name: 'Pan fine', attribute: 'pan', fine: true, default: 0, ranges: [] },
          { name: 'Strobe', attribute: 'shutter', fine: false, default: 0, ranges: [{ from: 0, to: 9, label: 'Fermé', kind: 'closed' }, { from: 300, to: 10, label: 'Strobe', kind: 'strobe' }] },
          { name: 'Strobe 2', attribute: 'shutter', fine: false, default: 0, ranges: [] }, // doublon
          { name: 'Auto Programme', attribute: 'Auto Program', fine: true, default: 999, ranges: [] }, // inconnu, fin sans principal
          { name: 'Reset', attribute: 'control', fine: false, default: 0, ranges: [{ from: 250, to: 255, label: 'Reset', kind: 'reset' }, { from: 'x', to: 3 }] },
          {}, // canal illisible
        ] },
        { name: '9ch', channels: [{ name: 'Dimmer', attribute: 'dimmer', fine: false, default: 0, ranges: [] }] },
        { name: 'vide', channels: [] },
      ],
    });
    expect(profile).not.toBeNull();
    const m = profile!.modes[0]!;
    expect(m.channels).toHaveLength(7);
    expect(m.channels.map((c) => [c.attribute, c.fine])).toEqual([
      ['pan', false], ['pan', true], ['shutter', false], ['custom:strobe-2', false], ['custom:auto-program', false], ['control', false], ['custom:canal-7', false],
    ]);
    expect(m.channels[2]!.ranges.map((r) => [r.from, r.to])).toEqual([[0, 9], [10, 255]]);
    expect(m.channels[4]!.default).toBe(255);
    expect(m.channels[5]!.ranges[0]).toMatchObject({ kind: 'reset', dangerous: true });
    expect(profile!.modes.map((x) => x.name)).toEqual(['9ch', '9ch (2)']);
    expect(profile!.id).toBe('photo-acme-spot-60');
    expect(dropped).toBe(2); // une plage illisible + un mode vide
  });

  it('renvoie null sans tableau lisible', () => {
    expect(parsePhotoProfile({ summary: 'Photo floue', modes: [] }).profile).toBeNull();
    expect(parsePhotoProfile(null).profile).toBeNull();
  });

  it('envoie toutes les pages comme images', async () => {
    const answer = { summary: 'ok', manufacturer: 'A', name: 'Par', type: 'par', modes: [{ name: '3ch', channels: [{ name: 'R', attribute: 'red', fine: false, default: 0, ranges: [] }] }] };
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ model: 'v/vision', choices: [{ message: { content: JSON.stringify(answer) } }] })));
    const r = await profileFromPhotoWithOpenRouter(['data:image/jpeg;base64,AAAA', 'data:image/jpeg;base64,BBBB'], { apiKey: 'sk-or-v1-x', model: 'v/vision', effort: 'low', timeoutMs: 5000, fetchImpl: fetchImpl as unknown as typeof fetch });
    const body = JSON.parse((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.messages[1].content.slice(1)).toEqual([
      { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,AAAA' } },
      { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,BBBB' } },
    ]);
    expect(r.profile?.modes[0]?.channels[0]?.attribute).toBe('red');
  });
});
