// @vitest-environment jsdom
import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { AssistantPanel } from '../../src/renderer/features/settings/AssistantPanel';
import { DEFAULT_DIRECTOR_PROMPT } from '../../src/core/ai/prompts';
import { defaultSettings, settingsSchema, type Settings } from '../../src/core/settings/settings';

let latest: Settings['assistant'];
function Host() {
  const [a, setA] = useState(defaultSettings().assistant);
  latest = a;
  return <AssistantPanel value={a} onChange={(v) => setA({ ...a, ...v })} />;
}

describe('Paramètres › Assistant', () => {
  it('montre le prompt par défaut, le modifie, le rétablit et règle nom et voix', () => {
    render(<Host />);
    const director = screen.getByTestId<HTMLTextAreaElement>('assistant-director-prompt');
    expect(director.value).toBe(DEFAULT_DIRECTOR_PROMPT);
    expect(screen.getByTestId<HTMLButtonElement>('assistant-director-prompt-reset').disabled).toBe(true);

    fireEvent.change(director, { target: { value: 'Tu es un éclairagiste de théâtre.' } });
    fireEvent.change(screen.getByTestId('assistant-name'), { target: { value: 'Nova' } });
    fireEvent.change(screen.getByTestId('assistant-voice'), { target: { value: 'Kore' } });
    expect(screen.getByTestId<HTMLInputElement>('assistant-auto-apply').checked).toBe(false);
    fireEvent.click(screen.getByTestId('assistant-auto-apply'));
    expect(latest).toMatchObject({ name: 'Nova', voice: 'Kore', directorPrompt: 'Tu es un éclairagiste de théâtre.', autoApply: true });
    expect(settingsSchema.safeParse({ assistant: latest }).success).toBe(true); // what « Enregistrer » sends

    fireEvent.click(screen.getByTestId('assistant-director-prompt-reset'));
    expect(latest.directorPrompt).toBeNull();
    expect(screen.getByTestId<HTMLTextAreaElement>('assistant-director-prompt').value).toBe(DEFAULT_DIRECTOR_PROMPT);
  });
});
