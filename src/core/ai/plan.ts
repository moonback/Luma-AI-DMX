import type { AiAction, AiEffectSpec } from './actions';

/**
 * Parameter families an action changes on the rig, so a plan can say what it modifies and what it keeps, and a request
 * that protects a family (« sans changer les couleurs ») can be enforced. Pure: shared by the core and the renderer.
 */
export const PARAM_FAMILIES = ['intensity', 'color', 'position', 'beam', 'effects', 'tempo'] as const;
export type ParamFamily = (typeof PARAM_FAMILIES)[number];

export const FAMILY_LABELS: Record<ParamFamily, string> = {
  intensity: 'intensité', color: 'couleur', position: 'position', beam: 'faisceau', effects: 'effets', tempo: 'tempo',
};

const EFFECT_FAMILIES: Record<AiEffectSpec['effectType'], ParamFamily[]> = {
  fade: ['intensity'], pulse: ['intensity'], chase: ['intensity'], wave: ['intensity'], dimmerWave: ['intensity'], strobe: ['intensity'], bassFollow: ['intensity'],
  rainbow: ['color'], colorCycle: ['color'], brightnessColor: ['color', 'intensity'],
  panTilt: ['position'], randomMove: ['position'], fan: ['position'],
};

export const effectFamilies = (e: AiEffectSpec['effectType']): ParamFamily[] => EFFECT_FAMILIES[e] ?? [];

/** Families the action changes live (stored scenes, cues and sequences change nothing until played). `null` = unknown (a whole scene). */
export function actionFamilies(a: AiAction): ParamFamily[] | null {
  switch (a.type) {
    case 'setIntensity': return ['intensity'];
    case 'setColor': return ['color'];
    case 'setPosition': return ['position'];
    case 'setBeam': return ['beam'];
    case 'startEffect': return effectFamilies(a.effect.effectType);
    case 'stopEffect': case 'adjustEffect': return ['effects'];
    case 'setBpm': return ['tempo'];
    case 'createScene':
      if (!a.apply) return [];
      return [...new Set(a.look.flatMap((p): ParamFamily[] => [
        ...(p.level !== undefined ? ['intensity' as const] : []), ...(p.color || p.colors ? ['color' as const] : []), ...(p.pan !== undefined || p.tilt !== undefined ? ['position' as const] : []),
      ]))];
    case 'applyScene': case 'releaseAi': return null;
    case 'createCue': case 'createSequence': return [];
  }
}

/** Families a whole plan keeps untouched (empty when one action is a whole scene or a release). */
export function keptFamilies(actions: readonly AiAction[]): ParamFamily[] {
  const changed = new Set<ParamFamily>();
  for (const a of actions) {
    const f = actionFamilies(a);
    if (!f) return [];
    f.forEach((x) => changed.add(x));
  }
  return PARAM_FAMILIES.filter((f) => !changed.has(f));
}
