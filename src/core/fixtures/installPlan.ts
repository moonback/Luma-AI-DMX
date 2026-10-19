import type { Fixture, FixtureProfile, Project } from '../model/schemas';
import { validatePatch } from './patch';
import { ProfileLibrary, channelCount } from './profiles';

/** Circuit 230 V / 16 A chargé à 80 % : base des estimations de circuits (Europe). */
export const CIRCUIT_WATTS = 230 * 16 * 0.8;
/** Marge de longueur de câble DMX (coudes, descentes). */
const CABLE_MARGIN = 1.1;

export interface PlanOutput {
  name: string;
  kind: string;
  enabled: boolean;
}

const esc = (s: string | number) => String(s).replace(/[&<>"]/gu, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const fmt = (n: number, digits = 0) => n.toLocaleString('fr-FR', { maximumFractionDigits: digits, minimumFractionDigits: digits });

const OUTPUT_LABELS: Record<string, string> = {
  virtual: 'Sortie virtuelle (simulation)',
  artnet: 'Art-Net (Ethernet)',
  sacn: 'sACN (Ethernet)',
  'enttec-pro': 'Interface USB DMX',
};

/** Projecteurs accrochés (ou posés) : même règle que la vue 3D — absent ou « auto » = suspendu, sauf sol sous 1 m. */
export function mountOf(f: Fixture): 'hanging' | 'floor' | 'wall' {
  if (f.mount === 'hanging' || f.mount === 'floor' || f.mount === 'wall') return f.mount;
  return f.height >= 1 ? 'hanging' : 'floor';
}

/** Longueur indicative d'une guirlande DMX : projecteurs de l'univers dans l'ordre des adresses, en 3D. */
export function cableMeters(list: readonly Fixture[]): number {
  const sorted = [...list].sort((a, b) => a.address - b.address);
  let m = 0;
  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i - 1]!;
    const b = sorted[i]!;
    m += Math.hypot(b.position.x - a.position.x, b.position.y - a.position.y, b.height - a.height);
  }
  return m * CABLE_MARGIN;
}

interface MaterialLine {
  profile?: FixtureProfile;
  profileId: string;
  mode: string;
  qty: number;
  channels: number;
}

