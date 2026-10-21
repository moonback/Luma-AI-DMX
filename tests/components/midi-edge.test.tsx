// @vitest-environment jsdom
import { vi } from 'vitest';
import { defaultSettings } from '../../src/core/settings/settings';

const runShortcut = vi.fn(() => true);
vi.mock('../../src/renderer/App', () => ({ runShortcut }));
vi.mock('../../src/renderer/api', () => ({ act: vi.fn(async () => true) }));
const { externalControl } = await import('../../src/renderer/control');

type Handler = (e: { data: Uint8Array }) => void;
const input: { name: string; id: string; onmidimessage: Handler | null } = { name: 'Pad', id: 'in1', onmidimessage: null };
(navigator as unknown as { requestMIDIAccess: unknown }).requestMIDIAccess = async () => ({ inputs: new Map([['in1', input]]), onstatechange: null });

describe('contrôle MIDI', () => {
  it('un CC mappé sur une commande ne déclenche qu’au front montant (pas de rafale de GO quand un fader monte)', async () => {
    const s = defaultSettings();
    await externalControl.configure({ ...s.control, midi: { enabled: true, mappings: [{ key: 'cc:1:20', action: 'go' }] } });
    const cc = (v: number) => input.onmidimessage!({ data: Uint8Array.of(0xb0, 20, v) });
    for (const v of [70, 90, 110, 127]) cc(v); // fader sweep up: one GO, not four
    expect(runShortcut).toHaveBeenCalledTimes(1);
    cc(0);
    cc(127); // button released then pressed again
    expect(runShortcut).toHaveBeenCalledTimes(2);
  });
});
