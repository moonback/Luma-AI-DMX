import type { Project } from '../model/schemas';
import { ProfileLibrary, channelCount } from './profiles';

/** One row of the printable patch sheet, sorted by universe then address. */
export interface PatchRow {
  name: string;
  manufacturer: string;
  model: string;
  mode: string;
  universe: number;
  address: number;
  lastChannel: number;
  channels: number;
  groups: string;
  tags: string;
  position: string;
  height: number;
  notes: string;
}

export function patchRows(project: Project): PatchRow[] {
  const lib = new ProfileLibrary(project.profiles);
  return project.patch
    .map((f) => {
      const profile = lib.get(f.profileId);
      const n = profile ? channelCount(profile, f.mode) : 0;
      return {
        name: f.name,
        manufacturer: profile?.manufacturer ?? '',
        model: profile?.name ?? `profil inconnu (${f.profileId})`,
        mode: f.mode,
        universe: f.universe,
        address: f.address,
        lastChannel: f.address + Math.max(1, n) - 1,
        channels: n,
        groups: project.groups.filter((g) => g.fixtureIds.includes(f.id)).map((g) => g.name).join(', '),
        tags: f.tags.join(', '),
        position: `${f.position.x.toFixed(1)} ; ${f.position.y.toFixed(1)}`,
        height: f.height,
        notes: f.notes,
      };
    })
    .sort((a, b) => a.universe - b.universe || a.address - b.address);
}

const COLUMNS: [keyof PatchRow, string][] = [
  ['universe', 'Univers'], ['address', 'Adresse'], ['lastChannel', 'Fin'], ['channels', 'Canaux'], ['name', 'Nom'],
  ['manufacturer', 'Fabricant'], ['model', 'Modèle'], ['mode', 'Mode'], ['groups', 'Groupes'], ['tags', 'Tags'],
  ['position', 'Position X ; Y (m)'], ['height', 'Hauteur (m)'], ['notes', 'Notes'],
];

/**
 * CSV for spreadsheets: « ; » separator and a UTF-8 BOM so that Excel in French opens it with the right columns
 * and accents. Cells starting with = + - @ are prefixed with ' (no formula injection from fixture names or notes).
 */
export function patchSheetCsv(project: Project): string {
  const cell = (v: string | number) => {
    let s = String(v);
    if (/^[=+\-@\t\r]/u.test(s)) s = `'${s}`;
    return /[;"\n\r]/u.test(s) ? `"${s.replace(/"/gu, '""')}"` : s;
  };
  const lines = [COLUMNS.map(([, h]) => h).join(';'), ...patchRows(project).map((r) => COLUMNS.map(([k]) => cell(r[k])).join(';'))];
  return `﻿${lines.join('\r\n')}\r\n`;
}

const esc = (s: string | number) => String(s).replace(/[&<>"]/gu, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** Self-contained printable HTML (A4 landscape), turned into a PDF by the main process. */
export function patchSheetHtml(project: Project, generatedAt = new Date()): string {
  const rows = patchRows(project);
  const universes = [...new Set(rows.map((r) => r.universe))];
  const body = universes.map((u) => {
    const list = rows.filter((r) => r.universe === u);
    const used = list.reduce((n, r) => n + r.channels, 0);
    return `<h2>Univers ${u} <small>${list.length} projecteur(s) · ${used}/512 canaux</small></h2>
<table><thead><tr>${COLUMNS.filter(([k]) => k !== 'universe').map(([, h]) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>
${list.map((r) => `<tr>${COLUMNS.filter(([k]) => k !== 'universe').map(([k]) => `<td>${esc(r[k])}</td>`).join('')}</tr>`).join('\n')}
</tbody></table>`;
  }).join('\n');
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Feuille de patch — ${esc(project.meta.name)}</title><style>
@page{size:A4 landscape;margin:12mm}body{font:10px system-ui,sans-serif;color:#111}h1{font-size:16px;margin:0}
.meta{color:#555;margin:2px 0 10px}h2{font-size:12px;margin:14px 0 4px;break-after:avoid}h2 small{font-weight:normal;color:#555}
table{border-collapse:collapse;width:100%}th,td{border:1px solid #bbb;padding:2px 4px;text-align:left;vertical-align:top}
th{background:#eee}tr{break-inside:avoid}td:nth-child(-n+3){font-variant-numeric:tabular-nums;white-space:nowrap}
</style></head><body><h1>Feuille de patch — ${esc(project.meta.name)}</h1>
<div class="meta">${esc(project.meta.show || '')} ${project.meta.show ? '· ' : ''}${rows.length} projecteur(s) · généré le ${esc(generatedAt.toLocaleString('fr-FR'))}</div>
${rows.length ? body : '<p>Aucun projecteur patché.</p>'}
</body></html>`;
}
