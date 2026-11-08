/**
 * Conservative semantic fallback for grandMA2/GDTF-converted channel metadata.
 *
 * The canonical MA2_ATTR table remains authoritative. This resolver is only used
 * when the raw attribute and its subattribute have no direct Luma equivalent.
 * It deliberately returns null when the metadata is too ambiguous.
 */
const token = (value: string | undefined): string =>
  (value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, '');

const has = (value: string, ...needles: string[]): boolean =>
  needles.some((needle) => value.includes(needle));

/** Resolve an unknown MA2 attribute from GDTF feature/preset and human-readable names. */
export function resolveMa2SemanticAttribute(input: {
  attribute?: string;
  subattribute?: string;
  feature?: string;
  preset?: string;
  names?: string[];
}): string | null {
  const sub = token(input.subattribute);
  const feature = token(input.feature);
  const preset = token(input.preset);
  const name = (input.names ?? []).map(token).filter(Boolean).join(' ');
  const semantic = [sub, preset, name].filter(Boolean).join(' ');

  // Explicit functional subattributes are stronger than broad feature families.
  if (has(semantic, 'STROBE')) return 'strobe';
  if (has(semantic, 'SHUTTER', 'FLASH')) return 'shutter';
  if (has(semantic, 'DIMMER', 'INTENSITY')) return 'dimmer';
  if (has(semantic, 'PAN')) return 'pan';
  if (has(semantic, 'TILT')) return 'tilt';
  if (has(semantic, 'GOBO')) return has(semantic, 'ROT', 'ROTATION', 'POSITION') ? 'goboRotation' : 'gobo';
  if (has(semantic, 'PRISM')) return has(semantic, 'ROT', 'ROTATION') ? 'prismRotation' : 'prism';
  if (has(semantic, 'FROST')) return 'frost';
  if (has(semantic, 'IRIS')) return 'iris';
  if (has(semantic, 'ZOOM')) return 'zoom';
  if (has(semantic, 'FOCUS')) return 'focus';
  if (has(semantic, 'CTO')) return 'cto';
  if (has(semantic, 'CTC', 'CTB', 'COLORTEMPERATURE', 'TEMPERATURE')) return 'colorTemperature';
  if (has(semantic, 'COLORRGBRED', 'COLORMIXERR', 'RED')) return 'red';
  if (has(semantic, 'COLORRGBGREEN', 'COLORMIXERG', 'GREEN')) return 'green';
  if (has(semantic, 'COLORRGBBLUE', 'COLORMIXERB', 'BLUE')) return 'blue';
  if (has(semantic, 'AMBER')) return 'amber';
  if (has(semantic, 'CYAN')) return 'cyan';
  if (has(semantic, 'MAGENTA')) return 'magenta';
  if (has(semantic, 'YELLOW')) return 'yellow';
  if (has(semantic, 'COLOR') && has(semantic, 'WHEEL')) return 'colorWheel';
  if (has(semantic, 'COLOR') && has(semantic, 'MACRO')) return 'colorMacro';
  if (has(semantic, 'WHITE')) return has(semantic, 'WARM') ? 'warmWhite' : has(semantic, 'COLD', 'COOL') ? 'coldWhite' : 'white';
  if (has(semantic, 'UV', 'ULTRAVIOLET')) return 'uv';

  // Feature/preset families are intentionally interpreted only with corroborating names.
  if (has(feature, 'COLOR') || has(preset, 'COLOR')) {
    if (has(semantic, 'MACRO')) return 'colorMacro';
    if (has(semantic, 'WHEEL')) return 'colorWheel';
    if (has(semantic, 'MIX', 'RGB', 'COLORMIX')) return null; // component cannot be inferred safely
    if (has(semantic, 'TEMPERATURE', 'CTO', 'CTC', 'CTB')) return 'colorTemperature';
    return null; // "COLOR" alone does not identify a controllable Luma attribute
  }
  if (has(feature, 'BEAM') || has(preset, 'BEAM')) {
    if (has(semantic, 'STROBE', 'SHUTTER', 'FLASH')) return 'shutter';
    if (has(semantic, 'GOBO')) return has(semantic, 'ROT') ? 'goboRotation' : 'gobo';
    if (has(semantic, 'PRISM')) return has(semantic, 'ROT') ? 'prismRotation' : 'prism';
    if (has(semantic, 'FROST')) return 'frost';
    if (has(semantic, 'IRIS')) return 'iris';
    if (has(semantic, 'ZOOM')) return 'zoom';
    if (has(semantic, 'FOCUS')) return 'focus';
  }
  if (has(feature, 'INTENSITY') || has(preset, 'INTENSITY')) return 'dimmer';
  if (has(feature, 'POSITION') || has(preset, 'POSITION')) {
    if (has(semantic, 'PAN')) return 'pan';
    if (has(semantic, 'TILT')) return 'tilt';
  }
  if (has(feature, 'CONTROL') || has(preset, 'CONTROL') || has(feature, 'RESET') || has(preset, 'RESET')) return 'control';
  return null;
}
