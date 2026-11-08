import { describe, expect, it } from 'vitest';
import { validateReleaseMetadata } from '../../scripts/release-validation.mjs';

const changelog = '# Changelog\n\n## [Non publié]\n\n### Ajouté\n- Une fonctionnalité.\n\n## [1.8.0] — 2026-10-01\n';

describe('release metadata validation', () => {
  it('accepts a valid stable version with categorized unreleased notes', () => {
    expect(validateReleaseMetadata({ version: '1.9.0', changelog })).toEqual([]);
  });
  it('accepts a valid prerelease SemVer', () => {
    expect(validateReleaseMetadata({ version: '2.0.0-beta.1', changelog })).toEqual([]);
  });
  it('rejects invalid SemVer before release checks', () => {
    expect(validateReleaseMetadata({ version: '01.9.0', changelog })).toContain('Version SemVer invalide : 01.9.0.');
  });
  it('rejects an existing local tag', () => {
    expect(validateReleaseMetadata({ version: '1.9.0', changelog, existingTags: ['1.9.0'] })).toContain('Le tag Git 1.9.0 existe déjà.');
  });
  it('rejects a missing unreleased section', () => {
    expect(validateReleaseMetadata({ version: '1.9.0', changelog: '# Changelog\n' })).toContain('Section « [Non publié] » absente du CHANGELOG.md.');
  });
  it('rejects an empty unreleased section', () => {
    const empty = '# Changelog\n\n## [Non publié]\n\n## [1.8.0]';
    expect(validateReleaseMetadata({ version: '1.9.0', changelog: empty })).toContain('La section « [Non publié] » est vide ou ne contient aucune note catégorisée.');
  });
  it('rejects a version that already has a changelog section', () => {
    const duplicate = changelog + '\n## [1.9.0] — 2026-11-08\n';
    expect(validateReleaseMetadata({ version: '1.9.0', changelog: duplicate })).toContain('Le changelog contient déjà une section pour 1.9.0.');
  });
});