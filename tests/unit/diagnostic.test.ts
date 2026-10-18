import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { FileLogSink } from '../../src/core/log/fileSink';
import { Logger } from '../../src/core/log/logger';
import { REDACTED, listCrashDumps, redactSecrets } from '../../src/core/log/diagnostic';
import { makeService, tempDir } from '../helpers';

describe('journal persistant', () => {
  it('écrit chaque entrée en JSON lines et tourne par taille', () => {
    const dir = tempDir();
    const logger = new Logger();
    const sink = new FileLogSink(dir, { maxBytes: 400, keep: 2 });
    sink.attach(logger);
    for (let i = 0; i < 20; i++) logger.info('Test', `message ${i}`);
    expect(sink.files()).toEqual(['luma.1.log', 'luma.2.log', 'luma.log']);
    const tail = sink.tail(1000).map((l) => JSON.parse(l) as { message: string });
    expect(tail.at(-1)?.message).toBe('message 19');
    // Order is preserved across rotated files.
    const nums = tail.map((e) => Number(e.message.split(' ')[1]));
    expect(nums).toEqual([...nums].sort((a, b) => a - b));
  });

  it('reprend après un redémarrage sans écraser le fichier', () => {
    const dir = tempDir();
    const a = new Logger();
    new FileLogSink(dir).attach(a);
    a.error('Moteur', 'avant plantage');
    const b = new Logger();
    const sink = new FileLogSink(dir);
    sink.attach(b);
    b.info('Application', 'redémarrage');
    expect(sink.tail().map((l) => (JSON.parse(l) as { message: string }).message)).toEqual(['avant plantage', 'redémarrage']);
  });
});

describe('diagnostic', () => {
  it('masque jetons, clés et paramètres t= dans les URL', () => {
    const out = redactSecrets({ control: { remote: { token: 'abcdef0123456789', port: 8080 } }, apiKey: 'sk-1', logs: ['{"message":"http://10.0.0.2:8080/?t=abcdef0123456789"}'] });
    expect(out.control.remote.token).toBe(REDACTED);
    expect(out.control.remote.port).toBe(8080);
    expect(out.apiKey).toBe(REDACTED);
    expect(out.logs[0]).not.toContain('abcdef0123456789');
  });

  it('liste les minidumps', () => {
    const dir = tempDir();
    mkdirSync(path.join(dir, 'reports'));
    writeFileSync(path.join(dir, 'reports', 'x.dmp'), 'MDMP');
    expect(listCrashDumps(dir).map((d) => d.name)).toEqual([path.join('reports', 'x.dmp')]);
    expect(listCrashDumps(path.join(dir, 'absent'))).toEqual([]);
  });

  it('exporte un fichier sans secret ni contenu du projet', async () => {
    const { svc, dataDir } = makeService();
    await svc.init();
    try {
      svc.logger.error('Test', 'erreur forcée');
      const file = path.join(dataDir, 'diag.json');
      expect(await svc.execute({ type: 'diagnostic.export', path: file })).toEqual({ path: file });
      const text = readFileSync(file, 'utf8');
      const diag = JSON.parse(text) as { format: string; logs: string[]; settings: { control: { remote: { token: string } } } };
      expect(diag.format).toBe('luma-diagnostic');
      expect(diag.settings.control.remote.token).toBe(REDACTED);
      expect(diag.logs.some((l) => l.includes('erreur forcée'))).toBe(true);
      expect(text).not.toContain(svc.getSettings().control.remote.token!);
      expect(existsSync(path.join(dataDir, 'logs', 'luma.log'))).toBe(true);
      expect(await svc.execute({ type: 'diagnostic.export' })).toEqual({ path: null });
    } finally {
      await svc.dispose();
    }
  });
});
