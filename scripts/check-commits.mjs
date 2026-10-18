// Rejects commit subjects that are not Conventional Commits, e.g. "up".
// Usage: node scripts/check-commits.mjs <base-ref> [head-ref]
import { execFileSync } from 'node:child_process';

const TYPES = ['feat', 'fix', 'perf', 'refactor', 'test', 'docs', 'build', 'ci', 'chore', 'style', 'revert'];
const PATTERN = new RegExp(`^(${TYPES.join('|')})(\\([\\w./-]+\\))?!?: .{3,100}$`, 'u');

export function checkSubject(subject) {
  if (subject.startsWith('Merge ')) return true;
  return PATTERN.test(subject);
}

// History before the rule existed (18/10/2026) is not checked.
const LEGACY_TIP = 'f2e77db766059d483e8cfb7f51ff459d9955c58c';

function hasCommit(ref) {
  try {
    execFileSync('git', ['cat-file', '-e', `${ref}^{commit}`], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

const [base, head = 'HEAD'] = process.argv.slice(2);
if (base) {
  const out = execFileSync('git', ['log', '--format=%h %s', `${base}..${head}`, ...(hasCommit(LEGACY_TIP) ? [`^${LEGACY_TIP}`] : [])], { encoding: 'utf8' });
  const bad = out.split('\n').filter(Boolean).filter((line) => !checkSubject(line.slice(line.indexOf(' ') + 1)));
  if (bad.length > 0) {
    console.error('Commits hors format Conventional Commits (voir CONTRIBUTING.md) :');
    for (const line of bad) console.error(`  ${line}`);
    process.exit(1);
  }
  console.log('Messages de commit conformes.');
}
