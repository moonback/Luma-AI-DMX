// Publishes the GitHub release for the version in package.json: checks, installer build, tag, upload.
// Usage: bump "version" in package.json, commit, then `npm run release` (`-- --dry-run` stops before publishing).
// Needs the GitHub CLI logged in (`gh auth login`). A version with a suffix (0.5.0-beta.1) goes out as a pre-release.
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const REPO = 'moonback/Luma-AI-DMX';
const dryRun = process.argv.includes('--dry-run');
// Pre-releases only: an unsigned installer, or no E2E run (both refused for a stable release, which auto-updates users).
const allowUnsigned = process.argv.includes('--allow-unsigned');
const skipE2e = process.argv.includes('--skip-e2e');
const run = (cmd) => execSync(cmd, { stdio: 'inherit' });
const out = (cmd) => execSync(cmd, { encoding: 'utf8' }).trim();
const fail = (msg) => {
  console.error(`\n✖ ${msg}`);
  process.exit(1);
};

const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
const tag = version; // Existing tags are 0.2.0, 0.3.0…: no "v" prefix.
const prerelease = version.includes('-');

if (out('git status --porcelain')) fail('Arbre de travail non propre : commite ou range tes changements.');
if (out('git branch --show-current') !== 'master') fail('La release se fait depuis master.');
let released = true;
try {
  execSync(`gh release view ${tag} --repo ${REPO}`, { stdio: 'ignore' });
} catch {
  released = false;
}
if (released) fail(`La release ${tag} existe déjà : passe "version" de package.json à la suivante.`);

console.log(`\n▶ Release ${tag}${prerelease ? ' (pré-release, canal bêta)' : ''}\n`);
if (!prerelease && (allowUnsigned || skipE2e)) fail('--allow-unsigned et --skip-e2e sont réservés aux pré-releases.');
const signed = !!process.env.CSC_LINK;
if (!signed && !allowUnsigned) fail('Signature de code requise : définissez CSC_LINK et CSC_KEY_PASSWORD (ou --allow-unsigned pour une pré-release).');

run('npm run typecheck');
run('npm run lint');
run('npm run test:coverage');
if (!skipE2e) run('npm run test:e2e');
run('npm run package');

// GitHub replaces spaces in asset names, so artifactName in electron-builder.yml must stay space-free.
const updateFile = prerelease ? 'beta.yml' : 'latest.yml';
const files = [`Luma-AI-DMX-Setup-${version}.exe`, `Luma-AI-DMX-Setup-${version}.exe.blockmap`, updateFile];
if (signed) {
  // The updater installs this binary on every machine: check the Authenticode signature really is there and valid.
  const status = out(`powershell -NoProfile -Command "(Get-AuthenticodeSignature 'release/${files[0]}').Status"`);
  if (status !== 'Valid') fail(`Signature de l’installeur invalide (${status}).`);
}
for (const f of files) if (!existsSync(`release/${f}`)) fail(`Fichier manquant : release/${f}`);
// The update file must describe this build, or the updater downloads a mismatching installer.
if (!readFileSync(`release/${updateFile}`, 'utf8').includes(`version: ${version}`)) fail(`${updateFile} ne correspond pas à ${version}.`);

const create = `gh release create ${tag} ${files.map((f) => `"release/${f}"`).join(' ')} --repo ${REPO} --title V${version} --generate-notes ${prerelease ? '--prerelease' : '--latest'}`;
if (dryRun) {
  console.log(`\n✔ Tout est prêt. Sans --dry-run, le script lancerait :\n  git push origin master\n  ${create}`);
  process.exit(0);
}
run('git push origin master');
run(create); // Also creates the tag on the remote master tip.
console.log(`\n✔ Publié : https://github.com/${REPO}/releases/tag/${tag}`);
