import { z } from 'zod';

export const idSchema = z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/, 'Identifiant invalide');
export const nameSchema = z.string().trim().min(1, 'Nom requis').max(80);
export const dmxValueSchema = z.number().int().min(0).max(255);
export const unitSchema = z.number().min(0).max(1); // normalized attribute value
export const hexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Couleur hexadécimale attendue (#RRGGBB)');
export const MAX_UNIVERSES = 64;
export const universeSchema = z.number().int().min(1).max(MAX_UNIVERSES);
export const addressSchema = z.number().int().min(1).max(512);

/* ------------------------------------------------------------------ */
/* Attributes                                                          */
/* ------------------------------------------------------------------ */

export const BUILTIN_ATTRIBUTES = [
  'dimmer', 'red', 'green', 'blue', 'white', 'amber', 'uv', 'cyan', 'magenta', 'yellow', 'cto', 'colorWheel',
  'warmWhite', 'coldWhite', 'lime', 'indigo', 'colorTemperature', 'colorMacro', 'colorMacroFade',
  'pan', 'tilt', 'panTiltSpeed', 'panTiltMode',
  'shutter', 'strobe', 'gobo', 'goboRotation', 'prism', 'focus', 'zoom', 'iris', 'frost', 'effectWheel', 'zoomMode',
  'gobo2', 'gobo2Rotation', 'prismIndex', 'prismRotation',
  'speed', 'macro', 'control', 'macroSpeed', 'fog', 'fan', 'dimmerCurve',
] as const;
export type BuiltinAttribute = (typeof BUILTIN_ATTRIBUTES)[number];
export const attributeSchema = z.union([
  z.enum(BUILTIN_ATTRIBUTES),
  z.string().regex(/^custom:[a-z0-9][a-z0-9-]{0,31}$/, 'Attribut personnalisé: custom:<nom>'),
]);
export type Attribute = z.infer<typeof attributeSchema>;
/** Value key: an attribute, or "<attribute>#<cell>" for a cell of a multi-cell / multi-head fixture. */
export const attributeKeySchema = z.string().max(48).refine((k) => {
  const [attr, cell, ...rest] = k.split('#');
  return rest.length === 0 && attributeSchema.safeParse(attr).success && (cell === undefined || /^[1-9]\d{0,2}$/.test(cell));
}, 'Attribut inconnu (attribut ou attribut#cellule)');