/** Plan d'installation complet (HTML imprimable A4) : matériel, alimentation, câblage, accroche, contrôles, mise en service. */
export function installPlanHtml(project: Project, outputs: readonly PlanOutput[], generatedAt = new Date()): string {
  const lib = new ProfileLibrary(project.profiles);
  const patch = project.patch;
  const active = outputs.filter((o) => o.enabled);
  const channelsOf = (f: Fixture) => {
    const p = lib.get(f.profileId);
    return p ? channelCount(p, f.mode) : 0;
  };

  // Matériel : une ligne par couple profil + mode.
  const materials = new Map<string, MaterialLine>();
  for (const f of patch) {
    const key = `${f.profileId}\u0000${f.mode}`;
    const line = materials.get(key) ?? { profile: lib.get(f.profileId), profileId: f.profileId, mode: f.mode, qty: 0, channels: channelsOf(f) };
    line.qty++;
    materials.set(key, line);
  }
  const lines = [...materials.values()].sort((a, b) => (a.profile?.name ?? a.profileId).localeCompare(b.profile?.name ?? b.profileId));

  // Alimentation et poids : les profils sans donnée sont comptés à part pour être signalés.
  const withPower = patch.filter((f) => lib.get(f.profileId)?.physical.power !== undefined);
  const totalWatts = patch.reduce((n, f) => n + (lib.get(f.profileId)?.physical.power ?? 0), 0);
  const totalKg = patch.reduce((n, f) => n + (lib.get(f.profileId)?.physical.weight ?? 0), 0);
  const circuits = totalWatts > 0 ? Math.ceil(totalWatts / CIRCUIT_WATTS) : 0;

  // Câblage par univers.
  const universes = [...new Set(patch.map((f) => f.universe))].sort((a, b) => a - b);
  const cableRows = universes.map((u) => {
    const list = patch.filter((f) => f.universe === u);
    return { u, count: list.length, used: list.reduce((n, f) => n + channelsOf(f), 0), meters: cableMeters(list) };
  });
  const totalCable = cableRows.reduce((n, r) => n + r.meters, 0);

  // Accroche et sorties.
  const mounts = patch.map(mountOf);
  const hanging = mounts.filter((m) => m === 'hanging').length;
  const network = active.some((o) => o.kind === 'artnet' || o.kind === 'sacn');
  const usb = active.filter((o) => o.kind === 'enttec-pro').length;

  const warnings: string[] = [
    ...validatePatch(lib, patch).map((i) => i.message),
    ...(patch.length > withPower.length ? [`${patch.length - withPower.length} projecteur(s) sans puissance renseignée dans leur profil : bilan électrique incomplet.`] : []),
    ...(patch.some((f) => lib.get(f.profileId)?.fictional) ? ['Profils fictifs de démonstration présents : remplacer par les profils réels avant achat.'] : []),
  ];

  const table = (head: string[], rows: string[][]) => `<table><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>
${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('\n')}
</tbody></table>`;

  const materialRows = lines.map((l) => {
    const p = l.profile;
    const name = p ? `${esc(p.manufacturer)} ${esc(p.name)}${p.fictional ? ' <i>(fictif)</i>' : ''}` : `profil inconnu (${esc(l.profileId)})`;
    const dim = p?.physical.dimensions;
    return [
      name,
      esc(l.mode),
      String(l.qty),
      String(l.channels),
      String(l.qty * l.channels),
      p?.physical.power !== undefined ? fmt(p.physical.power * l.qty) : '–',
      p?.physical.weight !== undefined ? fmt(p.physical.weight * l.qty, 1) : '–',
      p?.physical.connector ? esc(p.physical.connector) : '–',
      dim ? `${fmt(dim.width, 2)} × ${fmt(dim.height, 2)} × ${fmt(dim.depth, 2)}` : '–',
    ];
  });

  const fixtureRows = [...patch]
    .sort((a, b) => a.universe - b.universe || a.address - b.address)
    .map((f) => [
      esc(f.name),
      String(f.universe),
      String(f.address),
      esc(f.mode),
      `${fmt(f.position.x, 1)} ; ${fmt(f.position.y, 1)}`,
      `${fmt(f.height, 1)} m`,
      { hanging: 'Suspendu', floor: 'Au sol', wall: 'Mural' }[mountOf(f)],
      `${fmt(f.rotation)}°`,
    ]);

  const accessories: string[][] = [
    ['Élingue de sécurité (1 par projecteur suspendu)', String(hanging)],
    ['Serre-joint / clamp pour accroche (1 par projecteur suspendu)', String(hanging)],
    ['Câble secteur (1 par projecteur)', String(patch.length)],
    ['Câble DMX XLR 3 broches (longueur indicative, +10 %)', `${fmt(Math.ceil(totalCable))} m`],
    ['Connecteur de terminaison DMX 120 Ω (1 par univers)', String(universes.length)],
    ...(network ? [['Switch Ethernet non géré et câbles RJ45', '1']] : []),
    ...(usb ? [['Interface USB DMX (sortie enttec-pro)', String(usb)]] : []),
    ['Ruban adhésif, colliers, étiquettes de patch', '–'],
  ];

  const checklist = [
    'Contrôler le matériel livré contre le tableau « Matériel » (quantités, modes, accessoires).',
    'Préparer les structures et les élingues de sécurité avant l’accroche ; une élingue par projecteur suspendu.',
    'Accrocher ou poser chaque projecteur à la position indiquée, en respectant la rotation et la hauteur du tableau « Patch et accroche ».',
    'Poser les circuits d’alimentation selon le tableau « Alimentation » ; ne pas dépasser 80 % de la charge d’un circuit.',
    'Câbler chaque univers en guirlande (daisy chain) dans l’ordre des adresses ; éviter les étoiles et les dérivations longues.',
    'Terminer chaque univers par une résistance 120 Ω sur le dernier projecteur.',
    'Relier la sortie DMX (interface USB ou switch Art-Net / sACN) ; une adresse IP distincte par interface réseau.',
    'Mettre sous tension par groupes, puis vérifier que chaque projecteur répond à son adresse du patch.',
    'Tester tous les projecteurs (rouge, vert, bleu, pan, tilt, strobe) avec le test pattern de l’application, puis régler les modes.',
    'Enregistrer le projet et exporter la feuille de patch dans le dossier du spectacle.',
  ];

  const section = (title: string, body: string) => `<section><h2>${title}</h2>${body}</section>`;

  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Plan d’installation — ${esc(project.meta.name)}</title><style>
@page{size:A4;margin:12mm}body{font:11px system-ui,sans-serif;color:#111}h1{font-size:18px;margin:0}
.meta{color:#555;margin:2px 0 10px}h2{font-size:13px;margin:16px 0 6px;break-after:avoid;border-bottom:1px solid #999}
table{border-collapse:collapse;width:100%;margin-bottom:6px}th,td{border:1px solid #bbb;padding:3px 5px;text-align:left;vertical-align:top}
th{background:#eee}tr{break-inside:avoid}td{font-variant-numeric:tabular-nums}.kpi{display:flex;gap:10px;flex-wrap:wrap;margin:6px 0}
.kpi div{border:1px solid #bbb;border-radius:4px;padding:4px 8px}.kpi b{font-size:14px;display:block}.warn{color:#8a4b00}ol li{margin:3px 0}
</style></head><body>
<h1>Plan d’installation — ${esc(project.meta.name)}</h1>
<div class="meta">${esc(project.meta.show || '')}${project.meta.show ? ' · ' : ''}généré le ${esc(generatedAt.toLocaleString('fr-FR'))}</div>
${section('1. Résumé', `<div class="kpi">
<div><b>${patch.length}</b>projecteur(s)</div>
<div><b>${universes.length}</b>univers</div>
<div><b>${fmt(cableRows.reduce((n, r) => n + r.used, 0))}</b>canaux DMX</div>
<div><b>${fmt(totalWatts)} W</b>puissance totale</div>
<div><b>${circuits}</b>circuit(s) 16 A / 230 V</div>
<div><b>${fmt(totalKg, 1)} kg</b>poids total</div>
<div><b>${fmt(Math.ceil(totalCable))} m</b>câble DMX</div>
</div>
<p>Sorties : ${active.length ? active.map((o) => `${esc(o.name)} (${esc(OUTPUT_LABELS[o.kind] ?? o.kind)})`).join(', ') : 'aucune sortie active'}.</p>`)}
${section('2. Contrôles avant installation', warnings.length ? `<ul class="warn">${warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>` : '<p>Aucun problème détecté dans le patch.</p>')}
${section('3. Matériel à commander', patch.length ? table(['Projecteur', 'Mode', 'Qté', 'Canaux / unité', 'Canaux total', 'Puissance (W)', 'Poids (kg)', 'Connecteur', 'Dimensions (m)'], materialRows) : '<p>Aucun projecteur patché.</p>')}
${section('4. Alimentation', `<p>Puissance totale : <b>${fmt(totalWatts)} W</b>. Circuits 16 A / 230 V à 80 % (≈ ${fmt(CIRCUIT_WATTS)} W par circuit) : <b>${circuits}</b> circuit(s) minimum, à répartir par groupe.</p>
<p>Les puissances viennent des profils : vérifier la fiche technique réelle du matériel.</p>`)}
${section('5. Câblage DMX', table(['Univers', 'Projecteurs', 'Canaux utilisés', 'Libres', 'Longueur indicative (m)'], cableRows.map((r) => [String(r.u), String(r.count), `${r.used} / 512`, String(512 - r.used), fmt(Math.ceil(r.meters))])))}
${section('6. Accroche et patch', patch.length ? table(['Projecteur', 'Univ.', 'Adresse', 'Mode', 'Position x ; y (m)', 'Hauteur', 'Montage', 'Rotation'], fixtureRows) : '<p>Aucun projecteur.</p>')}
${section('7. Accessoires à prévoir', table(['Élément', 'Quantité'], accessories))}
${section('8. Procédure de mise en service', `<ol>${checklist.map((c) => `<li>${esc(c)}</li>`).join('')}</ol>`)}
</body></html>`;
}
