import { fillTestPattern, signatureValue, WALK_STEP_MS, RAMP_PERIOD_MS } from '../../src/core/engine/testPattern';
import { HardwareSession } from '../../src/core/app/hardware';
import { makeEngine, makeService, run } from '../helpers';

describe('mires de test DMX', () => {
  it('signature : chaque canal porte une valeur lisible sur un testeur', () => {
    const f = new Uint8Array(512);
    fillTestPattern('signature', f, 0);
    expect([f[0], f[1], f[254], f[255], f[256], f[511]]).toEqual([1, 2, 255, 0, 1, 0]);
    expect(f.every((v, i) => v === signatureValue(i + 1))).toBe(true);
  });

  it('balayage : un seul canal à 255, qui avance ; rampe : tous ensemble', () => {
    const f = new Uint8Array(512).fill(9);
    fillTestPattern('walk', f, WALK_STEP_MS * 3 + 1);
    expect(f[3]).toBe(255);
    expect(f.reduce((n, v) => n + (v ? 1 : 0), 0)).toBe(1);
    fillTestPattern('ramp', f, RAMP_PERIOD_MS / 2);
    expect(new Set(f)).toEqual(new Set([255]));
    fillTestPattern('zero', f, 0);
    expect(new Set(f)).toEqual(new Set([0]));
  });

  it('remplace la trame calculée des univers choisis seulement, master et blackout compris', () => {
    const { engine, frames } = makeEngine();
    engine.blackout = true;
    engine.testPattern = { kind: 'signature', universes: [2], startedAt: 0 };
    run(engine, 50);
    const last = frames.at(-1)!;
    expect(last.get(2)![9]).toBe(10);
    expect(last.get(1)![9]).toBe(0); // universe 1 keeps the show: RGBW PAR dimmer (ch 10) at 0 in blackout
    engine.testPattern = null;
    run(engine, 50);
    expect(engine.universes.get(2)!.every((v) => v === 0)).toBe(true);
  });
});

describe('session matériel', () => {
  it('mesure la durée de chaque coupure et la signale au-delà de 10 s', () => {
    const h = new HardwareSession();
    const o = { id: 'an', name: 'Nœud' };
    expect(h.onState(o, 'error', 'ready', 1_000)).toBeNull();
    expect(h.onState(o, 'error', 'error', 2_000)).toBeNull();
    expect(h.onState(o, 'ready', 'error', 4_500)).toBe(3.5);
    h.onState(o, 'error', 'ready', 10_000);
    h.onState(o, 'ready', 'error', 22_000);
    expect(h.reconnects.map((r) => r.seconds)).toEqual([3.5, 12]);
    const md = h.report({
      app: { name: 'Luma AI DMX', version: '1.9.0', platform: 'win32', arch: 'x64', versions: {} },
      metrics: { rateHz: 40, measuredHz: 40, avgTickMs: 0.2, maxTickMs: 1, jitterMs: 0.3, overruns: 0, ticks: 100 } as never,
      outputs: [{ id: 'an', name: 'Nœud', kind: 'artnet', real: true, enabled: true, armed: true, state: 'ready', detail: '', stats: { framesSent: 10, packetsSent: 10, bytesSent: 0, errors: 2, lastError: null, lastErrorAt: null, lastSendAt: null, measuredFps: 40 } }],
      testPattern: null,
    });
    expect(md).toContain('| Nœud | artnet | ready | 10 | 10 | 2 | 40 fps | 2 (12 s ⚠) |');
    expect(md).toContain('- [ ] Reconnexion < 10 s');
  });

  it('commandes : la mire exige une confirmation, n’est pas pilotable à distance, et le rapport la mentionne', async () => {
    const { svc } = makeService();
    await svc.init();
    await expect(svc.execute({ type: 'output.testPattern', pattern: 'walk', universes: [1], confirmed: false })).rejects.toThrow(/Confirmation/);
    await svc.execute({ type: 'output.testPattern', pattern: 'walk', universes: [1], confirmed: true });
    expect(svc.runtimeState().testPattern).toEqual({ kind: 'walk', universes: [1] });
    const { markdown } = await svc.execute({ type: 'hardware.report' });
    expect(markdown).toContain('walk (U1)');
    await svc.execute({ type: 'output.testPattern', pattern: null, universes: [1], confirmed: false });
    expect(svc.runtimeState().testPattern).toBeNull();
    const { validateRemoteCommand } = await import('../../src/core/control/remote');
    expect(validateRemoteCommand({ type: 'output.testPattern', pattern: 'signature', confirmed: true }, () => undefined)).toMatch(/non autorisée/);
    await svc.dispose();
  });
});
