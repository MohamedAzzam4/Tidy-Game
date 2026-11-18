/**
 * Tidy Tapes — runtime art-pilot state (v3 §3).
 *
 * The walnut cabinet's GEOMETRY (unit rect, slot centers, row rects) is fixed
 * regardless of this state; this toggle only decides whether the pilot corner
 * renders with the uploaded pack art or the procedural fallback look, so the
 * same-zoom before/after comparison never perturbs the board or the saves.
 * Persisted through save settings (`pilotArt`).
 */
import { ART_PILOT } from './config';

class ArtState {
  pilotArt: boolean = ART_PILOT.enabled;
}

export const artState = new ArtState();
