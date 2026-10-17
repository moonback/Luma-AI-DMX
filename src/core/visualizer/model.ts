import type { FixtureProfile, FixtureType, FixtureValues, Fixture, FixtureMode } from '../model/schemas';
import { displayColor } from '../fixtures/color';
import { rgbToHex } from '../util/math';

/**
 * Renderer-agnostic visual model. The 2D canvas consumes it today; a Three.js / R3F view can consume the same
 * structure (x/y in meters, pan/tilt in degrees, beam angle). This is an approximation, not a photometric simulation.
 */
export interface VisualFixture {
  id: string;
  name: string;
  type: FixtureType;
  x: number;
  y: number;
  rotation: number;
  color: string;
  intensity: number;
  movable: boolean;
  panDeg: number;
  tiltDeg: number;
  beamAngle: number;
}

export function buildVisualModel(
  items: readonly { fixture: Fixture; profile: FixtureProfile; mode: FixtureMode; attributes: string[] }[],
  values: FixtureValues,
): VisualFixture[] {
  return items.map((rf) => {
    const v = values[rf.fixture.id] ?? {};
    const { color, intensity } = displayColor(rf, v);
    const movable = rf.attributes.includes('pan') || rf.attributes.includes('tilt');
    return {
      id: rf.fixture.id,
      name: rf.fixture.name,
      type: rf.profile.type,
      x: rf.fixture.position.x,
      y: rf.fixture.position.y,
      rotation: rf.fixture.rotation,
      color: rgbToHex(color),
      intensity,
      movable,
      panDeg: movable ? ((v.pan ?? 0.5) - 0.5) * rf.profile.physical.panRange : 0,
      tiltDeg: movable ? ((v.tilt ?? 0.5) - 0.5) * rf.profile.physical.tiltRange : 0,
      beamAngle: rf.profile.physical.beamAngle,
    };
  });
}
