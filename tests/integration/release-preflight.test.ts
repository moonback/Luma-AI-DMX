import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { hasRemoteTag, validateReleaseMetadata } from '../../scripts/release-validation.mjs';

const roots: string[] = [];
const changelog = '# Changelog\n\n## [Non publié]\n\n### Ajouté\n- Une fonctionnalité.\n';

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function createRepository(): { root: string } {
  const root = mkdtempSync(join(tmpdir(), 'luma-release-preflight-'));
  roots.push(root);
  const remote = join(root, 'remote.git');
  const local = join(root, 'working');
  mkdirSync(local);
  git(root, 'init', '--bare', remote);
  git(local, 'init');
  git(local, 'config', 'user.name', 'Luma Release Test');
  git(local, 'config', 'user.email', 'release-test@example.invalid');
  writeFileSync(join(local, 'README.md'), 'release test\n');
  git(local, 'add', 'README.md');
  git(local, 'commit', '-m', 'test fixture');
  git(local, 'remote', 'add', 'origin', remote);
  return { root: local };
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('release preflight with a temporary Git repository', () => {
  it('detects a local tag and refuses a duplicate release version', () => {
    const { root } = createRepository();
    git(root, 'tag', '1.9.0');
    const localTags = git(root, 'tag', '--list').split(/\r?\n/u).filter(Boolean);
    expect(localTags).toContain('1.9.0');
    expect(validateReleaseMetadata({ version: '1.9.0', changelog, existingTags: localTags }))
      .toContain('Le tag Git 1.9.0 existe déjà.');
  });

  it('detects a tag published on origin before release creation', () => {
    const { root } = createRepository();
    git(root, 'tag', '1.9.0');
    git(root, 'push', 'origin', 'refs/tags/1.9.0');
    expect(hasRemoteTag('1.9.0', (tag) => git(root, 'ls-remote', '--tags', 'origin', 'refs/tags/' + tag))).toBe(true);
    expect(hasRemoteTag('2.0.0', (tag) => git(root, 'ls-remote', '--tags', 'origin', 'refs/tags/' + tag))).toBe(false);
    expect(readFileSync(join(root, 'README.md'), 'utf8')).toContain('release test');
  });
});