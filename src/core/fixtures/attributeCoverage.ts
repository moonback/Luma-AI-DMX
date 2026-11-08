import { BUILTIN_ATTRIBUTES } from '../model/primitives';
import { attributeClass, attributeLabel, type AttributeClass } from './attributes';

export type AttributeSupportLevel = 'native' | 'generic' | 'unsupported';

export interface AttributeCoverageEntry {
  gdtfAttribute: string;
  lumaAttribute: string;
  support: AttributeSupportLevel;
  attributeClass: AttributeClass | 'unknown';
  label: string;
  explanation: string;
}

export interface AttributeCoverageReport {
  totalMappings: number;
  native: number;
  generic: number;
  unsupported: number;
  entries: AttributeCoverageEntry[];
}

/**
 * Features with dedicated semantic consumers beyond the generic DMX channel path:
 * colour conversion/visualization, virtual dimmer, pan/tilt effects and shutter blackout.
 * Everything else that is a known built-in still reaches the output as a normalized channel value,
 * but must not be described as having a dedicated Luma behavior.
 */
const NATIVE_CONSUMERS = new Set([
  'dimmer', 'red', 'green', 'blue', 'white', 'amber', 'uv', 'cyan', 'magenta', 'yellow',
  'warmWhite', 'coldWhite', 'lime', 'indigo', 'colorWheel', 'pan', 'tilt', 'shutter',
]);

/**
 * Audits GDTF -> Luma mappings against the actual model vocabulary and the engine's generic
 * normalized-value pipeline. This deliberately distinguishes a DMX-pass-through capability
 * from a feature-specific implementation.
 */
export function buildAttributeCoverageReport(mapping: Readonly<Record<string, string>>): AttributeCoverageReport {
  const builtins = new Set<string>(BUILTIN_ATTRIBUTES);
  const entries = Object.entries(mapping).map(([gdtfAttribute, lumaAttribute]): AttributeCoverageEntry => {
    const known = builtins.has(lumaAttribute);
    const support: AttributeSupportLevel = !known
      ? 'unsupported'
      : NATIVE_CONSUMERS.has(lumaAttribute) ? 'native' : 'generic';
    return {
      gdtfAttribute,
      lumaAttribute,
      support,
      attributeClass: known ? attributeClass(lumaAttribute) : 'unknown',
      label: known ? attributeLabel(lumaAttribute) : lumaAttribute,
      explanation: !known
        ? 'La cible ne fait pas partie du vocabulaire natif ; elle ne peut pas être considérée comme prise en charge.'
        : support === 'native'
          ? 'La valeur est consommée par un comportement spécialisé du moteur ou du visualiseur.'
          : 'La valeur est acceptée, fusionnée et transmise au canal DMX, sans comportement spécialisé garanti dans Luma.',
    };
  }).sort((a, b) => a.gdtfAttribute.localeCompare(b.gdtfAttribute));

  return {
    totalMappings: entries.length,
    native: entries.filter((entry) => entry.support === 'native').length,
    generic: entries.filter((entry) => entry.support === 'generic').length,
    unsupported: entries.filter((entry) => entry.support === 'unsupported').length,
    entries,
  };
}
