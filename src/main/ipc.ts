import { UserError, type AppService } from '../core/app/AppService';
import { commandSchema } from '../shared/commands';

/*
 * The trust boundary between the renderer and the services, kept free of Electron so it is unit-tested:
 * origin check, schema validation, and which errors reach the user as is.
 */

/** Only the app's own pages may send commands or navigate: the dev server in development, local files once packaged. */
export function isTrustedSender(url: string, devUrl: string | undefined): boolean {
  if (devUrl) return url.startsWith(devUrl);
  return url.startsWith('file://');
}

export type IpcReply = { ok: true; data: unknown } | { ok: false; error: string };

/** One `luma:cmd` call: refused origin, invalid command (3 issues at most), user error shown as is, internal error logged. */
export async function handleCommand(service: Pick<AppService, 'execute' | 'logger'>, raw: unknown, senderUrl: string, devUrl: string | undefined): Promise<IpcReply> {
  if (!isTrustedSender(senderUrl, devUrl)) return { ok: false, error: 'Origine non autorisée' };
  const parsed = commandSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: `Commande invalide : ${parsed.error.issues.slice(0, 3).map((i) => `${i.path.join('.')} ${i.message}`).join(' ; ')}` };
  try {
    return { ok: true, data: await service.execute(parsed.data) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!(err instanceof UserError)) service.logger.error('IPC', `${parsed.data.type} : ${message}`);
    return { ok: false, error: message };
  }
}

/** MA Fixture Share window: MA Lighting pages (the share, its sign-in) stay inside; anything else opens in the system browser. */
export function isFixtureShareUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && (u.hostname === 'malighting.com' || u.hostname.endsWith('.malighting.com'));
  } catch {
    return false;
  }
}
