const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u;

function getSectionBody(changelog, title) {
  const lines = changelog.split(/\r?\n/u);
  const index = lines.findIndex((line) => line.startsWith('## [') && line.includes(']') && line.slice(4, line.indexOf(']')) === title);
  if (index < 0) return null;
  const end = lines.findIndex((line, i) => i > index && line.startsWith('## '));
  return lines.slice(index + 1, end < 0 ? undefined : end).join('\n').trim();
}

/** Pure validation: no Git, filesystem, or network side effects. */
export function validateReleaseMetadata({ version, changelog, existingTags = [] }) {
  const errors = [];
  if (typeof version !== 'string' || !SEMVER.test(version)) {
    errors.push('Version SemVer invalide : ' + String(version) + '.');
    return errors;
  }
  if (existingTags.includes(version)) errors.push('Le tag Git ' + version + ' existe déjà.');
  if (changelog.split(/\r?\n/u).some((line) => line.startsWith('## [' + version + ']'))) {
    errors.push('Le changelog contient déjà une section pour ' + version + '.');
  }
  const body = getSectionBody(changelog, 'Non publié');
  if (body === null) {
    errors.push('Section « [Non publié] » absente du CHANGELOG.md.');
  } else if (!/^### (?:Ajouté|Modifié|Corrigé|Sécurité|Déprécié|Supprimé)\s*$/mu.test(body) || !/^[-*] .+/mu.test(body)) {
    errors.push('La section « [Non publié] » est vide ou ne contient aucune note catégorisée.');
  }
  return errors;
}