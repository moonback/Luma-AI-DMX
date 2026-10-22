import { vi } from 'vitest';
import { defaultSettings, settingsSchema } from '../../src/core/settings/settings';
import { DEFAULT_DIRECTOR_PROMPT, DEFAULT_VOICE_PROMPT, voicePrompt } from '../../src/core/ai/prompts';
import { proposeWithOpenRouter } from '../../src/core/ai/providers/openrouter';

/* Paramètres › Assistant: name, voice and custom system instructions. */

describe('réglages de l’assistant', () => {
  it('valeurs par défaut, et un ancien fichier sans section assistant reste valide', () => {
    expect(defaultSettings().assistant).toEqual({ name: 'Luma', voice: 'Puck', directorPrompt: null, voicePrompt: null });
    expect(settingsSchema.parse({ ai: { provider: 'local' } }).assistant.name).toBe('Luma');
  });

  it('un texte vide revient aux instructions par défaut ; une voix inconnue est refusée', () => {
    expect(settingsSchema.parse({ assistant: { directorPrompt: '   ', voicePrompt: 'Sois bref.' } }).assistant).toMatchObject({ directorPrompt: null, voicePrompt: 'Sois bref.' });
    expect(settingsSchema.safeParse({ assistant: { voice: 'Robot' } }).success).toBe(false);
  });

  it('le prompt vocal commence par le nom, puis le texte personnalisé ou celui par défaut', () => {
    expect(voicePrompt('Nova', null)).toMatch(/^Tu t'appelles Nova\./);
    expect(voicePrompt('Nova', null)).toContain(DEFAULT_VOICE_PROMPT);
    expect(voicePrompt('Nova', 'Sois bref.')).toContain('Sois bref.');
    expect(voicePrompt('Nova', 'Sois bref.')).not.toContain(DEFAULT_VOICE_PROMPT);
  });

  it('OpenRouter reçoit les instructions personnalisées, toujours suivies du format JSON', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: '{"understanding":"ok","actions":[]}' } }] }), { status: 200 }));
    const system = async (instructions?: string | null) => {
      fetchImpl.mockClear();
      await proposeWithOpenRouter('monte', '{}', { apiKey: 'k', model: 'a/b', effort: 'low', timeoutMs: 5000, fetchImpl: fetchImpl as unknown as typeof fetch, instructions });
      const init = (fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1];
      return (JSON.parse(String(init.body)) as { messages: { content: string }[] }).messages[0]!.content;
    };
    const custom = await system('Tu es un éclairagiste de théâtre.');
    expect(custom.startsWith('Tu es un éclairagiste de théâtre.')).toBe(true);
    expect(custom).not.toContain(DEFAULT_DIRECTOR_PROMPT);
    expect(custom).toMatch(/Answer with ONE JSON object only[\s\S]*Rig description:/);
    expect((await system(null)).startsWith(DEFAULT_DIRECTOR_PROMPT)).toBe(true);
  });
});
