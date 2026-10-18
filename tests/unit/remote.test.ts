import { defaultSettings } from '../../src/core/settings/settings';
import { AUTH_FAILURES_MAX, RemoteLimiter } from '../../src/core/control/remote';
import { makeService } from '../helpers';

describe('télécommande HTTP', () => {
  it('jeton obligatoire, commandes de show seulement, état poussé en SSE', async () => {
    const { svc } = makeService();
    await svc.init();
    const s = svc.getSettings();
    const token = s.control.remote.token!;
    expect(token.length).toBeGreaterThanOrEqual(16);
    const port = 19000 + Math.floor(Math.random() * 1000);
    await svc.execute({ type: 'settings.update', settings: { ...s, control: { ...s.control, remote: { ...s.control.remote, enabled: true, port, token } } } });
    const base = `http://127.0.0.1:${port}`;
    const post = (body: unknown) => fetch(`${base}/cmd?t=${token}`, { method: 'POST', body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, json: (await r.json()) as { ok: boolean; error?: string } }));

    expect((await fetch(`${base}/`)).status).toBe(403);
    expect((await fetch(`${base}/?t=${token}x`)).status).toBe(403);
    // The URL token is swapped for an HttpOnly cookie and stripped from the address bar.
    const login = await fetch(`${base}/?t=${token}`, { redirect: 'manual' });
    expect(login.status).toBe(303);
    expect(login.headers.get('location')).toBe('/');
    const cookie = login.headers.get('set-cookie')!.split(';')[0]!;
    expect(login.headers.get('set-cookie')).toMatch(/HttpOnly/);
    const page = await fetch(`${base}/`, { headers: { cookie } });
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain('Télécommande');
    expect(html).not.toContain('?t=');
    expect((await fetch(`${base}/cmd`, { method: 'POST', headers: { cookie }, body: JSON.stringify({ type: 'engine.master', value: 0.5 }) })).status).toBe(200);

    expect((await post({ type: 'engine.master', value: 0.4 })).json.ok).toBe(true);
    expect(svc.engine.master).toBeCloseTo(0.4);
    expect((await post({ type: 'engine.blackout', on: true })).json.ok).toBe(true);
    expect(svc.engine.blackout).toBe(true);
    expect((await post({ type: 'cue.go', list: 1 })).status).toBe(200);
    expect((await post({ type: 'cue.go', list: 9 })).json.error).toMatch(/introuvable/);
    expect((await post({ type: 'output.arm', id: 'virtual-1', confirmed: true })).json.error).toMatch(/non autorisée/);
    expect((await post({ type: 'project.new', name: 'x' })).json.error).toMatch(/non autorisée/);
    expect((await post({ type: 'output.transmit', on: false })).json.ok).toBe(true);
    expect(svc.outputs.transmitting).toBe(false);
    expect((await post({ type: 'output.transmit', on: true })).json.error).toMatch(/régie/);
    expect(svc.outputs.transmitting).toBe(false);
    expect((await fetch(`${base}/cmd?t=bad`, { method: 'POST', body: '{}' })).status).toBe(403);

    const ctrl = new AbortController();
    const res = await fetch(`${base}/events?t=${token}`, { signal: ctrl.signal });
    const first = new TextDecoder().decode((await res.body!.getReader().read()).value);
    const state = JSON.parse(first.replace(/^data: /, '')) as { blackout: boolean; transmitting: boolean; lists: unknown[] };
    expect(state).toMatchObject({ blackout: true, transmitting: false });
    expect(state.lists.length).toBe(svc.getProject().cueLists.length);
    ctrl.abort();

    await svc.execute({ type: 'settings.update', settings: { ...defaultSettings(), control: { ...s.control, remote: { ...s.control.remote, enabled: false, port, token } } } });
    await expect(fetch(`${base}/?t=${token}`)).rejects.toThrow();
    await svc.dispose();
  });

  it('écoute sur l’interface choisie seulement', async () => {
    const { svc } = makeService();
    await svc.init();
    const s = svc.getSettings();
    const port = 20000 + Math.floor(Math.random() * 1000);
    await svc.execute({ type: 'settings.update', settings: { ...s, control: { ...s.control, remote: { ...s.control.remote, enabled: true, port, bind: '127.0.0.1' } } } });
    expect(svc.remote.port).toBe(port);
    expect((await fetch(`http://127.0.0.1:${port}/`)).status).toBe(403);
    await svc.dispose();
  });
});

describe('limiteur de la télécommande', () => {
  it('bloque une adresse après trop de jetons faux, puis la libère', () => {
    let now = 0;
    const l = new RemoteLimiter(() => now);
    for (let i = 0; i < AUTH_FAILURES_MAX; i++) l.fail('10.0.0.9');
    expect(l.blocked('10.0.0.9')).toBe(true);
    expect(l.blocked('10.0.0.8')).toBe(false);
    now += 61_000;
    expect(l.blocked('10.0.0.9')).toBe(false);
  });

  it('limite le débit des commandes par client', () => {
    let now = 0;
    const l = new RemoteLimiter(() => now);
    let accepted = 0;
    for (let i = 0; i < 200; i++) if (l.takeCommand('a')) accepted++;
    expect(accepted).toBe(60);
    now += 1000;
    expect(l.takeCommand('a')).toBe(true);
    expect(l.takeCommand('b')).toBe(true);
  });
});
