import { settingsSchema } from '../../src/core/settings/settings';
import { translate } from '../../src/renderer/i18n';
import { defaultAt, fold, getAt, isModified, searchSettings, setAt, SETTING_DEFS, TAB_GROUPS } from '../../src/renderer/features/settings/registry';

const defaults = settingsSchema.parse({ appearance: { components: { pages: {}, dashboard: {} } } });

describe('registre des paramètres', () => {
  it('chaque réglage pointe vers une valeur du schéma, dans un onglet existant, sans doublon', () => {
    const tabs = TAB_GROUPS.flatMap((g) => g.tabs);
    for (const d of SETTING_DEFS) {
      expect(getAt(defaults, d.path), d.path).not.toBeUndefined();
      expect(tabs).toContain(d.tab);
    }
    expect(new Set(SETTING_DEFS.map((d) => d.path)).size).toBe(SETTING_DEFS.length);
    // The guards of audit T8 live in the safety tab.
    expect(SETTING_DEFS.filter((d) => d.tab === 'safety').map((d) => d.path).sort()).toEqual(['ai.allowStrobe', 'engine.blackoutPolicy', 'engine.flashGuard', 'engine.maxStrobeHz', 'general.autoArmOnStart']);
  });

  it('compare au défaut du schéma et rétablit sans muter', () => {
    expect(SETTING_DEFS.filter((d) => isModified(defaults, d.path))).toEqual([]);
    const s = setAt(defaults, 'engine.priorities.audio', 70);
    expect(defaults.engine.priorities.audio).toBe(55);
    expect(s.engine.priorities.ai).toBe(60);
    expect(isModified(s, 'engine.priorities.audio')).toBe(true);
    expect(isModified(setAt(s, 'engine.priorities.audio', defaultAt('engine.priorities.audio')), 'engine.priorities.audio')).toBe(false);
    expect(isModified(setAt(defaults, 'ai.monthlyBudget', 20), 'ai.monthlyBudget')).toBe(true); // null default
  });

  it('cherche sans accents ni casse, dans la langue demandée, tous les mots requis', () => {
    expect(fold('Sécurité L’ÉCRAN')).toBe("securite l'ecran");
    const fr = searchSettings('strobe HZ', (k) => translate('fr', k));
    expect(fr.settings.map((d) => d.path)).toEqual(['engine.maxStrobeHz']);
    expect(searchSettings('securite', (k) => translate('fr', k)).tabs).toContain('safety');
    expect(searchSettings('show safety', (k) => translate('en', k)).tabs).toEqual(['safety']);
    expect(searchSettings('osc port', (k) => translate('en', k)).settings.map((d) => d.path)).toEqual(['control.osc.port']);
    expect(searchSettings('   ', (k) => translate('fr', k))).toEqual({ tabs: [], settings: [] });
  });
});
