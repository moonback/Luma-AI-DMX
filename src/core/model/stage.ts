import { z } from 'zod';
import { idSchema, nameSchema } from './primitives';

/* Stage layout of the visualizer: stage points, saved views, trusses, performers, screens and set pieces / equipment. */

/** Stage layout. `thrust` adds a runway towards the audience; `arena` has the audience all around and no cyclorama. */
export const stageShapeSchema = z.enum(['rect', 'thrust', 'arena']);
export const thrustSchema = z.object({ width: z.number().min(1).max(50), depth: z.number().min(1).max(50) });
/** Named stage point (singer, drummer…), position like fixtures (meters, y upstage) plus the aiming height. */
export const stageMarkerSchema = z.object({
  id: idSchema,
  name: nameSchema,
  x: z.number().min(-100).max(100),
  y: z.number().min(-100).max(100),
  height: z.number().min(0).max(10),
});
export type StageMarker = z.infer<typeof stageMarkerSchema>;
const vec3Schema = z.object({ x: z.number().min(-500).max(500), y: z.number().min(-500).max(500), z: z.number().min(-500).max(500) });
/** Saved 3D camera (world coordinates of the visualizer). */
export const stageViewSchema = z.object({ id: idSchema, name: nameSchema, pos: vec3Schema, target: vec3Schema });
/**
 * Explicit truss. Position = centre (meters, y upstage), `height` = height of the truss axis, `length` = length of a
 * straight truss, diameter of a circle, side of a square, or arm length of a corner / tee / cross junction (measured
 * from the junction node). A totem is a vertical tower from the floor up to `height` (`length` unused). Rotation in
 * degrees around the vertical (counter-clockwise seen from above, 0 = parallel to the stage lip). Supported by towers
 * on the floor, hung from motors, or `none` when it rests on other pieces (totems, junctions).
 */
export const trussShapeSchema = z.enum(['line', 'circle', 'square', 'corner', 'tee', 'cross', 'totem']);
export const trussSchema = z.object({
  id: idSchema,
  name: nameSchema,
  shape: trussShapeSchema,
  x: z.number().min(-100).max(100),
  y: z.number().min(-100).max(100),
  height: z.number().min(0.5).max(30),
  length: z.number().min(0.5).max(60),
  rotation: z.number().min(-360).max(360),
  support: z.enum(['towers', 'hung', 'none']),
  /** Cross-section of the aluminium truss: square box (default, older projects) or triangular. */
  section: z.enum(['square', 'triangle']).optional(),
});
export type Truss = z.infer<typeof trussSchema>;
/** Performer or instrument silhouette (meters, y upstage, rotation like fixtures: 0 = facing the audience). */
export const performerSchema = z.object({
  id: idSchema,
  name: nameSchema,
  kind: z.enum(['standing', 'seated', 'drums', 'keys', 'lectern']),
  x: z.number().min(-100).max(100),
  y: z.number().min(-100).max(100),
  rotation: z.number().min(-360).max(360),
  /** Stage point the performer stands on: the silhouette follows it. */
  markerId: idSchema.nullable().optional(),
});
export type Performer = z.infer<typeof performerSchema>;
/**
 * LED screen / video surface: centre x, y (meters, y upstage), bottom edge `elevation`, size, rotation (0 = facing
 * the audience). Image stored as a small data URL; videos are chosen per session and never saved in the project.
 */
export const screenSchema = z.object({
  id: idSchema,
  name: nameSchema,
  x: z.number().min(-100).max(100),
  y: z.number().min(-100).max(100),
  elevation: z.number().min(0).max(30),
  width: z.number().min(0.2).max(60),
  height: z.number().min(0.2).max(30),
  rotation: z.number().min(-360).max(360),
  source: z.enum(['color', 'image', 'video', 'pixels']),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  image: z.string().max(1_500_000).regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/).nullable().optional(),
  /** Light spill on the surroundings, 0..1. */
  glow: z.number().min(0).max(1),
  /** Modular LED wall: side of one cabinet in meters (seams drawn), absent or 0 = one plain surface. */
  cabinet: z.number().min(0).max(2).optional(),
});
export type StageScreen = z.infer<typeof screenSchema>;
export type StageView = z.infer<typeof stageViewSchema>;
/** Kinds of set pieces and stage equipment (see `core/visualizer/equipment.ts` for their catalogue and parameters). */
export const PROP_KINDS = [
  'riser', 'stairs', 'speaker', 'monitor', 'mic', 'table', 'drape', 'box', 'column',
  'truss-base', 'hoist', 'canopy',
  'line-array', 'sub', 'pa-stand', 'audio-rack',
  'drums', 'cymbal', 'guitar', 'amp', 'keyboard', 'piano', 'music-stand',
  'fog-machine', 'spark-machine', 'co2-jet',
  'backdrop', 'arch',
  'dj-booth', 'console', 'flight-case', 'chair', 'barrier', 'cable',
] as const;
/** Category-specific settings of a set piece (module count, style…), bounded and validated against the catalogue. */
export const propParamsSchema = z.record(z.string().regex(/^[a-zA-Z][a-zA-Z0-9]{0,31}$/), z.union([z.number().min(-1000).max(1000), z.string().max(120), z.boolean()]))
  .refine((o) => Object.keys(o).length <= 24, { message: 'Trop de paramètres' });
/**
 * Set piece or stage equipment from the library (riser, line array, drum kit, LED arch…): centre x, y (meters,
 * y upstage), footprint width × depth, height, raised by `elevation` (stacking, flown speakers), rotation like trusses.
 * `params` holds the settings of its kind; `hidden` / `locked` are editor states; `model` an imported GLB (data URL)
 * drawn in place of the procedural geometry, fitted to the footprint.
 */
export const propSchema = z.object({
  id: idSchema,
  name: nameSchema,
  kind: z.enum(PROP_KINDS),
  x: z.number().min(-100).max(100),
  y: z.number().min(-100).max(100),
  width: z.number().min(0.05).max(40),
  depth: z.number().min(0.05).max(40),
  height: z.number().min(0.05).max(20),
  elevation: z.number().min(0).max(20),
  rotation: z.number().min(-360).max(360),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  params: propParamsSchema.optional(),
  hidden: z.boolean().optional(),
  locked: z.boolean().optional(),
  model: z.string().max(6_000_000).regex(/^data:model\/gltf-binary;base64,[A-Za-z0-9+/=]+$/).nullable().optional(),
});
export type StageProp = z.infer<typeof propSchema>;

